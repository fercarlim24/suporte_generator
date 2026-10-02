import { CAT_COLORS, CAT_ORDER, HORAS_DRAFT_KEY } from './config.js';
import { reportMonthLabel } from './report-period.js';
import {
  escapeHtml,
  fmtTime,
  minsToTimeStr,
  parseTime,
  showToast,
} from './utils.js';

const SIS_OPTIONS = ['OS2', 'FORE'];

let hAllRows = [];
let hFilterSis = 'ALL';
let hFilterSem = 'ALL';
let hReportMonth = '';
/** @type {Array<{ id: string, sem: string, sis: string, cat: string, timeStr: string, desc: string }>} */
let hDraftEntries = [];
let hEditorSaveTimer = null;
let activeWeek = '1';

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

function readDraftStore() {
  try {
    return JSON.parse(localStorage.getItem(HORAS_DRAFT_KEY)) || {};
  } catch {
    return {};
  }
}

function saveHorasDraft() {
  try {
    const store = readDraftStore();
    const byMonth = { ...(store.byMonth || {}) };
    if (hReportMonth) byMonth[hReportMonth] = hDraftEntries;
    localStorage.setItem(
      HORAS_DRAFT_KEY,
      JSON.stringify({ reportMonth: hReportMonth, entries: hDraftEntries, byMonth }),
    );
  } catch {
    /* ignore quota */
  }
}

function loadHorasDraft() {
  try {
    const raw = readDraftStore();
    if (!raw.entries && !raw.byMonth) return false;
    hReportMonth = raw.reportMonth || defaultReportMonth();
    const source = raw.byMonth?.[hReportMonth] || raw.entries || [];
    hDraftEntries = source.map(normalizeHorasDraftEntry);
    return true;
  } catch {
    return false;
  }
}

function hoursValue(mins) {
  if (!mins) return '';
  const hours = Math.round((mins / 60) * 100) / 100;
  return String(hours);
}

function cellMinutes(week, sis, cat) {
  return hDraftEntries
    .filter((entry) => entry.sem === String(week) && entry.sis === sis && entry.cat === cat)
    .reduce((sum, entry) => sum + parseTime(entry.timeStr), 0);
}

function setCellHours(week, sis, cat, raw) {
  const prev = hDraftEntries.find((entry) => entry.sem === String(week) && entry.sis === sis && entry.cat === cat);
  const keep = hDraftEntries.filter((entry) => !(entry.sem === String(week) && entry.sis === sis && entry.cat === cat));
  if (String(raw || '').trim()) {
    keep.push(
      normalizeHorasDraftEntry({
        id: prev?.id,
        sem: String(week),
        sis,
        cat,
        timeStr: String(raw).trim(),
        desc: prev?.desc || '',
      }),
    );
  }
  hDraftEntries = keep;
  scheduleDraftSave();
}

function launchedWeekCount() {
  const weeks = new Set();
  hDraftEntries.forEach((entry) => {
    const week = Number(entry.sem);
    if (week >= 1 && week <= 4 && parseTime(entry.timeStr) > 0) weeks.add(week);
  });
  return weeks.size;
}

function updateMatrixTotals() {
  let os2 = 0;
  let fore = 0;
  CAT_ORDER.forEach((cat) => {
    const os2Mins = cellMinutes(activeWeek, 'OS2', cat);
    const foreMins = cellMinutes(activeWeek, 'FORE', cat);
    os2 += os2Mins;
    fore += foreMins;
    const rowTotal = document.querySelector(`[data-row-total="${cat}"]`);
    if (rowTotal) rowTotal.textContent = fmtTime(os2Mins + foreMins);
  });
  const os2El = document.getElementById('h-total-os2');
  const foreEl = document.getElementById('h-total-fore');
  const allEl = document.getElementById('h-total-all');
  if (os2El) os2El.textContent = fmtTime(os2);
  if (foreEl) foreEl.textContent = fmtTime(fore);
  if (allEl) allEl.textContent = fmtTime(os2 + fore);
  const summary = document.getElementById('h-editor-summary');
  if (summary) summary.textContent = `${launchedWeekCount()} de 4 semanas lançadas`;
  const copy = document.getElementById('h-copy-week');
  if (copy) copy.disabled = Number(activeWeek) <= 1;
}

export function syncHorasToPeriod(period) {
  if (!period) return;
  if (period !== hReportMonth) {
    saveHorasDraft();
    const store = readDraftStore();
    hReportMonth = period;
    hDraftEntries = (store.byMonth?.[period] || []).map(normalizeHorasDraftEntry);
  }
  const monthInput = document.getElementById('h-month-input');
  if (monthInput) monthInput.value = hReportMonth;
  renderHorasEditor();
}

export function copyPreviousHorasWeek() {
  const prev = String(Number(activeWeek) - 1);
  if (Number(activeWeek) <= 1) return;
  CAT_ORDER.forEach((cat) => {
    SIS_OPTIONS.forEach((sis) => {
      const mins = cellMinutes(prev, sis, cat);
      setCellHours(activeWeek, sis, cat, hoursValue(mins));
    });
  });
  renderHorasEditor();
}

export async function saveHorasWeek() {
  const monthInput = document.getElementById('h-month-input');
  hReportMonth = monthInput?.value || hReportMonth || defaultReportMonth();
  syncRowsFromDraft();
  if (!hAllRows.length) {
    alert('Lance pelo menos uma hora antes de salvar a semana.');
    return null;
  }
  saveHorasDraft();
  const { histAutoSave } = await import('./history.js');
  const entry = await histAutoSave('horas');
  renderHorasEditor();
  return entry;
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

function renderWeekSeg() {
  const seg = document.getElementById('h-week-seg');
  if (!seg) return;
  seg.replaceChildren();
  ['1', '2', '3', '4'].forEach((week) => {
    const label = document.createElement('label');
    label.className = 'seg-opt';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'horas-week';
    input.value = week;
    input.checked = activeWeek === week;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      activeWeek = week;
      renderHorasEditor();
    });
    label.append(input, document.createTextNode(`S${week}`));
    seg.append(label);
  });
}

function renderHorasEditor() {
  const monthInput = document.getElementById('h-month-input');
  if (monthInput && !monthInput.value) monthInput.value = hReportMonth || defaultReportMonth();
  renderWeekSeg();

  const tbody = document.getElementById('h-matrix-body');
  if (!tbody) return;
  tbody.replaceChildren();
  CAT_ORDER.forEach((cat) => {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = cat;
    tr.append(name);
    SIS_OPTIONS.forEach((sis) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '0.25';
      input.className = 'input';
      input.setAttribute('aria-label', `${cat} ${sis}`);
      const mins = cellMinutes(activeWeek, sis, cat);
      input.value = hoursValue(mins);
      input.addEventListener('input', () => {
        setCellHours(activeWeek, sis, cat, input.value);
        updateMatrixTotals();
      });
      td.append(input);
      tr.append(td);
    });
    const total = document.createElement('td');
    total.className = 'matrix-total';
    total.dataset.rowTotal = cat;
    tr.append(total);
    tbody.append(tr);
  });
  updateMatrixTotals();
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

  document.getElementById('h-month-input')?.addEventListener('change', (e) => {
    syncHorasToPeriod(e.target.value || defaultReportMonth());
  });

  document.getElementById('h-generate-report')?.addEventListener('click', generateHorasReport);
  document.getElementById('h-save-week')?.addEventListener('click', () => saveHorasWeek());
  document.getElementById('h-copy-week')?.addEventListener('click', copyPreviousHorasWeek);
  document.getElementById('h-clear-draft')?.addEventListener('click', clearHorasDraft);
  document.getElementById('h-load-demo')?.addEventListener('click', loadHorasDemo);

  showHorasEditor();
}
