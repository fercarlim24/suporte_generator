import { describe, expect, it } from 'vitest';
import { gaFromCloud, getPulse, metabaseFromCloud } from '../src/lib/pulse.js';

const suporte = {
  id: 1,
  type: 'suporte',
  version: 2,
  savedAt: '2026-09-30T15:00:00.000Z',
  reportMonth: '2026-09',
  payload: {
    meta: { reportMonth: '2026-09' },
    data: {
      realTickets: 10,
      closed: 4,
      bugs: [{ name: 'Falha no recibo' }, { name: 'Erro FORE pix' }],
      foreTickets: 3,
      notifications: 2,
      cats: [['ACESSO', 4]],
    },
  },
};

const horas = {
  id: 2,
  type: 'horas',
  version: 2,
  savedAt: '2026-09-28T12:00:00.000Z',
  reportMonth: '2026-09',
  payload: {
    meta: { reportMonth: '2026-09' },
    rows: [
      { sem: '1', sis: 'OS2', cat: 'BUG', mins: 120 },
      { sem: '1', sis: 'OS2', cat: 'NOVA FEATURE', mins: 60 },
      { sem: '2', sis: 'FORE', cat: 'SUPORTE', mins: 30 },
    ],
  },
};

const op = {
  id: 3,
  type: 'op',
  version: 2,
  savedAt: '2026-09-20T12:00:00.000Z',
  period: '15/09/2026',
  payload: {
    produto: 'LandscapeOS 2',
    data: '15/09/2026',
    state: { esc: 0, rm: 1, rec: 1, ri: 2, cu: 0 },
    tx: { resumo: 'Semana estável', rA: 'Prazo do recibo' },
  },
};

describe('getPulse empty states', () => {
  it('keeps GA and Metabase empty and hides insights that need them', () => {
    const pulse = getPulse({ product: 'OS2', period: '2026-09', entries: [], ga: null, metabase: null });
    expect(pulse.kpis.mau.value).toBeNull();
    expect(pulse.kpis.mau.missing).toBe('ga');
    expect(pulse.kpis.mau.sub).toMatch(/Google Analytics/);
    expect(pulse.kpis.tenants.missing).toBe('metabase');
    expect(pulse.kpis.tenants.sub).toMatch(/não configurado/);
    expect(pulse.kpis.tickets.missing).toBe('csv');
    expect(pulse.freshness).toEqual([
      expect.objectContaining({ source: 'Suporte', mode: 'upload manual', ok: false }),
      expect.objectContaining({ source: 'GA', mode: 'sync', ok: false }),
      expect.objectContaining({ source: 'Metabase', mode: 'sync', ok: false }),
      expect.objectContaining({ source: 'Horas', mode: 'save manual', ok: false }),
      expect.objectContaining({ source: 'One Pager', mode: 'save manual', ok: false }),
    ]);
    expect(pulse.insights).toEqual([]);
    expect(pulse.features).toEqual([]);
    expect(pulse.tenants).toEqual([]);
    expect(pulse.trend).toHaveLength(6);
    expect(pulse.trend.at(-1).current).toBe(true);
  });
});

describe('getPulse from saved reports', () => {
  const pulse = getPulse({
    product: 'OS2',
    period: '2026-09',
    entries: [suporte, horas, op],
    ga: null,
    metabase: null,
  });

  it('fills support, hours and one pager KPIs', () => {
    expect(pulse.kpis.tickets.value).toBe(10);
    expect(pulse.kpis.tickets.sub).toBe('40% fechados');
    expect(pulse.kpis.bugs.value).toBe(2);
    expect(pulse.kpis.devHours.value).toBe(3);
    expect(pulse.kpis.devHours.sub).toBe('67% bugfix');
    expect(pulse.kpis.rag.value).toBe(2);
    expect(pulse.kpis.mau.value).toBeNull();
    expect(pulse.kpis.ticketsPerMau.value).toBeNull();
  });

  it('builds effort, RAG and the bug tax insight', () => {
    expect(pulse.effort.find((row) => row.category === 'BUG')).toMatchObject({ os2: 120, fore: 0 });
    expect(pulse.rag.map((row) => row.label)).toContain('Bloqueado');
    expect(pulse.risks[0]).toEqual({ level: 'Alto', text: 'Prazo do recibo' });
    expect(pulse.insights.map((item) => item.id)).toEqual(['bug-tax']);
    expect(pulse.freshness.find((item) => item.source === 'Suporte').ok).toBe(true);
    expect(pulse.freshness.find((item) => item.source === 'GA').ok).toBe(false);
  });

  it('keeps hours from another product out of the open one', () => {
    const os2Hours = {
      ...horas,
      id: 4,
      savedAt: '2026-09-01T12:00:00.000Z',
      payload: {
        meta: { reportMonth: '2026-09' },
        rows: [{ sem: '1', sis: 'OS2', cat: 'BUG', mins: 180 }],
      },
    };
    const foreHours = {
      ...horas,
      id: 5,
      savedAt: '2026-09-29T12:00:00.000Z',
      payload: {
        meta: { reportMonth: '2026-09' },
        rows: [{ sem: '1', sis: 'FORE', cat: 'SUPORTE', mins: 60 }],
      },
    };
    const os2 = getPulse({
      product: 'OS2',
      period: '2026-09',
      entries: [os2Hours, foreHours],
      ga: null,
      metabase: null,
    });
    expect(os2.kpis.devHours).toMatchObject({ value: 3, sub: '100% bugfix' });
    expect(os2.effort.find((row) => row.category === 'BUG')).toMatchObject({ os2: 180, fore: 0 });
    expect(os2.effort.find((row) => row.category === 'SUPORTE')).toBeUndefined();
  });

  it('uses FORE tickets when that product is selected', () => {
    const fore = getPulse({
      product: 'FORE',
      period: '2026-09',
      entries: [suporte, horas, op],
      ga: null,
      metabase: null,
    });
    expect(fore.kpis.tickets.value).toBe(3);
    expect(fore.kpis.bugs.value).toBe(1);
    expect(fore.kpis.devHours.value).toBe(0.5);
    expect(fore.kpis.rag.value).toBeNull();
  });
});

describe('getPulse with GA and Metabase', () => {
  it('shows dor × uso when usage and tickets meet on a feature', () => {
    const pulse = getPulse({
      product: 'OS2',
      period: '2026-09',
      entries: [suporte],
      ga: {
        asOf: '2026-09-30T18:00:00.000Z',
        byPeriod: { '2026-09': { OS2: 1000, FORE: 400 } },
        features: [
          { feature_key: 'recibos', product_code: 'OS2', event_count: 80, tickets: 4, delta_usage: -12 },
        ],
      },
      metabase: null,
    });
    expect(pulse.kpis.mau.value).toBe(1000);
    expect(pulse.kpis.ticketsPerMau.value).toBe(10);
    expect(pulse.features[0]).toMatchObject({ feature_key: 'recibos', pain: true });
    expect(pulse.insights.map((item) => item.id)).toEqual(expect.arrayContaining(['pain', 'compare']));
    expect(pulse.freshness.find((item) => item.source === 'GA').ok).toBe(true);
  });

  it('flags a tenant when usage falls and tickets rise', () => {
    const pulse = getPulse({
      product: 'OS2',
      period: '2026-09',
      entries: [],
      ga: null,
      metabase: {
        asOf: '2026-09-30T18:10:00.000Z',
        activeTenants: 12,
        backendErrors: 3,
        tenants: [{ tenant_name: 'Acme', delta_usage: -20, delta_tickets: 4, rag: 'vermelho' }],
      },
    });
    expect(pulse.kpis.tenants).toMatchObject({ value: 12, sub: '3 erros backend' });
    expect(pulse.tenants[0]).toMatchObject({ tenant: 'Acme', risk: true });
    expect(pulse.insights.map((item) => item.id)).toEqual(['risk']);
    expect(pulse.freshness.find((item) => item.source === 'Metabase').ok).toBe(true);
  });
});

describe('cloud adapters', () => {
  it('returns null until GA or Metabase is configured', () => {
    expect(gaFromCloud({ integrations: { ga4: false }, rows: [], features: [] })).toBeNull();
    expect(metabaseFromCloud({ integrations: { metabase: false }, rows: [], tenants: [] }, 'OS2')).toBeNull();
  });

  it('maps mart rows into the pulse adapters', () => {
    const model = {
      integrations: { ga4: true, metabase: true },
      rows: [{ period: '2026-09', product_code: 'OS2', mau_proxy: 800, active_tenants: 5, backend_errors: 1 }],
      features: [{ feature_key: 'recibos', product_code: 'OS2', event_count: 10, tickets: 2 }],
      tenants: [{ tenant_name: 'Acme', product_code: 'OS2', delta_usage: -5, delta_tickets: 2 }],
      freshness: [{ source: 'ga4', as_of: '2026-09-30T18:00:00.000Z' }],
    };
    expect(gaFromCloud(model).byPeriod['2026-09'].OS2).toBe(800);
    expect(gaFromCloud(model).features[0].feature_key).toBe('recibos');
    expect(metabaseFromCloud(model, 'OS2')).toMatchObject({ activeTenants: 5, backendErrors: 1 });
  });
});
