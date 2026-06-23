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
import {
  normalizeTagReportPayload,
  summarizeProbeResult,
  TAG_REPORT_CANDIDATES,
} from '../../src/lib/drag-reports.js';

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

export async function dragRawFetch(path, options = {}) {
  const url = `${DRAG_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json, text/csv, text/plain, */*',
      ...authHeader(),
      ...(options.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  if (!res.ok) {
    let error = text;
    try {
      const json = JSON.parse(text);
      error = json.Error || json.message || json.error || text;
    } catch {
      // keep raw text
    }
    return { ok: false, status: res.status, contentType, body: text, error };
  }

  if (
    contentType.includes('json') ||
    text.trim().startsWith('{') ||
    text.trim().startsWith('[')
  ) {
    try {
      const json = JSON.parse(text);
      if (json.error === true || json.Error) {
        return {
          ok: false,
          status: res.status,
          contentType,
          body: text,
          error: json.Error || json.message || 'Erro na API Drag',
        };
      }
      return {
        ok: true,
        status: res.status,
        contentType,
        body: text,
        json,
        data: json.data ?? json,
      };
    } catch {
      // fall through as text
    }
  }

  return { ok: true, status: res.status, contentType, body: text, data: text };
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

export async function probeTagReportEndpoints(boardId, { startDate = '', endDate = '' } = {}) {
  const paths = TAG_REPORT_CANDIDATES(boardId, startDate, endDate);
  const results = [];

  for (const path of paths) {
    try {
      const res = await dragRawFetch(path);
      if (!res.ok) {
        results.push(
          summarizeProbeResult({
            path,
            ok: false,
            status: res.status,
            contentType: res.contentType,
            error: res.error,
            preview: String(res.body || '').slice(0, 240),
          }),
        );
        continue;
      }

      const normalized = normalizeTagReportPayload(res.data ?? res.body);
      results.push(
        summarizeProbeResult({
          path,
          ok: true,
          status: res.status,
          contentType: res.contentType,
          format: normalized.format,
          rowCount: normalized.rows.length,
          preview: JSON.stringify(
            normalized.rows[0] || (typeof res.data === 'string' ? res.data.slice(0, 240) : res.data),
          ).slice(0, 240),
        }),
      );
    } catch (e) {
      results.push(
        summarizeProbeResult({
          path,
          ok: false,
          status: 0,
          error: e.message,
        }),
      );
    }
  }

  return results;
}

export async function fetchTagReport(boardId, { startDate = '', endDate = '' } = {}) {
  const boardTags = await listBoardTags(boardId).catch(() => []);
  const tagNameMap = buildTagNameMap(boardTags);
  const paths = TAG_REPORT_CANDIDATES(boardId, startDate, endDate);

  for (const path of paths) {
    const res = await dragRawFetch(path);
    if (!res.ok) continue;

    const normalized = normalizeTagReportPayload(res.data ?? res.body, tagNameMap);
    if (!normalized.rows.length) continue;

    return {
      path,
      format: normalized.format,
      rows: normalized.rows,
      tagNameMap,
      boardTags,
    };
  }

  return null;
}

async function exportBoardCardsFromColumns(boardId, options = {}) {
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

  return {
    board,
    columns,
    rows,
    stats: {
      method: 'columns',
      columns: columns.length,
      cardsRaw: cardsRaw.length,
      cardsAfterDateFilter: cards.length,
      cardsWithTags,
      cardsExported: rows.length,
      boardTags: boardTags.length,
    },
  };
}

export async function exportBoardCards(boardId, options = {}) {
  const { startDate, endDate, mode = 'auto', onProgress } = options;
  const board = await getBoard(boardId);

  let tagReport = null;
  if (mode === 'auto' || mode === 'tag-report') {
    tagReport = await fetchTagReport(boardId, { startDate, endDate });
  }

  if (tagReport?.rows?.length) {
    const period =
      startDate || endDate
        ? formatDragPeriod(startDate, endDate)
        : `Tag report — ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

    return {
      board,
      columns: [],
      rows: tagReport.rows,
      stats: {
        method: 'tag-report',
        endpoint: tagReport.path,
        format: tagReport.format,
        cardsExported: tagReport.rows.length,
        boardTags: tagReport.boardTags?.length || 0,
      },
      meta: {
        board: board.name,
        period,
        source: 'drag-tag-report',
        startDate: startDate || null,
        endDate: endDate || null,
        totalCards: tagReport.rows.length,
      },
    };
  }

  if (mode === 'tag-report') {
    throw new Error(
      'Nenhum endpoint de Tag Report respondeu com dados. O export Reports → Tags pode não estar exposto na API pública.',
    );
  }

  const columnExport = await exportBoardCardsFromColumns(boardId, options);
  const period =
    startDate || endDate
      ? formatDragPeriod(startDate, endDate)
      : `Todos os cards — ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

  return {
    ...columnExport,
    meta: {
      board: board.name,
      period,
      source: 'drag-api-columns',
      startDate: startDate || null,
      endDate: endDate || null,
      totalCards: columnExport.rows.length,
      tagReportTried: true,
    },
  };
}
