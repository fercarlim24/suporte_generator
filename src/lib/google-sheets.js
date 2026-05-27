import { parseReportPeriodDate } from './utils.js';

const SUMMARY_SHEET_RE = /resumo|anual|summary|consolidado|total|geral|year/i;

export function isSummarySheetName(name) {
  return SUMMARY_SHEET_RE.test(String(name || ''));
}

/** Remove parâmetros de controle da URL do deployment Apps Script */
export function cleanAppsScriptDeploymentUrl(url) {
  try {
    const u = new URL(String(url).trim());
    ['action', 'list', 'sheet'].forEach((k) => u.searchParams.delete(k));
    let s = u.toString();
    if (s.endsWith('?')) s = s.slice(0, -1);
    return s;
  } catch {
    return String(url || '').trim();
  }
}

export function buildAppsScriptRequestUrl(deploymentUrl, params = {}) {
  const base = cleanAppsScriptDeploymentUrl(deploymentUrl);
  const u = new URL(base);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') u.searchParams.set(k, String(v));
  });
  return u.toString();
}

/**
 * Interpreta URL do Web App, link publicado ou link de edição da planilha.
 */
export function parseGoogleSheetsUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  if (/script\.google\.com/i.test(raw)) {
    return { kind: 'appscript', deploymentUrl: cleanAppsScriptDeploymentUrl(raw) };
  }

  let spreadsheetId = null;
  let m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) spreadsheetId = m[1];

  m = raw.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (m) spreadsheetId = m[1];

  m = raw.match(/[?&#]gid=(\d+)/);
  const gid = m?.[1] || null;

  if (/\/pub/i.test(raw)) {
    return { kind: 'publish', publishUrl: raw, spreadsheetId, gid };
  }

  if (spreadsheetId) {
    return { kind: 'spreadsheet', spreadsheetId, gid };
  }

  return { kind: 'unknown', raw };
}

export function buildSpreadsheetCsvExportUrl(spreadsheetId, gid) {
  const id = encodeURIComponent(spreadsheetId);
  const base = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
  return gid != null && gid !== '' ? `${base}&gid=${encodeURIComponent(gid)}` : base;
}

function sheetTabSortDate(name) {
  let d = parseReportPeriodDate(name);
  if (!d) {
    const trimmed = String(name || '').trim();
    if (trimmed) d = parseReportPeriodDate(`${trimmed} de 2000`);
  }
  return d;
}

export function sortSheetTabs(sheets) {
  const monthly = [];
  const other = [];
  const summaries = [];

  for (const sheet of sheets || []) {
    const name = sheet?.name;
    if (!name) continue;
    if (isSummarySheetName(name)) {
      summaries.push(sheet);
      continue;
    }
    const d = sheetTabSortDate(name);
    if (d) monthly.push({ ...sheet, _sort: d.getTime() });
    else other.push(sheet);
  }

  monthly.sort((a, b) => a._sort - b._sort);
  return [
    ...monthly.map(({ _sort, ...s }) => s),
    ...other,
    ...summaries,
  ];
}

export function pickDefaultSheetName(sheets) {
  const sorted = sortSheetTabs(sheets);
  const first = sorted.find((s) => !isSummarySheetName(s.name));
  return (first || sorted[0])?.name || '';
}
