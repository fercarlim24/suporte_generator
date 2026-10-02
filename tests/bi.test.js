import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashContactEmail } from '../api/_lib/bi/pii.js';
import { gaConfig, metabaseConfig } from '../api/_lib/bi/config.js';
import {
  mapHorasEffort,
  mapOnePager,
  mapSuporteMonth,
  mapSuporteTickets,
  toUsageRecords,
  weekStartIso,
} from '../src/lib/bi/facts.js';
import {
  filterPulseRows,
  historyEntriesToPulseRows,
  summarizePulse,
} from '../src/lib/bi/pulse.js';

const suporteEntry = {
  id: 42,
  type: 'suporte',
  savedAt: '2026-03-02T12:00:00.000Z',
  payload: {
    meta: { reportMonth: '2026-03' },
    data: {
      total: 12,
      notifications: 2,
      realTickets: 10,
      closed: 4,
      bugs: [{ name: 'Falha no recibo' }, { name: 'Erro FORE pix' }],
      uniqueContacts: 7,
      openTickets: 6,
      foreEmails: 1,
      foreTickets: 2,
      actionRequired: 1,
      awaiting: 0,
      inProgress: 1,
      cats: [['BUG', 2]],
      envTypeMatrix: [{ env: 'OS2', total: 8, types: [] }],
      categoryInsights: [],
      customInsights: 'revisar triagem',
      dragMeta: { board: 'Suporte LS2' },
      tickets: [
        {
          card_name: 'Falha no recibo',
          email: 'Ana@Cliente.com',
          is_bug: true,
          is_closed: false,
          issue_type: 'Bug/Erro',
        },
      ],
    },
  },
};

describe('hashContactEmail', () => {
  it('hashes normalized email plus salt and never returns the raw address', () => {
    const salt = 'pepper';
    const hash = hashContactEmail('  Ana@Cliente.com ', salt);
    const expected = createHash('sha256').update('ana@cliente.com' + salt).digest('hex');
    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('ana@');
    expect(hashContactEmail('ana@cliente.com', 'other')).not.toBe(hash);
    expect(hashContactEmail('ana@cliente.com', '')).toBeNull();
    expect(hashContactEmail('', salt)).toBeNull();
  });
});

describe('mapSuporteMonth', () => {
  it('maps the current support payload onto fact_support_month', () => {
    const [row] = mapSuporteMonth(suporteEntry);
    expect(row.report_month).toBe('2026-03');
    expect(row.product_code).toBe('OS2');
    expect(row.tickets).toBe(10);
    expect(row.closed).toBe(4);
    expect(row.bugs).toBe(2);
    expect(row.unique_contacts).toBe(7);
    expect(row.closed_rate).toBe(40);
    expect(row.env_type_matrix).toEqual(suporteEntry.payload.data.envTypeMatrix);
    expect(row.custom_insights).toBe('revisar triagem');
    expect(row.source_report_id).toBe(42);
    expect(JSON.stringify(row)).not.toMatch(/cliente\.com/i);
  });
});

describe('mapSuporteTickets', () => {
  it('stores only the email hash on ticket facts', () => {
    const [ticket] = mapSuporteTickets(suporteEntry, {
      hashEmail: (email) => hashContactEmail(email, 'pepper'),
    });
    expect(ticket.is_bug).toBe(true);
    expect(ticket.issue_type).toBe('Bug/Erro');
    expect(ticket.board).toBe('Suporte LS2');
    expect(ticket.contact_email_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(ticket)).not.toMatch(/cliente\.com/i);
    expect(ticket.email).toBeUndefined();
  });
});

describe('pulse aggregation', () => {
  const rows = historyEntriesToPulseRows([
    suporteEntry,
    {
      id: 7,
      type: 'horas',
      savedAt: '2026-03-03T12:00:00.000Z',
      reportMonth: '2026-03',
      payload: {
        reportMonth: '2026-03',
        rows: [
          { sem: '1', sis: 'OS2', cat: 'BUG', mins: 120, desc: 'correção' },
          { sem: '2', sis: 'OS2', cat: 'NOVA FEATURE', mins: 60, desc: 'recibo' },
          { sem: '1', sis: 'FORE', cat: 'SUPORTE', mins: 30, desc: 'nf' },
        ],
      },
    },
    {
      id: 8,
      type: 'horas',
      savedAt: '2026-04-02T12:00:00.000Z',
      payload: {
        meta: { reportMonth: '2026-04' },
        rows: [{ sem: '1', sis: 'OS2', cat: 'BUG', mins: 60, desc: 'follow-up' }],
      },
    },
    {
      id: 9,
      type: 'suporte',
      savedAt: '2026-04-02T12:00:00.000Z',
      payload: {
        meta: { reportMonth: '2026-04' },
        data: { realTickets: 5, closed: 5, bugs: [], uniqueContacts: 3 },
      },
    },
  ]);

  it('rolls support and effort into monthly pulse rows', () => {
    const march = rows.find((r) => r.period === '2026-03' && r.product_code === 'OS2');
    expect(march.tickets).toBe(10);
    expect(march.closed_rate).toBe(40);
    expect(march.bugs).toBe(2);
    expect(march.unique_contacts).toBe(7);
    expect(march.dev_hours).toBe(3);
    expect(march.pct_bugfix).toBe(66.67);
    expect(rows.find((r) => r.period === '2026-03' && r.product_code === 'FORE').dev_hours).toBe(0.5);
  });

  it('summarizes a filtered fixture range', () => {
    const os2 = filterPulseRows(rows, { from: '2026-03', to: '2026-04', product: 'OS2' });
    const summary = summarizePulse(os2);
    expect(summary.tickets).toBe(15);
    expect(summary.closed).toBe(9);
    expect(summary.closed_rate).toBe(60);
    expect(summary.bugs).toBe(2);
    expect(summary.unique_contacts).toBe(10);
    expect(summary.dev_hours).toBe(4);
    expect(summary.hasUsage).toBe(false);
    expect(summary.hasBusiness).toBe(false);
    expect(summary.mau_proxy).toBeNull();
    expect(filterPulseRows(rows, { product: 'FORE' })).toHaveLength(1);
  });

  it('uses the later snapshot when the same month is saved twice', () => {
    const replaced = historyEntriesToPulseRows([
      suporteEntry,
      {
        ...suporteEntry,
        savedAt: '2026-03-20T12:00:00.000Z',
        payload: {
          ...suporteEntry.payload,
          data: { ...suporteEntry.payload.data, realTickets: 11, closed: 11, bugs: [{ name: 'um' }] },
        },
      },
    ]);
    const march = replaced.find((r) => r.period === '2026-03');
    expect(march.tickets).toBe(11);
    expect(march.bugs).toBe(1);
  });
});

describe('horas and one pager mapping', () => {
  it('maps manual hour rows and clamps unknown categories', () => {
    const facts = mapHorasEffort({
      id: 3,
      reportMonth: '2026-01',
      payload: { rows: [{ sem: '9', sis: 'FORE', cat: 'livre', mins: 15, desc: 'nota' }, { sem: '1', mins: 0 }] },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0].week_of_month).toBe(5);
    expect(facts[0].product_code).toBe('FORE');
    expect(facts[0].category).toBe('SEM CATEGORIA');
    expect(facts[0].minutes).toBe(15);
  });

  it('derives week_start from the one pager date', () => {
    expect(weekStartIso('02/10/2026')).toBe('2026-09-28');
    const row = mapOnePager({
      id: 4,
      payload: {
        data: '02/10/2026',
        produto: 'LandscapeOS 2',
        stakeholder: 'time',
        state: { esc: 2, rm: 1, rec: 0, ri: 2, cu: 1, curSprint: 3, items: [{ n: 'A' }] },
        tx: { resumo: 'risco no recibo', entregas: 'download', rA: 'alto' },
      },
    });
    expect(row.week_start).toBe('2026-09-28');
    expect(row.product_code).toBe('OS2');
    expect(row.rag_risk).toBe(2);
    expect(row.rag_scope).toBe(2);
    expect(row.summary_text).toBe('risco no recibo');
    expect(row.roadmap_items).toEqual([{ n: 'A' }]);
  });
});

describe('sync contracts', () => {
  it('treats missing GA and Metabase env as not configured', () => {
    expect(gaConfig({}).configured).toBe(false);
    expect(metabaseConfig({ METABASE_URL: 'https://mb.example' }).configured).toBe(false);
    expect(
      gaConfig({
        GA_PROPERTY_ID: '123',
        GA_CLIENT_EMAIL: 'a@b.c',
        GA_PRIVATE_KEY: 'key',
      }).configured,
    ).toBe(true);
  });

  it('builds usage grains without keeping unexpected emails', () => {
    const [row] = toUsageRecords([
      {
        date_id: '2026-03-01',
        event_name: 'feature_use',
        feature_key: 'recibo.download',
        tenant_id: 'acme',
        users: 4,
        event_count: 9,
        email: 'segredo@cliente.com',
      },
    ]);
    expect(row.usage_grain).toBe('2026-03-01|OS2|feature_use|recibo.download|acme');
    expect(row.email).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain('segredo');
  });
});
