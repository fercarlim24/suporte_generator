import { checkDragProxyAuth } from '../_lib/drag-auth.js';
import { exportBoardCards } from '../_lib/drag.js';
import { getQuery, json } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = checkDragProxyAuth(req);
  if (!auth.ok) {
    return json(res, auth.error.includes('inválida') ? 401 : 503, { error: auth.error });
  }

  const q = getQuery(req);
  const boardId = q.get('boardId');
  if (!boardId) {
    return json(res, 400, { error: 'Parâmetro boardId é obrigatório' });
  }

  const startDate = q.get('startDate') || '';
  const endDate = q.get('endDate') || '';
  const enrichTags = q.get('enrichTags') !== 'false';

  try {
    const result = await exportBoardCards(boardId, {
      startDate,
      endDate,
      enrichTags,
    });
    return json(res, 200, result);
  } catch (e) {
    return json(res, 502, { error: e.message || 'Erro ao exportar cards do Drag' });
  }
}
