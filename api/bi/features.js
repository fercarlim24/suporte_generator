import { checkApiKey, isBackendConfigured } from '../_lib/auth.js';
import { missingRelation } from '../_lib/bi/config.js';
import { json, getQuery } from '../_lib/http.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!isBackendConfigured()) return json(res, 503, { error: 'Backend não configurado no servidor' });

  const auth = checkApiKey(req);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  const week = getQuery(req).get('week_start') || '';

  try {
    const supabase = getSupabase();
    let query = supabase.from('mart_feature_health').select('*').limit(500);
    if (week) query = query.eq('week_start', week);
    const { data, error } = await query;
    if (error) {
      if (missingRelation(error)) return json(res, 200, { rows: [], week_start: week || null });
      throw error;
    }
    return json(res, 200, { rows: data || [], week_start: week || null });
  } catch (err) {
    console.error('bi/features:', err);
    return json(res, 500, { error: err.message || 'Erro interno' });
  }
}
