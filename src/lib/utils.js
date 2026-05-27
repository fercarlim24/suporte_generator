import { parseDragDailyCardsMatrix } from './drag-csv.js';

/** Escape text for safe HTML interpolation */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Remove BOM e espaços extras dos cabeçalhos do CSV */
export function normalizeCsvKey(key) {
  return String(key)
    .replace(/\ufeff/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/_/g, ' ');
}

/** Normalize CSV row keys (CARD NAME vs CARD_NAME, BOM, etc.) */
export function normalizeCsvRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = normalizeCsvKey(k);
    if (!key) continue;
    const val = v == null ? '' : typeof v === 'string' ? v : String(v);
    out[key] = val;
  }
  return out;
}

export function normalizeCsvData(rows) {
  return rows.map(normalizeCsvRow);
}

/** Lê valor de coluna já normalizada ou por nome aproximado */
export function pickRowField(row, ...candidates) {
  for (const c of candidates) {
    const key = normalizeCsvKey(c);
    const v = row[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeCsvKey(k);
    for (const c of candidates) {
      if (nk === normalizeCsvKey(c) && v != null && String(v).trim()) {
        return String(v).trim();
      }
    }
  }
  return '';
}

export function getCardName(row) {
  return pickRowField(row, 'CARD NAME', 'CARDNAME', 'NAME', 'TITLE', 'TÍTULO', 'TITULO');
}

export function getTagsRaw(row) {
  return pickRowField(row, 'TAGS', 'TAG', 'LABELS', 'ETIQUETAS');
}

export function findCol(headers, candidates) {
  for (const c of candidates) {
    const found = headers.find((h) => h && h.toUpperCase().includes(c.toUpperCase()));
    if (found) return found;
  }
  return null;
}

export function parseTime(str) {
  if (!str || typeof str !== 'string') return 0;
  const s = str.trim().replace(',', '.');
  const parts = s.split(':').map(Number);
  if (parts.length >= 2) return parts[0] * 60 + (parts[1] || 0) + (parts[2] || 0) / 60;
  return parseFloat(s) * 60 || 0;
}

export function fmtTime(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

const PT_MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const EN_MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function normalizeMonthToken(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function monthIndexFromName(name) {
  const n = normalizeMonthToken(name);
  let idx = PT_MONTH_NAMES.findIndex((m) => n === m || n.startsWith(m.slice(0, 3)));
  if (idx < 0) idx = EN_MONTH_NAMES.findIndex((m) => n === m || n.startsWith(m.slice(0, 3)));
  return idx;
}

function dateFromMonthYear(name, year) {
  const idx = monthIndexFromName(name);
  if (idx < 0 || !Number.isFinite(year)) return null;
  const d = new Date(year, idx, 1);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Primeira data reconhecível em strings de período (Drag, pt-BR, planilha de horas). */
export function parseReportPeriodDate(period) {
  if (period == null) return null;
  let s = String(period).trim();
  if (!s) return null;

  if (s.includes('—')) s = s.split('—')[0].trim();
  if (s.includes(' / ')) s = s.split(' / ')[0].trim();
  else if (s.includes('/')) {
    const slashParts = s.split('/').map((p) => p.trim());
    if (slashParts.length === 2 && slashParts.every((p) => /^\d+$/.test(p))) {
      const a = Number(slashParts[0]);
      const b = Number(slashParts[1]);
      if (a > 31) return new Date(a, b - 1, 1);
      if (b > 31) return new Date(b, a - 1, 1);
    }
  }

  let m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }

  m = s.match(/(\d{4})[\/\-](\d{1,2})/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, 1);
    if (!Number.isNaN(d.getTime())) return d;
  }

  m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = new Date(+m[2], +m[1] - 1, 1);
    if (!Number.isNaN(d.getTime())) return d;
  }

  m = s.match(/(\d{1,2})\s+([A-Za-zÀ-ú]+)\s+(\d{4})/);
  if (m) {
    const d = dateFromMonthYear(m[2], +m[3]);
    if (d) {
      d.setDate(+m[1]);
      return d;
    }
    const en = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!Number.isNaN(en.getTime())) return en;
  }

  m = s.match(/([A-Za-zÀ-ú]+)\s+de\s+(\d{4})/i);
  if (m) return dateFromMonthYear(m[1], +m[2]);

  m = s.match(/^([A-Za-zÀ-ú]+)\s+(\d{4})$/i);
  if (m) return dateFromMonthYear(m[1], +m[2]);

  return null;
}

/** Rótulo curto do mês do relatório, ex. Mai/2026 */
export function formatReportMonthLabel(period) {
  const d = parseReportPeriodDate(period);
  return d ? formatReportMonthLabelFromDate(d) : '';
}

export function formatReportMonthLabelFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const m = date.toLocaleDateString('pt-BR', { month: 'short' }).replace(/\./g, '').trim();
  const cap = m.charAt(0).toUpperCase() + m.slice(1);
  return `${cap}/${date.getFullYear()}`;
}

/** Título da entrada no histórico com prefixo do mês do relatório */
export function formatHistEntryTitle(entry, typeLabels = {}) {
  const base = entry.title || typeLabels[entry.type] || entry.type || 'Relatório';
  const period = entry.period || entry.payload?.meta?.period || '';
  let month = formatReportMonthLabel(period);
  if (!month && entry.savedAt) {
    month = formatReportMonthLabelFromDate(new Date(entry.savedAt));
  }
  if (!month) return base;
  const head = month.toLowerCase().slice(0, 4);
  if (base.toLowerCase().startsWith(head)) return base;
  return `${month} — ${base}`;
}

let loadingCount = 0;

export function setLoading(active, message = 'Processando…') {
  const el = document.getElementById('app-loading');
  if (!el) return;
  if (active) {
    loadingCount += 1;
    el.querySelector('.app-loading-msg').textContent = message;
    el.classList.add('active');
  } else {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) el.classList.remove('active');
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsvFile(file, onComplete) {
  if (typeof Papa === 'undefined') {
    alert('Biblioteca CSV não carregada.');
    return;
  }
  setLoading(true, 'Lendo CSV…');
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => String(h).replace(/\ufeff/g, '').trim(),
    complete: (r) => {
      setLoading(false);
      onComplete(normalizeCsvData(r.data));
    },
    error: () => {
      setLoading(false);
      alert('Erro ao ler o arquivo CSV.');
    },
  });
}

/**
 * CSV de suporte — export Drag Daily Cards (metadados + cabeçalho na ~linha 6).
 */
export function parseSuporteCsvFile(file, onComplete) {
  if (typeof Papa === 'undefined') {
    alert('Biblioteca CSV não carregada.');
    return;
  }
  setLoading(true, 'Lendo CSV do Drag…');
  Papa.parse(file, {
    header: false,
    skipEmptyLines: 'greedy',
    complete: (r) => {
      setLoading(false);
      const { rows, meta } = parseDragDailyCardsMatrix(r.data || []);
      onComplete(rows, meta);
    },
    error: () => {
      setLoading(false);
      alert('Erro ao ler o arquivo CSV.');
    },
  });
}


export function showToast(msg, duration = 2500) {
  const t = document.getElementById('hist-toast');
  if (!t) return;
  const prev = t.textContent;
  t.textContent = msg || '✓ Salvo no histórico';
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    if (prev) t.textContent = prev;
  }, duration);
}
