import { checkApiKey, isBackendConfigured } from '../_lib/auth.js';
import { json, readJsonBody, getQuery } from '../_lib/http.js';
import { getSupabase, rowToEntry, entryToRow } from '../_lib/supabase.js';

const HIST_MAX = 50;

export default async function handler(req, res) {
  if (!isBackendConfigured()) {
    return json(res, 503, { error: 'Backend não configurado no servidor' });
  }

  const auth = checkApiKey(req);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  try {
    const supabase = getSupabase();

    if (req.method === 'GET') {
      const q = getQuery(req);
      const type = q.get('type');
      let query = supabase
        .from('reports')
        .select('*')
        .order('saved_at', { ascending: false })
        .limit(HIST_MAX);

      if (type && type !== 'ALL') {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return json(res, 200, { reports: (data || []).map(rowToEntry) });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body?.type || !body?.payload) {
        return json(res, 400, { error: 'type e payload são obrigatórios' });
      }
      if (!['suporte', 'horas', 'op'].includes(body.type)) {
        return json(res, 400, { error: 'type inválido' });
      }

      const entry = {
        id: body.id || Date.now(),
        type: body.type,
        version: body.version ?? 2,
        title: body.title || '',
        period: body.period || '',
        savedAt: body.savedAt || new Date().toISOString(),
        payload: body.payload,
      };

      const { data, error } = await supabase
        .from('reports')
        .upsert(entryToRow(entry), { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;
      return json(res, 201, { report: rowToEntry(data) });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('reports API:', err);
    return json(res, 500, { error: err.message || 'Erro interno' });
  }
}
