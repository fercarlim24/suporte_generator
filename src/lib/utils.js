/** Escape text for safe HTML interpolation */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalize CSV row keys (CARD NAME vs CARD_NAME, etc.) */
export function normalizeCsvRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    let key = String(k).trim().toUpperCase().replace(/\s+/g, ' ').replace(/_/g, ' ');
    out[key] = v;
  }
  return out;
}

export function normalizeCsvData(rows) {
  return rows.map(normalizeCsvRow);
}

export function getCardName(row) {
  return (row['CARD NAME'] || row.CARD_NAME || '').trim();
}

export function getTagsRaw(row) {
  return row.TAGS || '';
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
