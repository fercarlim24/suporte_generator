import {
  cardNeedsTagEnrichment,
  filterCardsByDate,
  formatDragPeriod,
  mapDragCardToRow,
  normalizeBoard,
  normalizeColumn,
} from '../../src/lib/drag-map.js';

const DRAG_API_BASE = 'https://app.dragapp.com/v2';

function getDragApiKey() {
  return process.env.DRAG_API_KEY?.trim() || '';
}

export function isDragConfigured() {
  return Boolean(getDragApiKey());
}

function authHeader() {
  const key = getDragApiKey();
  if (!key) throw new Error('DRAG_API_KEY não configurada no servidor');
  return { Authorization: key };
}

async function parseDragResponse(res) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Resposta inválida da API Drag (${res.status})`);
  }

  if (!res.ok || body.error === true || body.Error) {
    const msg =
      body.message ||
      body.Error ||
      body.error ||
      `Erro na API Drag (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : 'Erro na API Drag');
  }

  return body.data ?? body;
}

export async function dragFetch(path, options = {}) {
  const url = `${DRAG_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...authHeader(),
      ...(options.headers || {}),
    },
  });
  return parseDragResponse(res);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichCardsWithTags(cards, { onProgress } = {}) {
  const needs = cards.filter(cardNeedsTagEnrichment);
  if (!needs.length) return cards;

  const byId = new Map(cards.map((card) => [card.DragTaskId ?? card.id, card]));
  const batchSize = 3;
  const delayMs = 700;

  for (let i = 0; i < needs.length; i += batchSize) {
    const batch = needs.slice(i, i + batchSize);
    const details = await Promise.all(
      batch.map(async (card) => {
        const id = card.DragTaskId ?? card.id;
        try {
          return await dragFetch(`/card/${id}`);
        } catch {
          return card;
        }
      }),
    );

    details.forEach((detail, idx) => {
      const source = batch[idx];
      const id = source.DragTaskId ?? source.id;
      const merged = { ...source, ...detail };
      byId.set(id, merged);
    });

    if (onProgress) {
      onProgress({
        done: Math.min(i + batch.length, needs.length),
        total: needs.length,
      });
    }

    if (i + batchSize < needs.length) await sleep(delayMs);
  }

  return Array.from(byId.values());
}

export async function listBoards() {
  const data = await dragFetch('/board');
  return asArray(data).map(normalizeBoard).filter((b) => b.id != null);
}

export async function getBoard(boardId) {
  const data = await dragFetch(`/board/${boardId}`);
  return normalizeBoard(data);
}

export async function listColumns(boardId) {
  const data = await dragFetch(`/board/${boardId}/columns`);
  return asArray(data).map(normalizeColumn);
}

export async function listCardsInColumn(boardId, columnId) {
  const data = await dragFetch(`/board/${boardId}/column/${columnId}/cards`);
  return asArray(data);
}

export async function exportBoardCards(boardId, options = {}) {
  const { startDate, endDate, enrichTags = true, onProgress } = options;
  const board = await getBoard(boardId);
  const columns = await listColumns(boardId);

  let cards = [];
  for (const column of columns) {
    const columnCards = await listCardsInColumn(boardId, column.id);
    cards = cards.concat(columnCards);
    if (onProgress) {
      onProgress({
        phase: 'columns',
        done: cards.length,
        columnsDone: columns.indexOf(column) + 1,
        columnsTotal: columns.length,
      });
    }
  }

  const unique = new Map();
  cards.forEach((card) => {
    const id = card.DragTaskId ?? card.id;
    if (id != null) unique.set(id, card);
  });
  cards = Array.from(unique.values());

  cards = filterCardsByDate(cards, startDate, endDate);

  if (enrichTags && cards.some(cardNeedsTagEnrichment)) {
    cards = await enrichCardsWithTags(cards, {
      onProgress: (p) => onProgress?.({ phase: 'tags', ...p }),
    });
  }

  const rows = cards.map(mapDragCardToRow).filter((row) => row['CARD NAME']);

  const period = formatDragPeriod(startDate, endDate);

  return {
    board,
    columns,
    rows,
    meta: {
      board: board.name,
      period,
      source: 'drag-api',
      startDate: startDate || null,
      endDate: endDate || null,
      totalCards: rows.length,
    },
  };
}
