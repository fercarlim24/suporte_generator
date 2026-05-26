import { isBackendConfigured } from './_lib/auth.js';
import { json } from './_lib/http.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }
  return json(res, 200, {
    ok: true,
    cloud: isBackendConfigured(),
  });
}
