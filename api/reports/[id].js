import { checkApiKey, isBackendConfigured } from '../_lib/auth.js';
import { json } from '../_lib/http.js';
import { getSupabase } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (!isBackendConfigured()) {
    return json(res, 503, { error: 'Backend não configurado no servidor' });
  }

  const auth = checkApiKey(req);
  if (!auth.ok) return json(res, 401, { error: auth.error });

  const id = Number(req.query?.id);
  if (!id || Number.isNaN(id)) {
    return json(res, 400, { error: 'ID inválido' });
  }

  try {
    const supabase = getSupabase();

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('reports').delete().eq('id', id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('reports/[id] API:', err);
    return json(res, 500, { error: err.message || 'Erro interno' });
  }
}
