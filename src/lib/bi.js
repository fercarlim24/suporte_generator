import {
  fetchBiFeatures,
  fetchBiFreshness,
  fetchBiPulse,
  fetchBiTenants,
  isCloudAvailable,
} from './api.js';
import { weekStartIso } from './bi/facts.js';
import { filterPulseRows, historyEntriesToPulseRows } from './bi/pulse.js';
import { histGetAll, histRefreshFromCloud } from './history.js';
import { getEntryReportMonth } from './report-period.js';

const SOURCE_BY_TYPE = {
  suporte: 'drag',
  horas: 'manual_horas',
  op: 'one_pager',
};

function localFreshness(entries) {
  const latest = {};
  (entries || []).forEach((e) => {
    const source = SOURCE_BY_TYPE[e.type];
    if (!source || !e.savedAt) return;
    if (!latest[source] || e.savedAt > latest[source]) latest[source] = e.savedAt;
  });
  return Object.entries(latest).map(([source, as_of]) => ({ source, as_of, rows_upserted: null }));
}

function localRows(filters) {
  const rows = historyEntriesToPulseRows(histGetAll(), { reportMonthOf: getEntryReportMonth });
  return filterPulseRows(rows, filters);
}

export async function loadProductPulse(filters = {}) {
  await histRefreshFromCloud();
  const fallback = localRows(filters);
  const anchor = filters.to ? `${filters.to}-01` : new Date().toISOString().slice(0, 10);
  const weekStart = weekStartIso(anchor);

  if (!isCloudAvailable()) {
    return {
      origin: 'local',
      rows: fallback,
      integrations: { ga4: false, metabase: false },
      freshness: localFreshness(histGetAll()),
      features: [],
      tenants: [],
      weekStart,
      warning: null,
    };
  }

  try {
    const [pulse, fresh, features, tenants] = await Promise.all([
      fetchBiPulse(filters),
      fetchBiFreshness(),
      fetchBiFeatures(weekStart).catch(() => ({ rows: [] })),
      fetchBiTenants(weekStart).catch(() => ({ rows: [] })),
    ]);
    const integrations = {
      ga4: Boolean(pulse.integrations?.ga4 || fresh.integrations?.ga4),
      metabase: Boolean(pulse.integrations?.metabase || fresh.integrations?.metabase),
    };
    const cloudRows = filterPulseRows(pulse.rows || [], filters);
    if (cloudRows.length) {
      return {
        origin: 'cloud',
        rows: cloudRows,
        integrations,
        freshness: fresh.sources || [],
        features: features.rows || [],
        tenants: tenants.rows || [],
        weekStart,
        warning: null,
      };
    }
    return {
      origin: 'local',
      rows: fallback,
      integrations,
      freshness: fresh.sources?.length ? fresh.sources : localFreshness(histGetAll()),
      features: features.rows || [],
      tenants: tenants.rows || [],
      weekStart,
      warning: pulse.warning === 'schema_bi_missing' ? 'schema' : 'empty',
    };
  } catch (err) {
    return {
      origin: 'local',
      rows: fallback,
      integrations: { ga4: false, metabase: false },
      freshness: localFreshness(histGetAll()),
      features: [],
      tenants: [],
      weekStart,
      warning: err.message || 'api',
    };
  }
}
