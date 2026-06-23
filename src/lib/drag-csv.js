import { normalizeCsvKey, normalizeCsvRow } from './utils.js';

/**
 * Export Drag.app "Daily Cards":
 * - Linhas 1–5: metadados (Board, User, Start date, End date)
 * - Linha do cabeçalho: CARD NAME, TAGS, COLOR, …
 * - Demais linhas: dados
 */
export function findDragHeaderRowIndex(matrix) {
  if (!matrix?.length) return -1;
  const limit = Math.min(matrix.length, 60);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i];
    if (!row?.length) continue;
    const keys = row.map((cell) => normalizeCsvKey(cell));
    const hasCardName = keys.some(
      (k) => k === 'CARD NAME' || k === 'CARDNAME' || k === 'NAME' || k === 'TITLE',
    );
    const hasTags = keys.some((k) => k === 'TAGS' || k === 'TAG' || k === 'LABELS');
    if (hasCardName || hasTags) return i;
  }
  return -1;
}

/** Metadados das linhas acima do cabeçalho (Board, datas do período) */
export function extractDragExportMeta(matrix, headerIndex) {
  const meta = {};
  if (headerIndex <= 0) return meta;
  for (let i = 0; i < headerIndex; i++) {
    const row = matrix[i];
    if (!row?.length) continue;
    const label = normalizeCsvKey(row[0]);
    const value = String(row[1] ?? '').trim();
    if (!label || !value) continue;
    if (label === 'BOARD') meta.board = value;
    if (label === 'USER') meta.user = value;
    if (label === 'START DATE') meta.startDate = value;
    if (label === 'END DATE') meta.endDate = value;
    if (label === 'REPORT') meta.report = value;
    if (label === 'PERIOD') meta.period = value;
  }
  if (meta.startDate && meta.endDate) {
    meta.period = `${meta.startDate} — ${meta.endDate}`;
  } else if (meta.startDate) {
    meta.period = meta.startDate;
  }
  return meta;
}

/**
 * Converte matriz bruta do CSV (header: false) em objetos por linha de card.
 */
export function parseDragDailyCardsMatrix(matrix) {
  if (!matrix?.length) return { rows: [], meta: {} };

  let headerIndex = findDragHeaderRowIndex(matrix);
  if (headerIndex < 0) {
    headerIndex = 0;
  }

  const meta = extractDragExportMeta(matrix, headerIndex);
  const headerRow = matrix[headerIndex] || [];
  const headers = headerRow.map((h) => normalizeCsvKey(h));

  const rows = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line?.length) continue;
    if (!line.some((c) => c != null && String(c).trim() !== '')) continue;

    const obj = {};
    headers.forEach((key, col) => {
      if (!key) return;
      const raw = line[col];
      obj[key] = raw == null ? '' : String(raw);
    });

    const normalized = normalizeCsvRow(obj);
    rows.push(normalized);
  }

  return { rows, meta };
}

/** true se parece export Drag com linhas de metadado antes do cabeçalho */
export function looksLikeDragExport(matrix) {
  if (findDragHeaderRowIndex(matrix) > 0) return true;
  const first = matrix[0];
  if (!first?.length) return false;
  const a0 = normalizeCsvKey(first[0]);
  return a0 === 'BOARD' || a0 === 'USER' || a0 === 'START DATE';
}
