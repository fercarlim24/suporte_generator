import { checkApiKey, isBackendConfigured } from '../_lib/auth.js';
import { integrationFlags, missingRelation } from '../_lib/bi/config.js';
import { json, getQuery } from '../_lib/http.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!isBackendConfigured()) return json(res, 503, { error: 'Backend não configurado no servidor' });

  const auth = checkApiKey(req);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  const q = getQuery(req);
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const product = (q.get('product') || 'ALL').toUpperCase();

  try {
    const supabase = getSupabase();
    let query = supabase.from('mart_product_pulse').select('*').order('period', { ascending: true }).limit(500);
    if (from) query = query.gte('period', from);
    if (to) query = query.lte('period', to);
    if (product && product !== 'ALL') query = query.eq('product_code', product);

    const { data, error } = await query;
    if (error) {
      if (missingRelation(error)) {
        return json(res, 200, {
          rows: [],
          from: from || null,
          to: to || null,
          product,
          integrations: integrationFlags(),
          warning: 'schema_bi_missing',
        });
      }
      throw error;
    }

    return json(res, 200, {
      rows: data || [],
      from: from || null,
      to: to || null,
      product,
      integrations: integrationFlags(),
    });
  } catch (err) {
    console.error('bi/pulse:', err);
    return json(res, 500, { error: err.message || 'Erro interno' });
  }
}
