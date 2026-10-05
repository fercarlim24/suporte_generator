import { hashContactEmail } from './pii.js';
import { missingRelation } from './config.js';
import {
  dimDateRow,
  mapHorasEffort,
  mapOnePager,
  mapSuporteMonth,
  mapSuporteTickets,
  toBusinessRecords,
  toUsageRecords,
} from '../../../src/lib/bi/facts.js';

const SOURCE_BY_TYPE = {
  suporte: 'drag',
  horas: 'manual_horas',
  op: 'one_pager',
};

async function recordRun(supabase, source, status, rows, errorMessage, meta) {
  const { error } = await supabase.from('etl_runs').insert({
    source,
    status,
    rows_upserted: rows || 0,
    finished_at: new Date().toISOString(),
    error_message: errorMessage || null,
    meta: meta || {},
  });
  if (error && !missingRelation(error)) console.error('etl_runs:', error.message);
}

export async function etlSavedReport(supabase, entry) {
  const source = SOURCE_BY_TYPE[entry?.type];
  if (!source) return { ok: false, skipped: true };

  try {
    const result = await run(supabase, entry);
    await recordRun(supabase, source, 'ok', result.rows, null, result.meta || {});
    return { ok: true, ...result };
  } catch (err) {
    if (missingRelation(err)) {
      console.warn('BI ETL ignorado (schema_bi ainda não aplicado):', err.message);
      return { ok: false, reason: 'schema_missing' };
    }
    console.error('BI ETL:', err);
    await recordRun(supabase, source, 'error', 0, err.message || 'erro');
    return { ok: false, error: err.message };
  }
}

async function run(supabase, entry) {
  if (entry.type === 'suporte') return etlSuporte(supabase, entry);
  if (entry.type === 'horas') return etlHoras(supabase, entry);
  if (entry.type === 'op') return etlOp(supabase, entry);
  return { rows: 0 };
}

async function etlSuporte(supabase, entry) {
  const months = mapSuporteMonth(entry);
  if (!months.length) throw new Error('report_month ausente no payload de suporte');

  const salt = process.env.REPORTS_PII_SALT?.trim() || '';
  let unsalted = 0;
  const tickets = mapSuporteTickets(entry, {
    hashEmail(email) {
      if (!salt) {
        unsalted += 1;
        return null;
      }
      return hashContactEmail(email, salt);
    },
  });

  if (entry.id) {
    const del = await supabase.from('fact_support_ticket').delete().eq('source_report_id', entry.id);
    if (del.error) throw del.error;
  }

  const monthRes = await supabase
    .from('fact_support_month')
    .upsert(months, { onConflict: 'report_month,product_code' });
  if (monthRes.error) throw monthRes.error;

  if (tickets.length) {
    const ticketRes = await supabase
      .from('fact_support_ticket')
      .upsert(tickets, { onConflict: 'source_report_id,ticket_id' });
    if (ticketRes.error) throw ticketRes.error;
  }

  return {
    rows: months.length + tickets.length,
    meta: { pii_salt: Boolean(salt), emails_without_salt: unsalted },
  };
}

async function etlHoras(supabase, entry) {
  const rows = mapHorasEffort(entry);
  if (!entryReportMonthSafe(entry) && !rows.length) {
    throw new Error('report_month ausente no payload de horas');
  }
  if (entry.id) {
    const del = await supabase.from('fact_dev_effort').delete().eq('source_report_id', entry.id);
    if (del.error) throw del.error;
  }
  if (rows.length) {
    const ins = await supabase.from('fact_dev_effort').insert(rows);
    if (ins.error) throw ins.error;
  }
  return { rows: rows.length };
}

function entryReportMonthSafe(entry) {
  return entry?.reportMonth || entry?.payload?.meta?.reportMonth || entry?.payload?.reportMonth;
}

async function etlOp(supabase, entry) {
  const row = mapOnePager(entry);
  if (!row) throw new Error('data do one pager inválida para week_start');
  const res = await supabase
    .from('fact_product_health')
    .upsert(row, { onConflict: 'week_start,product_code' });
  if (res.error) throw res.error;
  return { rows: 1 };
}

export async function deleteSupportMonth(supabase, reportId) {
  const { error } = await supabase.from('fact_support_month').delete().eq('source_report_id', reportId);
  if (error && !missingRelation(error)) console.warn('fact_support_month delete:', error.message);
}

async function ensureDimDates(supabase, dates) {
  const rows = [...new Set(dates)].map(dimDateRow).filter(Boolean);
  if (!rows.length) return;
  const { error } = await supabase.from('dim_date').upsert(rows, { onConflict: 'date_id' });
  if (error) throw error;
}

async function ensureFeatures(supabase, records) {
  const keys = new Map();
  records.forEach((r) => {
    if (r.feature_key) keys.set(r.feature_key, r);
  });
  if (!keys.size) return;
  const rows = [...keys.values()].map((r) => ({
    feature_key: r.feature_key,
    feature_name: r.feature_key,
    product_code: r.product_code || 'OS2',
    ga_event_name: r.event_name || null,
  }));
  const { error } = await supabase.from('dim_feature').upsert(rows, { onConflict: 'feature_key' });
  if (error) throw error;
}

async function ensureTenants(supabase, records) {
  const ids = new Set(records.map((r) => r.tenant_id).filter(Boolean));
  if (!ids.size) return;
  const rows = [...ids].map((tenant_id) => ({ tenant_id, tenant_name: tenant_id }));
  const { error } = await supabase.from('dim_tenant').upsert(rows, { onConflict: 'tenant_id' });
  if (error) throw error;
}

export async function upsertUsageDaily(supabase, rawRows) {
  const records = toUsageRecords(rawRows);
  if (!records.length) return { rows: 0 };
  await ensureDimDates(supabase, records.map((r) => r.date_id));
  await ensureFeatures(supabase, records);
  await ensureTenants(supabase, records);
  const { error } = await supabase
    .from('fact_product_usage_daily')
    .upsert(records, { onConflict: 'usage_grain' });
  if (error) throw error;
  await recordRun(supabase, 'ga4', 'ok', records.length, null, { mode: 'rows' });
  return { rows: records.length };
}

export async function upsertBusinessDaily(supabase, rawRows) {
  const records = toBusinessRecords(rawRows);
  if (!records.length) return { rows: 0 };
  await ensureDimDates(supabase, records.map((r) => r.date_id));
  await ensureTenants(supabase, records);
  const { error } = await supabase
    .from('fact_business_daily')
    .upsert(records, { onConflict: 'business_grain' });
  if (error) throw error;
  await recordRun(supabase, 'metabase', 'ok', records.length, null, { mode: 'rows' });
  return { rows: records.length };
}
