export function checkApiKey(req) {
  const expected = process.env.REPORTS_API_KEY;
  if (!expected) return { ok: false, error: 'REPORTS_API_KEY não configurada no servidor' };

  const header = req.headers['x-api-key'] || req.headers['X-Api-Key'];
  if (!header || header !== expected) {
    return { ok: false, error: 'Chave de API inválida' };
  }
  return { ok: true };
}

export function isBackendConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.REPORTS_API_KEY,
  );
}
