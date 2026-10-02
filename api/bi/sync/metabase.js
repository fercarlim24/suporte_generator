import { checkApiKey, isBackendConfigured } from '../../_lib/auth.js';
import { metabaseConfig } from '../../_lib/bi/config.js';
import { upsertBusinessDaily } from '../../_lib/bi/etl.js';
import { json, readJsonBody } from '../../_lib/http.js';
import { getSupabase } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = checkApiKey(req);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  const cfg = metabaseConfig();
  if (!cfg.configured) return json(res, 200, { ok: false, reason: 'not_configured' });
  if (!isBackendConfigured()) return json(res, 503, { error: 'Backend não configurado no servidor' });

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : null;
    const rows = Array.isArray(body?.rows) ? body.rows.slice(0, 5000) : [];
    if (!rows.length) {
      return json(res, 200, {
        ok: true,
        configured: true,
        mode: 'stub',
        rows_upserted: 0,
        message:
          'Credenciais Metabase presentes. A query remota ainda não roda neste release; POST { rows } grava fact_business_daily.',
      });
    }

    const supabase = getSupabase();
    const result = await upsertBusinessDaily(supabase, rows);
    return json(res, 200, { ok: true, configured: true, mode: 'upsert', rows_upserted: result.rows });
  } catch (err) {
    console.error('bi/sync/metabase:', err);
    return json(res, 500, { ok: false, error: err.message || 'Erro interno' });
  }
}
