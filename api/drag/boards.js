import { checkDragProxyAuth } from '../_lib/drag-auth.js';
import { listBoards } from '../_lib/drag.js';
import { json } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = checkDragProxyAuth(req);
  if (!auth.ok) {
    return json(res, auth.error.includes('inválida') ? 401 : 503, { error: auth.error });
  }

  try {
    const boards = await listBoards();
    return json(res, 200, { boards });
  } catch (e) {
    return json(res, 502, { error: e.message || 'Erro ao listar boards do Drag' });
  }
}
