import { checkDragProxyAuth } from '../_lib/drag-auth.js';
import { isDragConfigured } from '../_lib/drag.js';
import { json } from '../_lib/http.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = checkDragProxyAuth(req);
  if (!auth.ok) {
    return json(res, auth.error.includes('inválida') ? 401 : 503, { error: auth.error });
  }

  return json(res, 200, {
    ok: true,
    drag: isDragConfigured(),
  });
}
