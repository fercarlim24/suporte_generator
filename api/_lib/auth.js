export function checkApiKey(req) {
  const expected = process.env.REPORTS_API_KEY;
  if (!expected) return { ok: false, error: 'REPORTS_API_KEY não configurada no servidor' };

  const header = req.headers['x-api-key'] || req.headers['X-Api-Key'];
  if (!header || header !== expected) {
    return { ok: false, error: 'Chave de API inválida' };
  }
  return { ok: true };
}

/** Variáveis obrigatórias no servidor (Vercel → Environment Variables) */
export function getServerConfigStatus() {
  return {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    REPORTS_API_KEY: Boolean(process.env.REPORTS_API_KEY?.trim()),
    DRAG_API_KEY: Boolean(process.env.DRAG_API_KEY?.trim()),
  };
}

export function isBackendConfigured() {
  const s = getServerConfigStatus();
  return s.SUPABASE_URL && s.SUPABASE_SERVICE_ROLE_KEY && s.REPORTS_API_KEY;
}
