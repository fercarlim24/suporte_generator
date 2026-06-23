const API_KEY = import.meta.env.VITE_REPORTS_API_KEY || '';

let dragAvailable = null;

function headers() {
  const h = { Accept: 'application/json' };
  if (API_KEY) h['x-api-key'] = API_KEY;
  return h;
}

async function dragRequest(path) {
  const res = await fetch(path, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return data;
}

export function hasDragClientKey() {
  return Boolean(API_KEY);
}

export async function checkDragAvailable() {
  try {
    const data = await dragRequest('/api/drag/status');
    dragAvailable = data.drag === true;
    return dragAvailable;
  } catch {
    dragAvailable = false;
    return false;
  }
}

export function isDragAvailable() {
  return dragAvailable === true;
}

export async function listDragBoards() {
  const data = await dragRequest('/api/drag/boards');
  return data.boards || [];
}

export async function exportDragBoard(boardId, { startDate = '', endDate = '' } = {}) {
  const params = new URLSearchParams({ boardId: String(boardId) });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);

  const data = await dragRequest(`/api/drag/export?${params}`);
  return {
    rows: data.rows || [],
    meta: data.meta || {},
    board: data.board || null,
    stats: data.stats || null,
  };
}
