import { getServerConfigStatus, isBackendConfigured } from './_lib/auth.js';
import { json } from './_lib/http.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const config = getServerConfigStatus();
  const cloud = isBackendConfigured();
  const missing = Object.entries(config)
    .filter(([, set]) => !set)
    .map(([name]) => name);

  return json(res, 200, {
    ok: true,
    cloud,
    config,
    ...(missing.length
      ? {
          hint:
            'Defina as variáveis em Vercel → Settings → Environment Variables (Production + Preview) e faça Redeploy. ' +
            'VITE_REPORTS_API_KEY não conta para cloud — use REPORTS_API_KEY no servidor.',
          missing,
        }
      : {}),
  });
}
