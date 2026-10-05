import { checkApiKey, isBackendConfigured } from '../../_lib/auth.js';
import { gaConfig } from '../../_lib/bi/config.js';
import { upsertUsageDaily } from '../../_lib/bi/etl.js';
import { chunkRows, fetchGaUsage } from '../../_lib/bi/ga.js';
import { json, readJsonBody } from '../../_lib/http.js';
import { getSupabase } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = checkApiKey(req);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  const cfg = gaConfig();
  if (!cfg.configured) return json(res, 200, { ok: false, reason: 'not_configured' });
  if (!isBackendConfigured()) return json(res, 503, { error: 'Backend não configurado no servidor' });

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : null;
    const manual = Array.isArray(body?.rows) ? body.rows.slice(0, 5000) : [];
    const supabase = getSupabase();

    if (manual.length) {
      const result = await upsertUsageDaily(supabase, manual);
      return json(res, 200, { ok: true, configured: true, mode: 'upsert', rows_upserted: result.rows });
    }

    if (req.method === 'POST') {
      return json(res, 200, {
        ok: true,
        configured: true,
        mode: 'upsert',
        rows_upserted: 0,
        property_id: cfg.propertyId,
      });
    }

    const fetched = await fetchGaUsage(cfg);
    let rowsUpserted = 0;
    for (const chunk of chunkRows(fetched.rows)) {
      const result = await upsertUsageDaily(supabase, chunk);
      rowsUpserted += result.rows;
    }
    return json(res, 200, {
      ok: true,
      configured: true,
      mode: 'fetch',
      rows_upserted: rowsUpserted,
      property_id: cfg.propertyId,
      feature_mode: fetched.featureMode,
    });
  } catch (err) {
    console.error('bi/sync/ga:', err);
    return json(res, 500, { ok: false, error: err.message || 'Erro interno' });
  }
}
