import { describe, expect, it } from 'vitest';
import { getPulse } from '../src/lib/pulse.js';

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
