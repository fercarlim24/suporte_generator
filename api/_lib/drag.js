import {
  cardNeedsTagEnrichment,
  countCardsWithTags,
  filterCardsByDate,
  flattenCardDetail,
  formatDragPeriod,
  mapDragCardToRow,
  normalizeBoard,
  normalizeColumn,
  buildTagNameMap,
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

async function enrichCardsWithTags(cards, tagNameMap, { onProgress } = {}) {
  const needs = cards.filter((card) => cardNeedsTagEnrichment(card, tagNameMap));
  if (!needs.length) return cards;

  const byId = new Map(cards.map((card) => [card.DragTaskId ?? card.id, card]));
  const batchSize = 5;
  const delayMs = 550;

  for (let i = 0; i < needs.length; i += batchSize) {
    const batch = needs.slice(i, i + batchSize);
    const details = await Promise.all(
      batch.map(async (card) => {
        const id = card.DragTaskId ?? card.id;
        try {
          const detail = await dragFetch(`/card/${id}`);
          return flattenCardDetail(detail);
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

export async function listBoardTags(boardId) {
  const data = await dragFetch(`/tag?BoardId=${encodeURIComponent(boardId)}`);
  return asArray(data);
}

export async function listCardsInColumn(boardId, columnId) {
  const data = await dragFetch(`/board/${boardId}/column/${columnId}/cards`);
  return asArray(data);
}

export async function exportBoardCards(boardId, options = {}) {
  const { startDate, endDate, enrichTags = true, onProgress } = options;
  const board = await getBoard(boardId);
  const columns = await listColumns(boardId);
  const boardTags = await listBoardTags(boardId).catch(() => []);
  const tagNameMap = buildTagNameMap(boardTags);

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
  const cardsRaw = Array.from(unique.values());
  cards = cardsRaw;

  if (startDate || endDate) {
    cards = filterCardsByDate(cards, startDate, endDate);
  }

  if (enrichTags && cards.some((card) => cardNeedsTagEnrichment(card, tagNameMap))) {
    cards = await enrichCardsWithTags(cards, tagNameMap, {
      onProgress: (p) => onProgress?.({ phase: 'tags', ...p }),
    });
  }

  const rows = cards.map((card) => mapDragCardToRow(card, tagNameMap)).filter((row) => row['CARD NAME']);
  const cardsWithTags = countCardsWithTags(cards, tagNameMap);

  const period =
    startDate || endDate
      ? formatDragPeriod(startDate, endDate)
      : `Todos os cards — ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

  return {
    board,
    columns,
    rows,
    stats: {
      columns: columns.length,
      cardsRaw: cardsRaw.length,
      cardsAfterDateFilter: cards.length,
      cardsWithTags,
      cardsExported: rows.length,
      boardTags: boardTags.length,
    },
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
