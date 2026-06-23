import { CAT_COLORS, CAT_ORDER, HORAS_DRAFT_KEY } from './config.js';
import { parseHorasPasteBlock } from './horas-paste.js';
import { reportMonthLabel } from './report-period.js';
import {
  escapeHtml,
  fmtTime,
  minsToTimeStr,
  parseTime,
  showToast,
} from './utils.js';

const SIS_OPTIONS = ['OS2', 'FORE'];
const WEEK_OPTIONS = ['1', '2', '3', '4', '5'];

let hAllRows = [];
let hFilterSis = 'ALL';
let hFilterSem = 'ALL';
let hReportMonth = '';
/** @type {Array<{ id: string, sem: string, sis: string, cat: string, timeStr: string, desc: string }>} */
let hDraftEntries = [];
let hEditorSaveTimer = null;

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function defaultReportMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthKeyToMesToken(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
}

export function normalizeHorasDraftEntry(entry = {}) {
  return {
    id: entry.id || crypto.randomUUID(),
    sem: String(entry.sem || '1'),
    sis: SIS_OPTIONS.includes(entry.sis) ? entry.sis : 'OS2',
    cat: entry.cat || CAT_ORDER[0],
    timeStr: entry.timeStr || minsToTimeStr(entry.mins) || '',
    desc: String(entry.desc || '').trim(),
  };
}

export function draftEntryToRow(entry, reportMonth) {
  const mins = parseTime(entry.timeStr);
  return {
    mes: monthKeyToMesToken(reportMonth),
    sem: String(entry.sem || '').trim(),
    mins,
    sis: String(entry.sis || 'OS2').trim().toUpperCase(),
    cat: String(entry.cat || '').trim().toUpperCase(),
    desc: String(entry.desc || '').trim(),
  };
}

export function rowsToDraftEntries(rows = []) {
  return rows.map((r) =>
    normalizeHorasDraftEntry({
      id: crypto.randomUUID(),
      sem: r.sem,
      sis: r.sis,
      cat: r.cat,
      timeStr: minsToTimeStr(r.mins),
      desc: r.desc,
    }),
  );
}

function scheduleDraftSave() {
  clearTimeout(hEditorSaveTimer);
  hEditorSaveTimer = setTimeout(saveHorasDraft, 400);
}

function saveHorasDraft() {
  try {
    localStorage.setItem(
      HORAS_DRAFT_KEY,
      JSON.stringify({ reportMonth: hReportMonth, entries: hDraftEntries }),
    );
  } catch {
    /* ignore quota */
  }
}

function loadHorasDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(HORAS_DRAFT_KEY));
    if (!raw) return false;
    hReportMonth = raw.reportMonth || defaultReportMonth();
    hDraftEntries = (raw.entries || []).map(normalizeHorasDraftEntry);
    return true;
  } catch {
    return false;
  }
}

function syncRowsFromDraft() {
  hAllRows = hDraftEntries
    .map((e) => draftEntryToRow(e, hReportMonth))
    .filter((r) => r.mins > 0);
}

export function getHorasRows() {
  return hAllRows;
}

export function getHorasFilters() {
  return { sis: hFilterSis, sem: hFilterSem };
}

export function getHorasReportMonth() {
  return hReportMonth;
}

function blankEntry() {
  return normalizeHorasDraftEntry({ sem: '1', sis: 'OS2', cat: CAT_ORDER[0], timeStr: '', desc: '' });
}

export function importHorasPaste(text, options = {}) {
  const { replace = false } = options;
  const parsed = parseHorasPasteBlock(text, {
    refDate: hReportMonth ? new Date(`${hReportMonth}-15`) : new Date(),
  });

  if (!parsed.entries.length) {
    return { ok: false, message: 'Nenhum lançamento reconhecido. Use linhas como: 4h - Descrição da tarefa' };
  }

  if (parsed.reportMonth) {
    hReportMonth = parsed.reportMonth;
    const monthInput = document.getElementById('h-month-input');
    if (monthInput) monthInput.value = hReportMonth;
  }

  const imported = parsed.entries.map((e) => normalizeHorasDraftEntry(e));
  const hasContent = hDraftEntries.some((e) => parseTime(e.timeStr) > 0);

  if (replace || !hasContent) {
    hDraftEntries = imported;
  } else {
    hDraftEntries = [...hDraftEntries.filter((e) => parseTime(e.timeStr) > 0), ...imported];
  }

  renderHorasEditor();
  scheduleDraftSave();

  const skippedNote = parsed.skipped.length ? ` · ${parsed.skipped.length} linha(s) ignorada(s)` : '';
  return {
    ok: true,
    message: `${imported.length} lançamento(s) importado(s)${skippedNote}`,
    count: imported.length,
  };
}

export function handleHorasPasteImport() {
  const textarea = document.getElementById('h-paste-input');
  const replace = document.getElementById('h-paste-replace')?.checked;
  const text = textarea?.value || '';
  if (!text.trim()) {
    showToast('Cole o bloco de horas antes de importar');
    return;
  }
  const result = importHorasPaste(text, { replace });
  if (!result.ok) {
    alert(result.message);
    return;
  }
  showToast(`✓ ${result.message}`);
  if (textarea) textarea.value = '';
}

export function addHorasDraftRow() {
  hDraftEntries.push(blankEntry());
  renderHorasEditor();
  scheduleDraftSave();
}

export function removeHorasDraftRow(id) {
  hDraftEntries = hDraftEntries.filter((e) => e.id !== id);
  if (!hDraftEntries.length) hDraftEntries.push(blankEntry());
  renderHorasEditor();
  scheduleDraftSave();
}

export function showHorasEditor() {
  document.getElementById('h-editor-area').style.display = 'block';
  document.getElementById('h-report-wrap').style.display = 'none';
  renderHorasEditor();
}

export function generateHorasReport() {
  const monthInput = document.getElementById('h-month-input');
  hReportMonth = monthInput?.value || hReportMonth || defaultReportMonth();
  if (monthInput) monthInput.value = hReportMonth;

  syncRowsFromDraft();
  if (!hAllRows.length) {
    alert('Adicione pelo menos um lançamento com horas válidas (ex.: 1:30 ou 2:00:00).');
    return null;
  }

  hFilterSis = 'ALL';
  hFilterSem = 'ALL';
  document.getElementById('h-editor-area').style.display = 'none';
  renderHorasReport();
  saveHorasDraft();
  import('./history.js').then(({ histAutoSave }) => histAutoSave('horas'));
  return { rows: hAllRows, filterSis: hFilterSis, filterSem: hFilterSem };
}

function renderHorasEditor() {
  const monthInput = document.getElementById('h-month-input');
  if (monthInput && !monthInput.value) monthInput.value = hReportMonth || defaultReportMonth();

  const tbody = document.getElementById('h-entries-body');
  if (!tbody) return;

  if (!hDraftEntries.length) hDraftEntries.push(blankEntry());

  tbody.innerHTML = hDraftEntries
    .map((entry) => {
      const weekOpts = WEEK_OPTIONS.map(
        (w) =>
          `<option value="${w}"${entry.sem === w ? ' selected' : ''}>S${w}</option>`,
      ).join('');
      const sisOpts = SIS_OPTIONS.map(
        (s) => `<option value="${s}"${entry.sis === s ? ' selected' : ''}>${s}</option>`,
      ).join('');
      const catOpts = CAT_ORDER.map(
        (c) => `<option value="${c}"${entry.cat === c ? ' selected' : ''}>${c}</option>`,
      ).join('');
      return `<tr data-id="${entry.id}">
        <td><select class="h-field" data-field="sem">${weekOpts}</select></td>
        <td><select class="h-field" data-field="sis">${sisOpts}</select></td>
        <td><select class="h-field" data-field="cat">${catOpts}</select></td>
        <td><input class="h-field h-time" data-field="timeStr" type="text" value="${escapeHtml(entry.timeStr)}" placeholder="1:30"></td>
        <td><input class="h-field h-desc" data-field="desc" type="text" value="${escapeHtml(entry.desc)}" placeholder="Descrição da atividade"></td>
        <td><button type="button" class="h-row-remove" data-remove="${entry.id}" title="Remover">✕</button></td>
      </tr>`;
    })
    .join('');

  const totalMins = hDraftEntries.reduce((a, e) => a + parseTime(e.timeStr), 0);
  const summary = document.getElementById('h-editor-summary');
  if (summary) {
    summary.textContent = `${hDraftEntries.length} linha(s) · ${fmtTime(totalMins)} no rascunho`;
  }
}

function onEditorInput(e) {
  const field = e.target.dataset?.field;
  if (!field) return;
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const entry = hDraftEntries.find((x) => x.id === row.dataset.id);
  if (!entry) return;
  entry[field] = e.target.value;
  scheduleDraftSave();
  if (field === 'timeStr') {
    const summary = document.getElementById('h-editor-summary');
    if (summary) {
      const totalMins = hDraftEntries.reduce((a, x) => a + parseTime(x.timeStr), 0);
      summary.textContent = `${hDraftEntries.length} linha(s) · ${fmtTime(totalMins)} no rascunho`;
    }
  }
}

export function renderHorasReport() {
  document.getElementById('h-editor-area').style.display = 'none';
  document.getElementById('h-report-wrap').style.display = 'block';

  const rows = hAllRows;
  const periodLabel = hReportMonth ? reportMonthLabel(hReportMonth) : 'Período';
  const semanas = [...new Set(rows.map((r) => r.sem))].filter(Boolean).sort((a, b) => +a - +b);
  const sistemas = [...new Set(rows.map((r) => r.sis))].filter(Boolean).sort();

  document.getElementById('h-rpt-period').textContent = periodLabel;
  document.getElementById('h-rpt-footer-right').textContent =
    'Gerado em ' + new Date().toLocaleDateString('pt-BR');

  const totalMins = rows.reduce((a, r) => a + r.mins, 0);
  const os2Mins = rows.filter((r) => r.sis === 'OS2').reduce((a, r) => a + r.mins, 0);
  const foreMins = rows.filter((r) => r.sis === 'FORE').reduce((a, r) => a + r.mins, 0);

  document.getElementById('h-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Total horas mês</div><div class="metric-value time-val">${fmtTime(totalMins)}</div><div class="metric-sub">${rows.length} lançamentos</div></div>
    <div class="metric"><div class="metric-label">OS2</div><div class="metric-value time-val" style="color:#3730a3">${fmtTime(os2Mins)}</div><div class="metric-sub">${Math.round((os2Mins / totalMins) * 100) || 0}% do total</div></div>
    <div class="metric"><div class="metric-label">FORE</div><div class="metric-value time-val" style="color:#854d0e">${fmtTime(foreMins)}</div><div class="metric-sub">${Math.round((foreMins / totalMins) * 100) || 0}% do total</div></div>
    <div class="metric"><div class="metric-label">Semanas</div><div class="metric-value">${semanas.length}</div><div class="metric-sub">${semanas.map((s) => 'S' + s).join(' · ')}</div></div>
  `;

  const weekRows = semanas.map((s) => {
    const sr = rows.filter((r) => r.sem === s);
    const sOs2 = sr.filter((r) => r.sis === 'OS2').reduce((a, r) => a + r.mins, 0);
    const sFore = sr.filter((r) => r.sis === 'FORE').reduce((a, r) => a + r.mins, 0);
    return `<tr>
      <td><strong>Semana ${escapeHtml(s)}</strong></td>
      ${sistemas.includes('OS2') ? `<td class="time-val"><span class="sys-badge sys-os2">OS2</span> ${fmtTime(sOs2)}</td>` : ''}
      ${sistemas.includes('FORE') ? `<td class="time-val"><span class="sys-badge sys-fore">FORE</span> ${fmtTime(sFore)}</td>` : ''}
      <td class="time-val week-total">${fmtTime(sOs2 + sFore)}</td>
    </tr>`;
  });
  weekRows.push(`<tr>
    <td><strong>TOTAL</strong></td>
    ${sistemas.includes('OS2') ? `<td class="time-val week-total">${fmtTime(os2Mins)}</td>` : ''}
    ${sistemas.includes('FORE') ? `<td class="time-val week-total">${fmtTime(foreMins)}</td>` : ''}
    <td class="time-val week-total">${fmtTime(totalMins)}</td>
  </tr>`);

  document.getElementById('h-week-table').innerHTML = `
    <div class="rpt-card-title"><span class="dot" style="background:#60a5fa;width:8px;height:8px;border-radius:50%;display:inline-block;"></span>&nbsp;Horas por semana</div>
    <table class="week-table">
      <thead><tr><th>Semana</th>${sistemas.includes('OS2') ? '<th>OS2</th>' : ''}${sistemas.includes('FORE') ? '<th>FORE</th>' : ''}<th>Total</th></tr></thead>
      <tbody>${weekRows.join('')}</tbody>
    </table>`;

  function catBreakdown(sys) {
    const sr = rows.filter((r) => r.sis === sys);
    const tot = sr.reduce((a, r) => a + r.mins, 0);
    const cats = CAT_ORDER.map((c) => {
      const m = sr.filter((r) => r.cat === c).reduce((a, r) => a + r.mins, 0);
      return { c, m };
    }).filter((x) => x.m > 0);
    const known = new Set(CAT_ORDER);
    const unk = {};
    sr.forEach((r) => {
      if (!known.has(r.cat) && r.cat) unk[r.cat] = (unk[r.cat] || 0) + r.mins;
    });
    Object.entries(unk).forEach(([c, m]) => cats.push({ c, m }));
    if (!cats.length) return '<p style="font-size:12px;color:#aaa;padding:8px 0;">Sem dados.</p>';
    return cats
      .sort((a, b) => b.m - a.m)
      .map(({ c, m }) => {
        const pct = tot ? Math.round((m / tot) * 100) : 0;
        const cc = CAT_COLORS[c] || { bar: '#94a3b8', cls: 'cat-other' };
        return `<div class="hcat-row">
        <span class="cat-pill ${cc.cls}">${escapeHtml(c)}</span>
        <div class="hcat-bar-wrap"><div class="hcat-bar-fill" style="width:${pct}%;background:${cc.bar};"></div></div>
        <span class="hcat-time">${fmtTime(m)}</span>
      </div>`;
      })
      .join('');
  }

  const catCols = sistemas
    .map(
      (sys) => `
    <div class="rpt-card">
      <div class="rpt-card-title">
        <span class="dot" style="background:${sys === 'OS2' ? '#818cf8' : '#fbbf24'};width:8px;height:8px;border-radius:50%;display:inline-block;"></span>
        &nbsp;${escapeHtml(sys)} — por categoria
      </div>
      ${catBreakdown(sys)}
    </div>`,
    )
    .join('');
  document.getElementById('h-cat-cols').innerHTML = catCols;
  document.getElementById('h-cat-cols').style.gridTemplateColumns = `repeat(${Math.min(sistemas.length, 2)},1fr)`;

  const filtersEl = document.getElementById('h-task-filters');
  filtersEl.innerHTML = '';
  const addFilter = (label, active, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    filtersEl.appendChild(btn);
  };

  addFilter('Todas semanas', hFilterSem === 'ALL', () => {
    hFilterSem = 'ALL';
    renderHorasReport();
  });
  semanas.forEach((s) => {
    addFilter('Semana ' + s, hFilterSem === s, () => {
      hFilterSem = s;
      renderHorasReport();
    });
  });
  const sep = document.createElement('span');
  sep.style.cssText = 'width:1px;height:16px;background:#e2e8f0;display:inline-block;margin:0 4px;';
  filtersEl.appendChild(sep);
  addFilter('OS2 + FORE', hFilterSis === 'ALL', () => {
    hFilterSis = 'ALL';
    renderHorasReport();
  });
  sistemas.forEach((s) => {
    addFilter(s, hFilterSis === s, () => {
      hFilterSis = s;
      renderHorasReport();
    });
  });

  renderHorasTasks();
}

function renderHorasTasks() {
  let filtered = hAllRows;
  if (hFilterSem !== 'ALL') filtered = filtered.filter((r) => r.sem === hFilterSem);
  if (hFilterSis !== 'ALL') filtered = filtered.filter((r) => r.sis === hFilterSis);
  const total = filtered.reduce((a, r) => a + r.mins, 0);

  if (!filtered.length) {
    document.getElementById('h-task-list').innerHTML =
      '<div class="no-tasks">Nenhum lançamento encontrado para este filtro.</div>';
    document.getElementById('h-task-total').textContent = '';
    return;
  }
  document.getElementById('h-task-total').textContent =
    `${filtered.length} lançamentos · ${fmtTime(total)}`;
  document.getElementById('h-task-list').innerHTML = filtered
    .map((r) => {
      const cc = CAT_COLORS[r.cat] || { cls: 'cat-other' };
      const sysCls = r.sis === 'FORE' ? 'sys-fore' : 'sys-os2';
      return `<div class="task-row">
      <span class="task-week">S${escapeHtml(r.sem)} <span class="sys-badge ${sysCls}">${escapeHtml(r.sis)}</span></span>
      <span class="cat-pill ${cc.cls}">${escapeHtml(r.cat || '—')}</span>
      <span class="task-time">${fmtTime(r.mins)}</span>
      <span class="task-desc">${escapeHtml(r.desc || '—')}</span>
    </div>`;
    })
    .join('');
}

export function applyHorasPayload(payload) {
  hAllRows = payload.rows || [];
  hReportMonth = payload.reportMonth || payload.meta?.reportMonth || hReportMonth;
  hDraftEntries = rowsToDraftEntries(hAllRows);
  hFilterSis = payload.filterSis || 'ALL';
  hFilterSem = payload.filterSem || 'ALL';
  renderHorasReport();
}

export function buildHorasPreviewHtml(payload) {
  const prev = {
    rows: hAllRows,
    filterSis: hFilterSis,
    filterSem: hFilterSem,
    reportMonth: hReportMonth,
  };
  applyHorasPayload(payload);
  const html = document.getElementById('h-report-wrap').innerHTML;
  applyHorasPayload(prev);
  return `<div class="report-wrap" style="display:block;">${html}</div>`;
}

export function buildHorasMeta() {
  return {
    title: 'Horas de Desenvolvimento',
    period: hReportMonth ? reportMonthLabel(hReportMonth) : 'Período',
    reportMonth: hReportMonth || null,
  };
}

export function resetHorasView() {
  showHorasEditor();
}

export function clearHorasDraft() {
  if (!confirm('Limpar todos os lançamentos deste rascunho?')) return;
  hDraftEntries = [blankEntry()];
  hAllRows = [];
  renderHorasEditor();
  saveHorasDraft();
  showToast('Rascunho limpo');
}

export function loadHorasDemo() {
  hReportMonth = defaultReportMonth();
  hDraftEntries = [
    normalizeHorasDraftEntry({ sem: '1', sis: 'OS2', cat: 'NOVA FEATURE', timeStr: '1:00', desc: 'download do recibo de verbas' }),
    normalizeHorasDraftEntry({ sem: '1', sis: 'FORE', cat: 'NOVA FEATURE', timeStr: '3:00', desc: 'reconhecimento automático de template - ocr' }),
    normalizeHorasDraftEntry({ sem: '2', sis: 'OS2', cat: 'NOVA FEATURE', timeStr: '8:00', desc: 'Refatoração de onboarding' }),
    normalizeHorasDraftEntry({ sem: '4', sis: 'FORE', cat: 'NOVA FEATURE', timeStr: '5:00', desc: 'novo fluxo de aprovação de NFs' }),
  ];
  const monthInput = document.getElementById('h-month-input');
  if (monthInput) monthInput.value = hReportMonth;
  renderHorasEditor();
  saveHorasDraft();
}

export function initHoras() {
  if (!loadHorasDraft()) {
    hReportMonth = defaultReportMonth();
    hDraftEntries = [blankEntry()];
  }

  const editor = document.getElementById('h-editor-area');
  editor?.addEventListener('input', onEditorInput);
  editor?.addEventListener('change', onEditorInput);
  editor?.addEventListener('click', (e) => {
    const removeId = e.target.closest('[data-remove]')?.dataset.remove;
    if (removeId) removeHorasDraftRow(removeId);
  });

  document.getElementById('h-month-input')?.addEventListener('change', (e) => {
    hReportMonth = e.target.value || defaultReportMonth();
    scheduleDraftSave();
  });

  document.getElementById('h-add-row')?.addEventListener('click', addHorasDraftRow);
  document.getElementById('h-generate-report')?.addEventListener('click', generateHorasReport);
  document.getElementById('h-clear-draft')?.addEventListener('click', clearHorasDraft);
  document.getElementById('h-load-demo')?.addEventListener('click', loadHorasDemo);
  document.getElementById('h-paste-import')?.addEventListener('click', handleHorasPasteImport);

  showHorasEditor();
}
