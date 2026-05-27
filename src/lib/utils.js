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
  if (typeof str === 'number' && Number.isFinite(str)) {
    if (str <= 0) return 0;
    // Apps Script getValues() retorna durações como fração de dia (ex.: 0.5 = 12h).
    if (str <= 1) return str * 24 * 60;
    if (str <= 24) return str * 60;
    return str;
  }
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
