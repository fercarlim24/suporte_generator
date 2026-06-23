import { checkDragProxyAuth } from '../_lib/drag-auth.js';
import { probeTagReportEndpoints } from '../_lib/drag.js';
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

  try {
    const results = await probeTagReportEndpoints(boardId, {
      startDate: q.get('startDate') || '',
      endDate: q.get('endDate') || '',
    });

    const working = results.filter((r) => r.ok && r.rowCount > 0);

    return json(res, 200, {
      boardId,
      candidates: results,
      working,
      hint:
        working.length > 0
          ? 'Tag Report disponível via API (endpoint não documentado).'
          : 'Nenhum endpoint de Tag Report retornou linhas. Use CSV do Reports → Tags ou fallback por colunas.',
    });
  } catch (e) {
    return json(res, 502, { error: e.message || 'Erro ao sondar endpoints de report' });
  }
}
