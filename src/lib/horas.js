import { CAT_COLORS, CAT_ORDER, SHEETS_KEY } from './config.js';
import {
  escapeHtml,
  findCol,
  fmtTime,
  normalizeCsvData,
  parseCsvFile,
  parseTime,
  setLoading,
  showToast,
} from './utils.js';
import { extractReportMonthFromPeriodLabel, reportMonthLabel } from './report-period.js';

let hAllRows = [];
let hFilterSis = 'ALL';
let hFilterSem = 'ALL';
let hAutoRefreshTimer = null;

export function getHorasRows() {
  return hAllRows;
}

export function getHorasFilters() {
  return { sis: hFilterSis, sem: hFilterSem };
}

export function processHorasRows(data) {
  if (!data.length) {
    alert('CSV vazio ou inválido.');
    return null;
  }
  const normalized = normalizeCsvData(data);
  const headers = Object.keys(normalized[0]);
  const colMes = findCol(headers, ['MÊS', 'MES', 'MONTH']);
  const colSem = findCol(headers, ['SEMANA', 'WEEK', 'SEM']);
  const colHrs = findCol(headers, ['HORAS', 'HORA', 'TIME', 'HRS']);
  const colSis = findCol(headers, ['SISTEMA', 'SYSTEM', 'SYS']);
  const colCat = findCol(headers, ['CATEGORIA', 'CATEGORY', 'CAT']);
  const colDesc = findCol(headers, ['DESCRIÇÃO', 'DESCRICAO', 'DESC', 'DESCRIPTION']);

  hAllRows = normalized
    .filter((r) => colHrs && r[colHrs] && String(r[colHrs]).trim())
    .map((r) => ({
      mes: (r[colMes] || '').trim().toUpperCase(),
      sem: (r[colSem] || '').trim(),
      mins: parseTime(r[colHrs] || ''),
      sis: (r[colSis] || '').trim().toUpperCase(),
      cat: (r[colCat] || '').trim().toUpperCase(),
      desc: (r[colDesc] || '').trim(),
    }))
    .filter((r) => r.mins > 0);

  hFilterSis = 'ALL';
  hFilterSem = 'ALL';
  renderHorasReport();
  import('./history.js').then(({ histAutoSave }) => histAutoSave('horas'));
  return { rows: hAllRows, filterSis: hFilterSis, filterSem: hFilterSem };
}

export function renderHorasReport() {
  document.getElementById('h-upload-area').style.display = 'none';
  document.getElementById('h-report-wrap').style.display = 'block';

  const rows = hAllRows;
  const mes = [...new Set(rows.map((r) => r.mes).filter(Boolean))].join(' / ') || 'Período';
  const semanas = [...new Set(rows.map((r) => r.sem))].filter(Boolean).sort((a, b) => +a - +b);
  const sistemas = [...new Set(rows.map((r) => r.sis))].filter(Boolean).sort();

  document.getElementById('h-rpt-period').textContent = mes;
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
  hFilterSis = payload.filterSis || 'ALL';
  hFilterSem = payload.filterSem || 'ALL';
  renderHorasReport();
}

export function buildHorasPreviewHtml(payload) {
  const prev = { rows: hAllRows, filterSis: hFilterSis, filterSem: hFilterSem };
  applyHorasPayload(payload);
  const html = document.getElementById('h-report-wrap').innerHTML;
  applyHorasPayload(prev);
  return `<div class="report-wrap" style="display:block;">${html}</div>`;
}

export function buildHorasMeta() {
  const uniqueMes = [...new Set(hAllRows.map((r) => r.mes).filter(Boolean))];
  const mes = uniqueMes.join(' / ') || 'Período';
  const reportMonth =
    uniqueMes.length === 1
      ? extractReportMonthFromPeriodLabel(uniqueMes[0])
      : extractReportMonthFromPeriodLabel(uniqueMes[0]) || null;
  return {
    title: 'Horas de Desenvolvimento',
    period: reportMonth ? reportMonthLabel(reportMonth) : mes,
    reportMonth,
  };
}

export function resetHorasView() {
  hAllRows = [];
  document.getElementById('h-upload-area').style.display = 'flex';
  document.getElementById('h-report-wrap').style.display = 'none';
  const input = document.getElementById('h-csv-input');
  if (input) input.value = '';
}

export function loadHorasDemo() {
  const demo = [
    { MÊS: 'FEVEREIRO', SEMANA: '1', 'HORAS/MINUTOS': '1:00:00', SISTEMA: 'OS2', CATEGORIA: 'NOVA FEATURE', DESCRIÇÃO: 'download do recibo de verbas' },
    { MÊS: 'FEVEREIRO', SEMANA: '1', 'HORAS/MINUTOS': '3:00:00', SISTEMA: 'FORE', CATEGORIA: 'NOVA FEATURE', DESCRIÇÃO: 'reconhecimento automático de template - ocr' },
    { MÊS: 'FEVEREIRO', SEMANA: '2', 'HORAS/MINUTOS': '8:00:00', SISTEMA: 'OS2', CATEGORIA: 'NOVA FEATURE', DESCRIÇÃO: 'Refatoração de onboarding' },
    { MÊS: 'FEVEREIRO', SEMANA: '4', 'HORAS/MINUTOS': '5:00:00', SISTEMA: 'FORE', CATEGORIA: 'NOVA FEATURE', DESCRIÇÃO: 'novo fluxo de aprovação de NFs' },
  ];
  processHorasRows(demo);
}

function hGetSheetsCfg() {
  try {
    return JSON.parse(localStorage.getItem(SHEETS_KEY));
  } catch {
    return null;
  }
}

function hSetSheetsCfg(cfg) {
  localStorage.setItem(SHEETS_KEY, JSON.stringify(cfg));
}

async function hFetchSheets(url, method) {
  const cleanUrl = url.trim();
  if (method === 'appscript') {
    const res = await fetch(cleanUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  }
  return new Promise((resolve, reject) => {
    Papa.parse(cleanUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve(normalizeCsvData(r.data)),
      error: (e) => reject(new Error('Erro ao baixar CSV: ' + e.message)),
    });
  });
}

export function hSwitchTab(tab) {
  const isSheets = tab === 'sheets';
  document.getElementById('h-panel-upload').style.display = isSheets ? 'none' : 'block';
  document.getElementById('h-panel-sheets').style.display = isSheets ? 'block' : 'none';
  document.getElementById('h-tab-upload').style.background = isSheets ? '#f7f8fa' : 'white';
  document.getElementById('h-tab-upload').style.color = isSheets ? '#888' : '#444';
  document.getElementById('h-tab-sheets').style.background = isSheets ? 'white' : '#f7f8fa';
  document.getElementById('h-tab-sheets').style.color = isSheets ? '#444' : '#888';
  if (isSheets) hLoadSheetsUI();
}

export function hMethodChange(val) {
  document.getElementById('h-instr-publish').style.display = val === 'publish' ? 'block' : 'none';
  document.getElementById('h-instr-apps').style.display = val === 'appscript' ? 'block' : 'none';
}

export function hCopyScript() {
  const code = document.getElementById('h-apps-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('✓ Código copiado!');
  }).catch(() => alert('Copie o código manualmente.'));
}

function hLoadSheetsUI() {
  const cfg = hGetSheetsCfg();
  if (!cfg) return;
  document.getElementById('h-sheets-url').value = cfg.url;
  const methodEl = document.querySelector(`input[name="h-method"][value="${cfg.method}"]`);
  if (methodEl) {
    methodEl.checked = true;
    hMethodChange(cfg.method);
  }
  document.getElementById('h-auto-refresh').checked = cfg.autoRefresh || false;
  document.getElementById('h-refresh-interval').value = cfg.interval || 5;
  const status = document.getElementById('h-sheets-status');
  status.style.display = 'flex';
  document.getElementById('h-sheets-status-text').textContent =
    `Conectado · Última atualização: ${cfg.lastFetched || 'nunca'}`;
}

export async function hSheetsConnect() {
  const url = document.getElementById('h-sheets-url').value.trim();
  const method = document.querySelector('input[name="h-method"]:checked')?.value || 'publish';
  const errEl = document.getElementById('h-sheets-error');
  errEl.style.display = 'none';
  if (!url) {
    errEl.textContent = 'Cole a URL antes de conectar.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('h-sheets-connect-btn');
  btn.textContent = 'Conectando...';
  btn.disabled = true;
  setLoading(true, 'Buscando planilha…');

  try {
    const rows = await hFetchSheets(url, method);
    if (!rows?.length) throw new Error('Nenhum dado retornado. Verifique se a planilha está publicada corretamente.');
    const now = new Date().toLocaleString('pt-BR');
    const autoRefresh = document.getElementById('h-auto-refresh').checked;
    const interval = parseInt(document.getElementById('h-refresh-interval').value, 10);
    hSetSheetsCfg({ url, method, autoRefresh, interval, lastFetched: now });
    hStartAutoRefresh();
    hUpdateLiveIndicator(now);
    processHorasRows(rows);
  } catch (err) {
    errEl.textContent = err.message || 'Erro ao buscar dados.';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Conectar';
    btn.disabled = false;
    setLoading(false);
  }
}

export async function hSheetsRefresh() {
  const cfg = hGetSheetsCfg();
  if (!cfg) return;
  const btn = document.getElementById('h-refresh-btn');
  if (btn) {
    btn.textContent = '⟳ Buscando...';
    btn.disabled = true;
  }
  setLoading(true, 'Atualizando dados…');
  try {
    const rows = await hFetchSheets(cfg.url, cfg.method);
    if (!rows?.length) throw new Error('Sem dados');
    const now = new Date().toLocaleString('pt-BR');
    cfg.lastFetched = now;
    hSetSheetsCfg(cfg);
    hUpdateLiveIndicator(now);
    processHorasRows(rows);
  } catch (err) {
    alert('Erro ao atualizar: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = '⟳ Atualizar';
      btn.disabled = false;
    }
    setLoading(false);
  }
}

function hStartAutoRefresh() {
  if (hAutoRefreshTimer) clearInterval(hAutoRefreshTimer);
  const cfg = hGetSheetsCfg();
  if (!cfg?.autoRefresh) return;
  hAutoRefreshTimer = setInterval(() => hSheetsRefresh(), cfg.interval * 60 * 1000);
}

export function hSheetsDisconnect() {
  if (hAutoRefreshTimer) clearInterval(hAutoRefreshTimer);
  localStorage.removeItem(SHEETS_KEY);
  document.getElementById('h-sheets-status').style.display = 'none';
  document.getElementById('h-sheets-url').value = '';
  document.getElementById('h-live-indicator').style.display = 'none';
  document.getElementById('h-rpt-refresh-btn').style.display = 'none';
}

function hUpdateLiveIndicator(lastFetched) {
  const ind = document.getElementById('h-live-indicator');
  ind.style.display = 'flex';
  document.getElementById('h-live-label').textContent = 'Atualizado ' + (lastFetched || '');
  document.getElementById('h-rpt-refresh-btn').style.display = 'inline-block';
  const statusEl = document.getElementById('h-sheets-status');
  if (statusEl) {
    statusEl.style.display = 'flex';
    document.getElementById('h-sheets-status-text').textContent =
      'Conectado · Última atualização: ' + (lastFetched || '');
  }
}

export function initHoras() {
  const input = document.getElementById('h-csv-input');
  const dz = document.getElementById('h-drop-zone');
  if (input) {
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      parseCsvFile(file, processHorasRows);
    });
  }
  if (dz) {
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('drag-over');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      parseCsvFile(file, processHorasRows);
    });
  }

  const cfg = hGetSheetsCfg();
  if (cfg) {
    hFetchSheets(cfg.url, cfg.method)
      .then((rows) => {
        if (rows?.length) {
          const now = new Date().toLocaleString('pt-BR');
          cfg.lastFetched = now;
          hSetSheetsCfg(cfg);
          hUpdateLiveIndicator(now);
          processHorasRows(rows);
          hStartAutoRefresh();
        }
      })
      .catch(() => {});
  }
}
