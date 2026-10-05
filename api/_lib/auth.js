function headerValue(req, name) {
  const headers = req?.headers || {};
  const value = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export function checkApiKey(req) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = headerValue(req, 'authorization');
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return { ok: true };

  const expected = process.env.REPORTS_API_KEY;
  if (!expected) return { ok: false, error: 'REPORTS_API_KEY não configurada no servidor' };

  const header = headerValue(req, 'x-api-key');
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
  };
}

export function isBackendConfigured() {
  const s = getServerConfigStatus();
  return s.SUPABASE_URL && s.SUPABASE_SERVICE_ROLE_KEY && s.REPORTS_API_KEY;
}
