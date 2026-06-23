import { isDragConfigured } from './drag.js';

export function checkDragProxyAuth(req) {
  if (!isDragConfigured()) {
    return { ok: false, error: 'DRAG_API_KEY não configurada no servidor' };
  }

  const reportsKey = process.env.REPORTS_API_KEY?.trim();
  if (!reportsKey) return { ok: true };

  const header = req.headers['x-api-key'] || req.headers['X-Api-Key'];
  if (!header || header !== reportsKey) {
    return { ok: false, error: 'Chave de API inválida' };
  }
  return { ok: true };
}
