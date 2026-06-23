import { mapDragCardToRow, buildTagNameMap } from './drag-map.js';

export const TAG_REPORT_CANDIDATES = (boardId, startDate = '', endDate = '') => {
  const q = new URLSearchParams({ BoardId: String(boardId) });
  if (startDate) q.set('StartDate', startDate);
  if (endDate) q.set('EndDate', endDate);
  const qs = q.toString();

  const q2 = new URLSearchParams();
  if (startDate) q2.set('startDate', startDate);
  if (endDate) q2.set('endDate', endDate);
  const qs2 = q2.toString() ? `?${q2}` : '';

  return [
  `/tag/report?${qs}`,
  `/board/${boardId}/tags/report${qs2}`,
  `/board/${boardId}/reports/tags${qs2}`,
  `/board/${boardId}/analytics/tags${qs2}`,
  `/board/${boardId}/report/tags${qs2}`,
  ];
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function looksLikeCsv(text) {
  const sample = String(text || '').slice(0, 4000);
  return sample.includes('CARD NAME') || sample.includes('CARD_NAME') || sample.includes('TAGS');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseTagReportCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  let headerIndex = lines.findIndex((line) => /card\s*name|card_name/i.test(line));
  if (headerIndex < 0) headerIndex = 0;

  const headers = parseCsvLine(lines[headerIndex]).map((h) =>
    h.replace(/\ufeff/g, '').trim().toUpperCase().replace(/_/g, ' '),
  );

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (!cols.some((c) => c?.trim())) continue;
    const row = {};
    headers.forEach((h, idx) => {
      if (h) row[h] = cols[idx] ?? '';
    });
    if (row['CARD NAME'] || row.CARDNAME) rows.push(row);
  }
  return rows;
}

export function normalizeTagReportPayload(payload, tagNameMap = null) {
  if (!payload) return { rows: [], format: 'empty' };

  if (typeof payload === 'string') {
    if (looksLikeCsv(payload)) {
      return { rows: parseTagReportCsv(payload), format: 'csv' };
    }
    try {
      return normalizeTagReportPayload(JSON.parse(payload), tagNameMap);
    } catch {
      return { rows: [], format: 'text' };
    }
  }

  const candidates = [
    payload,
    payload.data,
    payload.cards,
    payload.Cards,
    payload.rows,
    payload.Rows,
    payload.report,
    payload.Report,
    payload.items,
    payload.Items,
  ];

  for (const candidate of candidates) {
    const list = asArray(candidate);
    if (!list.length || typeof list[0] !== 'object') continue;

    const first = list[0];
    if (first['CARD NAME'] || first.CARD_NAME || first.CARDNAME) {
      return { rows: list, format: 'rows' };
    }
    if (first.TaskName || first.taskName || first.DragTaskId) {
      return {
        rows: list.map((card) => mapDragCardToRow(card, tagNameMap)),
        format: 'cards',
      };
    }
  }

  return { rows: [], format: 'unknown' };
}

export function summarizeProbeResult(result) {
  return {
    path: result.path,
    ok: result.ok,
    status: result.status,
    contentType: result.contentType,
    format: result.format,
    rowCount: result.rowCount,
    preview: result.preview,
    error: result.error || null,
  };
}
