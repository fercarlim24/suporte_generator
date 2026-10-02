import { checkApiKey, isBackendConfigured } from '../_lib/auth.js';
import { integrationFlags, missingRelation } from '../_lib/bi/config.js';
import { json } from '../_lib/http.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!isBackendConfigured()) return json(res, 503, { error: 'Backend não configurado no servidor' });

  const auth = checkApiKey(req);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('v_etl_freshness').select('*');
    if (error) {
      if (missingRelation(error)) {
        return json(res, 200, { sources: [], integrations: integrationFlags(), warning: 'schema_bi_missing' });
      }
      throw error;
    }
    return json(res, 200, { sources: data || [], integrations: integrationFlags() });
  } catch (err) {
    console.error('bi/freshness:', err);
    return json(res, 500, { error: err.message || 'Erro interno' });
  }
}
