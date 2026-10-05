/** Mapeia payloads de reports → linhas das facts. Sem I/O e sem e-mail em claro. */

export const ISSUE_TYPES = new Set([
  'Bug/Erro',
  'Acesso e permissões',
  'Financeiro/FORE',
  'Integrações',
  'Relatórios',
  'Dúvidas operacionais',
  'Outros',
]);

export const CATEGORIES = new Set([
  'NOVA FEATURE',
  'SUPORTE',
  'BUG',
  'CALL',
  'ROTINA',
  'SEM CATEGORIA',
]);

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function normalizeProduct(value, fallback = 'OS2') {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'OS2' || v === 'FORE' || v === 'GERAL' || v === 'ALL') return v;
  return fallback;
}

function fnv(input) {
  let h = 2166136261;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function parseFlexibleDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  let y;
  let m;
  let d;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!br) return null;
    d = Number(br[1]);
    m = Number(br[2]);
    y = Number(br[3]);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Segunda-feira ISO (YYYY-MM-DD) da data do formulário. */
export function weekStartIso(value) {
  const dt = value instanceof Date ? value : parseFlexibleDate(value);
  if (!dt) return null;
  const day = dt.getUTCDay() || 7;
  const monday = new Date(dt);
  monday.setUTCDate(dt.getUTCDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}

export function monthKeyFromDate(value) {
  const dt = value instanceof Date ? value : parseFlexibleDate(value);
  if (!dt) return null;
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${m}`;
}

function isoWeekParts(dt) {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { isoYear, isoWeek };
}

export function dimDateRow(isoDate) {
  const dt = parseFlexibleDate(isoDate);
  if (!dt) return null;
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  const monthKey = `${y}-${String(m).padStart(2, '0')}`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const { isoYear, isoWeek } = isoWeekParts(dt);
  return {
    date_id: dt.toISOString().slice(0, 10),
    year: y,
    quarter: Math.ceil(m / 3),
    month: m,
    month_key: monthKey,
    week_of_month: Math.min(5, Math.ceil(day / 7)),
    week_start: weekStartIso(dt),
    iso_year: isoYear,
    iso_week: isoWeek,
    is_month_end: day === last,
  };
}

export function entryReportMonth(entry) {
  if (!entry) return null;
  return (
    entry.reportMonth ||
    entry.payload?.meta?.reportMonth ||
    entry.payload?.reportMonth ||
    null
  );
}

function payloadData(entry) {
  return entry?.payload?.data || entry?.data || {};
}

/**
 * O CSV do Drag é um board único do LandscapeOS 2.
 * Tickets FORE ficam na coluna fore_tickets, não como produto separado.
 */
export function supportProductCode() {
  return 'OS2';
}

export function mapSuporteMonth(entry) {
  const data = payloadData(entry);
  const reportMonth = entryReportMonth(entry);
  if (!reportMonth) return [];

  const tickets = Number(data.realTickets || 0);
  const closed = Number(data.closed || 0);
  const bugs = Array.isArray(data.bugs) ? data.bugs.length : Number(data.bugs || 0);

  return [
    {
      report_month: reportMonth,
      product_code: supportProductCode(),
      source_report_id: entry.id ?? null,
      total_cards: Number(data.total || 0),
      notifications: Number(data.notifications || 0),
      tickets,
      closed,
      open_tickets: Number(data.openTickets ?? Math.max(tickets - closed, 0)),
      bugs,
      fore_emails: Number(data.foreEmails || 0),
      fore_tickets: Number(data.foreTickets || 0),
      action_required: Number(data.actionRequired || 0),
      awaiting: Number(data.awaiting || 0),
      in_progress: Number(data.inProgress || 0),
      unique_contacts: Number(data.uniqueContacts || 0),
      closed_rate: tickets > 0 ? round2((100 * closed) / tickets) : null,
      cats_json: data.cats || [],
      env_type_matrix: data.envTypeMatrix || [],
      category_insights: data.categoryInsights || [],
      custom_insights: data.customInsights || null,
      source: 'drag',
    },
  ];
}

function ticketSources(data) {
  if (Array.isArray(data.tickets) && data.tickets.length) return data.tickets;
  return (data.bugs || []).map((b) => ({
    card_name: b.name || b.card_name || 'bug',
    is_bug: true,
    issue_type: 'Bug/Erro',
  }));
}

/**
 * @param {object} entry
 * @param {{ hashEmail?: (email: string) => (string|null) }} [opts]
 */
export function mapSuporteTickets(entry, opts = {}) {
  const data = payloadData(entry);
  const reportMonth = entryReportMonth(entry);
  if (!entry?.id || !reportMonth) return [];

  const hashEmail = opts.hashEmail || (() => null);
  const board = data.dragMeta?.board || null;

  return ticketSources(data).map((t, i) => {
    const cardName = String(t.card_name || t.name || 'card');
    const email = t.email || t.contact_email || null;
    const issue = ISSUE_TYPES.has(t.issue_type) ? t.issue_type : t.is_bug === false ? 'Outros' : 'Bug/Erro';
    const namedFore = /FORE/i.test(cardName) && !/OS2|LANDSCAPE/i.test(cardName);
    return {
      ticket_id: t.ticket_id || `t${i}_${fnv(`${reportMonth}|${cardName}`)}`,
      source_report_id: entry.id,
      report_month: reportMonth,
      board,
      card_name: cardName,
      product_code: normalizeProduct(t.product_code, namedFore ? 'FORE' : 'OS2'),
      issue_type: issue,
      is_notification: Boolean(t.is_notification),
      is_closed: Boolean(t.is_closed),
      is_bug: Boolean(t.is_bug),
      is_action_required: Boolean(t.is_action_required),
      is_awaiting_response: Boolean(t.is_awaiting_response),
      is_in_progress: Boolean(t.is_in_progress),
      contact_email_hash: email ? hashEmail(email) : t.contact_email_hash || null,
      tenant_id: t.tenant_id || null,
      feature_key: t.feature_key || null,
      tags: Array.isArray(t.tags) ? t.tags : [],
      categories: Array.isArray(t.categories) ? t.categories : [],
      source: 'drag',
    };
  });
}

export function mapHorasEffort(entry) {
  const reportMonth = entryReportMonth(entry);
  const rows = entry?.payload?.rows || [];
  if (!reportMonth) return [];

  return rows
    .map((r) => {
      const minutes = Number(r.mins ?? r.minutes ?? 0);
      const week = Number(r.sem ?? r.week_of_month ?? 1);
      if (!Number.isFinite(minutes) || minutes <= 0) return null;
      if (!Number.isFinite(week)) return null;
      const cat = String(r.cat || r.category || '').trim().toUpperCase();
      return {
        source_report_id: entry.id ?? null,
        report_month: reportMonth,
        week_of_month: Math.min(5, Math.max(1, week)),
        product_code: normalizeProduct(r.sis || r.product_code, 'GERAL'),
        category: CATEGORIES.has(cat) ? cat : 'SEM CATEGORIA',
        minutes,
        description: r.desc || r.description || null,
        source: 'manual_horas',
      };
    })
    .filter(Boolean);
}

function clampRag(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(3, Math.max(0, Math.round(n)));
}

export function mapOnePager(entry) {
  const payload = entry?.payload || {};
  const state = payload.state || {};
  const tx = payload.tx || {};
  const week = weekStartIso(payload.data || payload.meta?.period || entry?.period);
  if (!week) return null;

  const produto = payload.produto || '';
  const productCode =
    /fore/i.test(produto) && !/os\s*2|landscape/i.test(produto) ? 'FORE' : 'OS2';

  return {
    source_report_id: entry.id ?? null,
    week_start: week,
    product_code: productCode,
    product_label: produto || null,
    stakeholder: payload.stakeholder || null,
    rag_scope: clampRag(state.esc),
    rag_roadmap: clampRag(state.rm),
    rag_resources: clampRag(state.rec),
    rag_risk: clampRag(state.ri),
    rag_cost: clampRag(state.cu),
    deliveries_text: tx.entregas || null,
    summary_text: tx.resumo || null,
    team_text: tx.equipe || null,
    indicators_text: tx.indicadores || null,
    risks_high_text: tx.rA || null,
    risks_med_text: tx.rM || null,
    risks_low_text: tx.rB || null,
    cur_sprint: Number.isFinite(Number(state.curSprint)) ? Number(state.curSprint) : null,
    roadmap_items: Array.isArray(state.items) ? state.items : [],
    source: 'one_pager',
  };
}

export function usageGrain({ date_id, product_code, event_name, feature_key, tenant_id }) {
  return [date_id, product_code, event_name, feature_key || '', tenant_id || ''].join('|');
}

export function businessGrain({ date_id, product_code, tenant_id }) {
  return [date_id, product_code, tenant_id || ''].join('|');
}

export function toUsageRecords(rows = []) {
  return rows
    .map((r) => {
      const date_id = String(r.date_id || r.date || '').slice(0, 10);
      if (!parseFlexibleDate(date_id)) return null;
      const event_name = String(r.event_name || '').trim();
      if (!event_name) return null;
      const product_code = normalizeProduct(r.product_code, 'OS2');
      const feature_key = r.feature_key ? String(r.feature_key) : null;
      const tenant_id = r.tenant_id ? String(r.tenant_id) : null;
      return {
        usage_grain: usageGrain({ date_id, product_code, event_name, feature_key, tenant_id }),
        date_id,
        product_code,
        event_name,
        feature_key,
        tenant_id,
        users: Number(r.users || 0),
        sessions: Number(r.sessions || 0),
        event_count: Number(r.event_count || 0),
        source: 'ga4',
      };
    })
    .filter(Boolean);
}

export function toBusinessRecords(rows = []) {
  return rows
    .map((r) => {
      const date_id = String(r.date_id || r.date || '').slice(0, 10);
      if (!parseFlexibleDate(date_id)) return null;
      const product_code = normalizeProduct(r.product_code, 'OS2');
      const tenant_id = r.tenant_id ? String(r.tenant_id) : null;
      return {
        business_grain: businessGrain({ date_id, product_code, tenant_id }),
        date_id,
        product_code,
        tenant_id,
        active_users: r.active_users == null ? null : Number(r.active_users),
        sessions: r.sessions == null ? null : Number(r.sessions),
        transactions_count: r.transactions_count == null ? null : Number(r.transactions_count),
        mrr_cents: r.mrr_cents == null ? null : Number(r.mrr_cents),
        plan: r.plan || null,
        backend_errors: r.backend_errors == null ? null : Number(r.backend_errors),
        nps_score: r.nps_score == null ? null : Number(r.nps_score),
        csat_score: r.csat_score == null ? null : Number(r.csat_score),
        extras: r.extras && typeof r.extras === 'object' ? r.extras : {},
        source: 'metabase',
      };
    })
    .filter(Boolean);
}
