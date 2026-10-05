import {
  entryReportMonth,
  mapHorasEffort,
  mapOnePager,
  mapSuporteMonth,
  monthKeyFromDate,
  round2,
} from './facts.js';

function asNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function blankPulse(period, product_code) {
  return {
    period,
    product_code,
    tickets: null,
    closed: null,
    closed_rate: null,
    bugs: null,
    unique_contacts: null,
    notifications: null,
    dev_hours: null,
    dev_minutes: null,
    bugfix_minutes: null,
    feature_minutes: null,
    support_minutes: null,
    pct_bugfix: null,
    mau_proxy: null,
    sessions: null,
    feature_events: null,
    active_tenants: null,
    backend_errors: null,
    rag_risk_avg: null,
    rag_scope_avg: null,
    rag_roadmap_avg: null,
    summary_text: null,
    deliveries_text: null,
    risks_high_text: null,
    support_as_of: null,
    health_as_of: null,
  };
}

const ADDITIVE = [
  'tickets',
  'closed',
  'bugs',
  'unique_contacts',
  'notifications',
  'dev_minutes',
  'bugfix_minutes',
  'feature_minutes',
  'support_minutes',
  'mau_proxy',
  'sessions',
  'feature_events',
  'active_tenants',
  'backend_errors',
];

function add(prev, next) {
  if (next == null) return prev;
  if (prev == null) return next;
  return prev + next;
}

function touchAvg(row, key, value) {
  if (value == null) return;
  const sumK = `_${key}_sum`;
  const nK = `_${key}_n`;
  row[sumK] = (row[sumK] || 0) + value;
  row[nK] = (row[nK] || 0) + 1;
}

function mergeInto(prev, row) {
  ADDITIVE.forEach((key) => {
    prev[key] = add(prev[key], asNum(row[key]));
  });
  ['rag_risk_avg', 'rag_scope_avg', 'rag_roadmap_avg'].forEach((key) => {
    touchAvg(prev, key, asNum(row[key]));
  });
  ['summary_text', 'deliveries_text', 'risks_high_text', 'support_as_of', 'health_as_of'].forEach(
    (key) => {
      if (row[key]) prev[key] = row[key];
    },
  );
  return prev;
}

function finalize(row) {
  ['rag_risk_avg', 'rag_scope_avg', 'rag_roadmap_avg'].forEach((key) => {
    const n = row[`_${key}_n`];
    if (n) row[key] = round2(row[`_${key}_sum`] / n);
    delete row[`_${key}_sum`];
    delete row[`_${key}_n`];
  });
  if (row.dev_minutes != null) row.dev_hours = round2(row.dev_minutes / 60);
  if (row.tickets) row.closed_rate = round2((100 * (row.closed || 0)) / row.tickets);
  else row.closed_rate = row.tickets === 0 ? null : row.closed_rate;
  if (row.dev_minutes) row.pct_bugfix = round2((100 * (row.bugfix_minutes || 0)) / row.dev_minutes);
  else row.pct_bugfix = null;
  return row;
}

function latestBy(entries, type, keyFn) {
  const map = new Map();
  const sorted = entries
    .filter((e) => e.type === type && e.payload && !e.legacy)
    .slice()
    .sort((a, b) => String(a.savedAt || '').localeCompare(String(b.savedAt || '')));
  sorted.forEach((e) => {
    const key = keyFn(e);
    if (key) map.set(key, e);
  });
  return [...map.values()];
}

function monthFactToPartial(row, asOf) {
  return {
    period: row.report_month,
    product_code: row.product_code,
    tickets: row.tickets,
    closed: row.closed,
    bugs: row.bugs,
    unique_contacts: row.unique_contacts,
    notifications: row.notifications,
    support_as_of: asOf || null,
  };
}

function effortToPartials(facts) {
  const grouped = new Map();
  facts.forEach((f) => {
    const key = `${f.report_month}|${f.product_code}`;
    const cur = grouped.get(key) || {
      period: f.report_month,
      product_code: f.product_code,
      dev_minutes: 0,
      bugfix_minutes: 0,
      feature_minutes: 0,
      support_minutes: 0,
    };
    cur.dev_minutes += f.minutes;
    if (f.category === 'BUG') cur.bugfix_minutes += f.minutes;
    if (f.category === 'NOVA FEATURE') cur.feature_minutes += f.minutes;
    if (f.category === 'SUPORTE') cur.support_minutes += f.minutes;
    grouped.set(key, cur);
  });
  return [...grouped.values()];
}

/**
 * Agrega relatórios locais (suporte, horas, one pager) no formato de mart_product_pulse.
 * @param {object[]} entries
 * @param {{ reportMonthOf?: (entry: object) => (string|null) }} [opts]
 */
export function historyEntriesToPulseRows(entries, opts = {}) {
  const monthOf = opts.reportMonthOf || entryReportMonth;
  const withMonth = (entry) => ({ ...entry, reportMonth: monthOf(entry) || entry.reportMonth });
  const list = (entries || []).map(withMonth);
  const partials = [];

  latestBy(list, 'suporte', (e) => e.reportMonth).forEach((entry) => {
    mapSuporteMonth(entry).forEach((row) => partials.push(monthFactToPartial(row, entry.savedAt)));
  });

  latestBy(list, 'horas', (e) => e.reportMonth).forEach((entry) => {
    partials.push(...effortToPartials(mapHorasEffort(entry)));
  });

  latestBy(list, 'op', (e) => {
    const row = mapOnePager(e);
    return row ? `${row.week_start}|${row.product_code}` : null;
  }).forEach((entry) => {
    const health = mapOnePager(entry);
    if (!health) return;
    partials.push({
      period: monthKeyFromDate(health.week_start),
      product_code: health.product_code,
      rag_risk_avg: health.rag_risk,
      rag_scope_avg: health.rag_scope,
      rag_roadmap_avg: health.rag_roadmap,
      summary_text: health.summary_text,
      deliveries_text: health.deliveries_text,
      risks_high_text: health.risks_high_text,
      health_as_of: entry.savedAt || null,
    });
  });

  const merged = new Map();
  partials.forEach((row) => {
    if (!row.period) return;
    const key = `${row.period}|${row.product_code}`;
    const prev = merged.get(key) || blankPulse(row.period, row.product_code);
    merged.set(key, mergeInto(prev, row));
  });

  return [...merged.values()].map(finalize).sort((a, b) => a.period.localeCompare(b.period) || a.product_code.localeCompare(b.product_code));
}

export function filterPulseRows(rows, { from, to, product } = {}) {
  const code = product && product !== 'ALL' ? product : null;
  return (rows || []).filter((r) => {
    if (from && r.period < from) return false;
    if (to && r.period > to) return false;
    if (code && r.product_code !== code) return false;
    return true;
  });
}

function devMinutesOf(row) {
  const direct = asNum(row.dev_minutes);
  if (direct != null) return direct;
  const hours = asNum(row.dev_hours);
  return hours == null ? null : hours * 60;
}

function bugfixMinutesOf(row) {
  const direct = asNum(row.bugfix_minutes);
  if (direct != null) return direct;
  const pct = asNum(row.pct_bugfix);
  const mins = devMinutesOf(row);
  if (pct == null || mins == null) return null;
  return (pct / 100) * mins;
}

/** KPIs do recorte. MAU e tenants usam o pico mensal; tickets e horas somam. */
export function summarizePulse(rows) {
  const byPeriod = rollupPulseByPeriod(rows);
  const sum = (list, pick) => list.reduce((acc, row) => acc + (pick(row) || 0), 0);
  const maxOf = (list, pick) => {
    const vals = list.map(pick).filter((v) => v != null);
    if (!vals.length) return null;
    return Math.max(...vals);
  };

  const tickets = byPeriod.some((r) => r.tickets != null) ? sum(byPeriod, (r) => r.tickets || 0) : null;
  const closed = byPeriod.some((r) => r.closed != null) ? sum(byPeriod, (r) => r.closed || 0) : null;
  const bugs = byPeriod.some((r) => r.bugs != null) ? sum(byPeriod, (r) => r.bugs || 0) : null;
  const uniqueContacts = byPeriod.some((r) => r.unique_contacts != null)
    ? sum(byPeriod, (r) => r.unique_contacts || 0)
    : null;
  const devMinutes = byPeriod.some((r) => devMinutesOf(r) != null)
    ? sum(byPeriod, (r) => devMinutesOf(r) || 0)
    : null;
  const bugfixMinutes = byPeriod.some((r) => bugfixMinutesOf(r) != null)
    ? sum(byPeriod, (r) => bugfixMinutesOf(r) || 0)
    : null;

  const mau = maxOf(byPeriod, (r) => asNum(r.mau_proxy));
  const sessions = byPeriod.some((r) => asNum(r.sessions) != null)
    ? sum(byPeriod, (r) => asNum(r.sessions) || 0)
    : null;
  const tenants = maxOf(byPeriod, (r) => asNum(r.active_tenants));
  const ragVals = byPeriod.map((r) => asNum(r.rag_risk_avg)).filter((v) => v != null);

  return {
    tickets,
    closed,
    closed_rate: tickets ? round2((100 * (closed || 0)) / tickets) : null,
    bugs,
    unique_contacts: uniqueContacts,
    dev_hours: devMinutes == null ? null : round2(devMinutes / 60),
    pct_bugfix: devMinutes ? round2((100 * (bugfixMinutes || 0)) / devMinutes) : null,
    mau_proxy: mau,
    sessions,
    active_tenants: tenants,
    rag_risk_avg: ragVals.length ? round2(ragVals.reduce((a, b) => a + b, 0) / ragVals.length) : null,
    tickets_per_mau: tickets != null && mau ? round2(tickets / mau) : null,
    hasSupport: byPeriod.some((r) => r.tickets != null),
    hasEffort: byPeriod.some((r) => devMinutesOf(r) != null),
    hasUsage: byPeriod.some((r) => asNum(r.mau_proxy) != null || asNum(r.sessions) != null),
    hasBusiness: byPeriod.some((r) => asNum(r.active_tenants) != null || asNum(r.backend_errors) != null),
    hasHealth: byPeriod.some((r) => asNum(r.rag_risk_avg) != null),
    months: byPeriod.length,
  };
}

export function rollupPulseByPeriod(rows) {
  const groups = new Map();
  (rows || []).forEach((row) => {
    const list = groups.get(row.period) || [];
    list.push(row);
    groups.set(row.period, list);
  });

  return [...groups.keys()].sort().map((period) => {
    const list = groups.get(period);
    const base = blankPulse(period, list.length === 1 ? list[0].product_code : 'ALL');
    list.forEach((row) => {
      mergeInto(base, {
        ...row,
        dev_minutes: devMinutesOf(row),
        bugfix_minutes: bugfixMinutesOf(row),
      });
    });
    return finalize(base);
  });
}
