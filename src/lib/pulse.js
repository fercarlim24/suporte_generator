import { mapHorasEffort, mapOnePager } from './bi/facts.js';
import { CAT_ORDER } from './config.js';
import { histGetAll } from './history.js';
import { getEntryReportMonth } from './report-period.js';
import { entryInScope } from './report-scope.js';

const RAG_LABELS = ['No prazo', 'Atenção', 'Bloqueado', 'N/A'];
const FRONTS = [
  ['esc', 'Escopo'],
  ['rm', 'Roadmap'],
  ['rec', 'Recursos'],
  ['ri', 'Risco'],
  ['cu', 'Custo'],
];

export function readGaAdapter() {
  return null;
}

export function readMetabaseAdapter() {
  return null;
}

/** Converte o payload de GET /api/bi/pulse + features. Null se GA não está configurado. */
export function gaFromCloud(model) {
  if (!model?.integrations?.ga4) return null;
  const byPeriod = {};
  (model.rows || []).forEach((row) => {
    if (row.mau_proxy == null || !row.period || !row.product_code) return;
    byPeriod[row.period] = byPeriod[row.period] || {};
    byPeriod[row.period][row.product_code] = Number(row.mau_proxy);
  });
  const features = model.features || [];
  if (!Object.keys(byPeriod).length && !features.length) return null;
  return {
    asOf: (model.freshness || []).find((item) => item.source === 'ga4')?.as_of || null,
    byPeriod,
    features: features.map((feature) => ({
      feature_key: feature.feature_key,
      product_code: feature.product_code,
      event_count: feature.event_count,
      tickets: feature.tickets,
      delta_usage: feature.delta_usage ?? null,
    })),
  };
}

/** Converte tenants do Metabase. Null se a integração não está configurada. */
export function metabaseFromCloud(model, product) {
  if (!model?.integrations?.metabase) return null;
  const rows = (model.rows || []).filter(
    (row) => row.active_tenants != null || row.backend_errors != null,
  );
  const latest = rows
    .filter((row) => !product || row.product_code === product)
    .sort((a, b) => String(a.period).localeCompare(String(b.period)))
    .at(-1);
  return {
    asOf: (model.freshness || []).find((item) => item.source === 'metabase')?.as_of || null,
    activeTenants: latest?.active_tenants ?? null,
    backendErrors: latest?.backend_errors ?? null,
    tenants: (model.tenants || [])
      .filter((tenant) => !product || !tenant.product_code || tenant.product_code === product)
      .map((tenant) => ({
        tenant_name: tenant.tenant_name || tenant.tenant_id,
        product_code: tenant.product_code,
        delta_usage: tenant.delta_usage ?? null,
        delta_tickets: tenant.delta_tickets ?? null,
        rag: tenant.rag || null,
      })),
  };
}

function addMonths(key, delta) {
  const [y, m] = String(key).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function latest(entries, type) {
  return entries
    .filter((entry) => entry.type === type && entry.version === 2)
    .sort((a, b) => String(a.savedAt || '').localeCompare(String(b.savedAt || '')))
    .at(-1) || null;
}

function scoped(entries, product, period) {
  return (entries || []).filter((entry) => entry.version === 2 && entryInScope(entry, product, period));
}

function supportOf(entry, product) {
  const data = entry?.payload?.data;
  if (!data) return null;
  if (product === 'FORE') {
    const tickets = Number(data.foreTickets || 0);
    const bugs = (data.bugs || []).filter((bug) => /fore/i.test(bug.name || '')).length;
    if (!tickets && !bugs) return null;
    return { tickets, closed: null, closedRate: null, bugs, cats: data.cats || [] };
  }
  const tickets = Number(data.realTickets || 0);
  const closed = Number(data.closed || 0);
  return {
    tickets,
    closed,
    closedRate: tickets ? Math.round((100 * closed) / tickets) : null,
    bugs: Array.isArray(data.bugs) ? data.bugs.length : 0,
    cats: data.cats || [],
  };
}

function hoursBundle(entry) {
  const facts = mapHorasEffort(entry || {});
  const byProduct = { OS2: 0, FORE: 0 };
  const byCategory = new Map();
  facts.forEach((fact) => {
    if (fact.product_code === 'OS2' || fact.product_code === 'FORE') {
      byProduct[fact.product_code] += fact.minutes;
    }
    const row = byCategory.get(fact.category) || { category: fact.category, minutes: 0, os2: 0, fore: 0 };
    row.minutes += fact.minutes;
    if (fact.product_code === 'OS2') row.os2 += fact.minutes;
    if (fact.product_code === 'FORE') row.fore += fact.minutes;
    byCategory.set(fact.category, row);
  });
  return { facts, byProduct, byCategory };
}

function productMinutes(bundle, product) {
  const minutes = bundle.byProduct[product] || 0;
  return minutes || null;
}

function bugfixShare(bundle, product) {
  const total = productMinutes(bundle, product);
  if (!total) return null;
  const bug = bundle.facts
    .filter((fact) => fact.product_code === product && fact.category === 'BUG')
    .reduce((sum, fact) => sum + fact.minutes, 0);
  return Math.round((100 * bug) / total);
}

function perThousand(tickets, mau) {
  if (tickets == null || !mau) return null;
  return round1((tickets / mau) * 1000);
}

function mauFor(usage, product, period, currentPeriod) {
  if (!usage) return null;
  const fromSeries = usage.byPeriod?.[period]?.[product];
  if (fromSeries != null) return fromSeries;
  if (period !== currentPeriod) return null;
  if (usage.byProduct && usage.byProduct[product] != null) return usage.byProduct[product];
  return usage.mau ?? null;
}

function emptyKpi(source, sub, missing) {
  return { value: null, sub, source, missing };
}

/**
 * Lê relatórios já salvos. GA e Metabase entram só se o adapter não for null.
 */
export function getPulse({ product = 'OS2', period, entries, ga, metabase } = {}) {
  const list = entries || (typeof histGetAll === 'function' ? histGetAll() : []);
  const usage = ga === undefined ? readGaAdapter() : ga;
  const business = metabase === undefined ? readMetabaseAdapter() : metabase;
  const month = period || new Date().toISOString().slice(0, 7);
  const currentEntries = scoped(list, product, month);
  const suporte = latest(currentEntries, 'suporte');
  const horasEntry = latest(
    list.filter((entry) => entry.type === 'horas' && entry.version === 2 && getEntryReportMonth(entry) === month),
    'horas',
  );
  const op = latest(currentEntries, 'op');
  const support = supportOf(suporte, product);
  const hours = hoursBundle(horasEntry);
  const devMinutes = productMinutes(hours, product);
  const pctBugfix = bugfixShare(hours, product);
  const mau = mauFor(usage, product, month, month);
  const health = op ? mapOnePager(op) : null;

  const kpis = {
    mau: usage
      ? { value: mau, sub: mau == null ? 'sem MAU neste mês' : 'usuários únicos no mês', source: 'GA', missing: null }
      : emptyKpi('GA', 'conecte o Google Analytics', 'ga'),
    tickets: support
      ? {
          value: support.tickets,
          sub: support.closedRate == null ? 'tickets FORE no CSV' : `${support.closedRate}% fechados`,
          source: 'SUPORTE',
          missing: null,
        }
      : emptyKpi('SUPORTE', `sem CSV de ${month}`, 'csv'),
    bugs: support
      ? { value: support.bugs, sub: 'chamados com bug', source: 'SUPORTE', missing: null }
      : emptyKpi('SUPORTE', `sem CSV de ${month}`, 'csv'),
    ticketsPerMau:
      usage && support
        ? {
            value: perThousand(support.tickets, mau),
            sub: mau ? 'suporte ÷ GA' : 'sem MAU neste mês',
            source: 'SUPORTE ÷ GA',
            missing: mau ? null : 'ga',
          }
        : emptyKpi('SUPORTE ÷ GA', usage ? `sem CSV de ${month}` : 'conecte o Google Analytics', usage ? 'csv' : 'ga'),
    devHours: devMinutes
      ? {
          value: round1(devMinutes / 60),
          sub: pctBugfix == null ? 'lançamento manual' : `${pctBugfix}% bugfix`,
          source: 'HORAS',
          missing: null,
        }
      : emptyKpi('HORAS', 'sem horas no período', 'horas'),
    tenants: business
      ? {
          value: business.activeTenants ?? null,
          sub: business.backendErrors == null ? 'Metabase' : `${business.backendErrors} erros backend`,
          source: 'METABASE',
          missing: null,
        }
      : emptyKpi('METABASE', 'não configurado', 'metabase'),
    rag: health
      ? {
          value: health.rag_risk,
          sub: RAG_LABELS[health.rag_risk] || 'one pager',
          source: 'ONE PAGER',
          missing: null,
        }
      : emptyKpi('ONE PAGER', 'sem one pager no período', 'op'),
  };

  const trend = Array.from({ length: 6 }, (_, index) => addMonths(month, index - 5)).map((key) => {
    const monthSupport = supportOf(latest(scoped(list, product, key), 'suporte'), product);
    const monthMau = mauFor(usage, product, key, month);
    return {
      period: key,
      ticketsPerMau: perThousand(monthSupport?.tickets ?? null, monthMau),
      current: key === month,
    };
  });

  const categories = [...new Set([...CAT_ORDER, ...hours.byCategory.keys()])];
  const effort = categories
    .map((category) => hours.byCategory.get(category) || { category, minutes: 0, os2: 0, fore: 0 })
    .filter((row) => row.os2 || row.fore || row.minutes);

  const features = (usage?.features || [])
    .filter((feature) => !feature.product_code || feature.product_code === product)
    .map((feature) => {
      const events = Number(feature.event_count || feature.events || 0);
      const tickets = Number(feature.tickets || 0);
      return {
        feature_key: feature.feature_key || '—',
        events,
        deltaUsage: feature.delta_usage ?? feature.deltaUsage ?? null,
        tickets,
        pain: events > 0 && tickets > 0,
      };
    });

  const tenants = (business?.tenants || []).map((tenant) => {
    const deltaUsage = tenant.delta_usage ?? tenant.deltaUsage ?? null;
    const deltaTickets = tenant.delta_tickets ?? tenant.deltaTickets ?? null;
    return {
      tenant: tenant.tenant_name || tenant.tenant || tenant.tenant_id || '—',
      deltaUsage,
      deltaTickets,
      rag: tenant.rag || null,
      risk: deltaUsage != null && deltaTickets != null && deltaUsage < 0 && deltaTickets > 0,
    };
  });

  const insights = [];
  const pain = features.find((feature) => feature.pain);
  if (usage && support && pain) {
    insights.push({
      id: 'pain',
      kicker: 'Dor × uso',
      metric: `${pain.tickets} tickets · ${pain.events} eventos`,
      context: `${pain.feature_key} concentra uso e chamado no mesmo período.`,
      cta: 'Ver uso',
      tab: 'uso',
    });
  }
  if (support) {
    insights.push({
      id: 'bug-tax',
      kicker: 'Bug tax',
      metric: `${support.bugs} bugs`,
      context: pctBugfix == null ? 'Ainda não há horas de bugfix lançadas neste mês.' : `${pctBugfix}% das horas de ${product} foram para bugfix.`,
      cta: 'Ver esforço',
      tab: 'esforco',
    });
  }
  const riskTenant = tenants.find((tenant) => tenant.risk);
  if (business && riskTenant) {
    insights.push({
      id: 'risk',
      kicker: 'Conta em risco',
      metric: riskTenant.tenant,
      context: 'Uso caindo e tickets subindo neste recorte.',
      cta: 'Ver contas',
      tab: 'contas',
    });
  }
  const os2Mau = mauFor(usage, 'OS2', month, month);
  const foreMau = mauFor(usage, 'FORE', month, month);
  if (usage && support && os2Mau && foreMau) {
    const other = product === 'FORE' ? 'OS2' : 'FORE';
    insights.push({
      id: 'compare',
      kicker: 'FORE vs OS2',
      metric: `${perThousand(support.tickets, mau) ?? '—'} tickets / 1k MAU`,
      context: `${product} está neste recorte. O outro lado do mês está em ${other}.`,
      cta: `Abrir ${other}`,
      tab: 'pulse',
      switchProduct: other,
    });
  }

  const rag = health
    ? FRONTS.map(([key, front]) => {
        const value = Number(op.payload?.state?.[key] ?? 0);
        return { front, value, label: RAG_LABELS[value] || RAG_LABELS[0] };
      })
    : [];

  const risks = [];
  if (op?.payload?.tx) {
    [
      ['Alto', op.payload.tx.rA],
      ['Médio', op.payload.tx.rM],
      ['Baixo', op.payload.tx.rB],
    ].forEach(([level, text]) => {
      if (text) risks.push({ level, text: String(text) });
    });
  }

  const freshness = [
    { source: 'Suporte', mode: 'upload manual', asOf: suporte?.savedAt || null, ok: Boolean(support) },
    { source: 'GA', mode: 'sync', asOf: usage?.asOf || null, ok: Boolean(usage) },
    { source: 'Metabase', mode: 'sync', asOf: business?.asOf || null, ok: Boolean(business) },
    { source: 'Horas', mode: 'save manual', asOf: devMinutes ? horasEntry?.savedAt || null : null, ok: Boolean(devMinutes) },
    { source: 'One Pager', mode: 'save manual', asOf: op?.savedAt || null, ok: Boolean(op) },
  ];

  return { kpis, trend, effort, insights, features, tenants, rag, risks, freshness };
}
