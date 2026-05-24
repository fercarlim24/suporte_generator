import {
  HIST_KEY,
  HIST_KEY_LEGACY,
  HIST_MAX,
  REPORT_BADGE,
  REPORT_LABELS,
} from './config.js';
import { downloadJson, escapeHtml, showToast } from './utils.js';
import { buildSuporteMeta, buildSuportePreviewHtml, getCurrentSuporteData } from './suporte.js';
import { buildHorasMeta, buildHorasPreviewHtml, getHorasFilters, getHorasRows } from './horas.js';
import { buildOpMeta, buildOpPreviewHtml, getOpPayload } from './op.js';

let histCurrentId = null;
let histListFilter = 'ALL';

export function histGetAll() {
  try {
    const v2 = JSON.parse(localStorage.getItem(HIST_KEY)) || [];
    if (v2.length) return v2;
  } catch {
    /* ignore */
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(HIST_KEY_LEGACY)) || [];
    return legacy.map((e) => ({ ...e, legacy: true }));
  } catch {
    return [];
  }
}

export function histSetAll(arr) {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(arr));
    if (arr.length) localStorage.removeItem(HIST_KEY_LEGACY);
  } catch {
    alert('Armazenamento cheio. Exclua alguns relatórios antigos para liberar espaço.');
  }
}

function buildPayload(type) {
  if (type === 'suporte') {
    const data = getCurrentSuporteData();
    if (!data) return null;
    return { data, meta: buildSuporteMeta() };
  }
  if (type === 'horas') {
    const rows = getHorasRows();
    if (!rows.length) return null;
    const filters = getHorasFilters();
    return {
      rows,
      filterSis: filters.sis,
      filterSem: filters.sem,
      meta: buildHorasMeta(),
    };
  }
  if (type === 'op') {
    return { ...getOpPayload(), meta: buildOpMeta() };
  }
  return null;
}

export function buildMeta(type) {
  const p = buildPayload(type);
  if (!p) return { title: '', period: '' };
  if (p.meta) return p.meta;
  return { title: '', period: '' };
}

export function histSave(type) {
  const payload = buildPayload(type);
  if (!payload) {
    alert('Gere o relatório primeiro antes de salvar.');
    return;
  }
  const meta = payload.meta || buildMeta(type);
  const entry = {
    id: Date.now(),
    type,
    version: 2,
    title: meta.title,
    period: meta.period,
    savedAt: new Date().toISOString(),
    payload,
  };
  const all = histGetAll().filter((e) => !e.legacy);
  all.unshift(entry);
  histSetAll(all.slice(0, HIST_MAX));
  histUpdateHubCount();
  showToast('✓ Salvo no histórico');
}

export function exportReportJson(type) {
  const payload = buildPayload(type);
  if (!payload) {
    alert('Gere o relatório primeiro antes de exportar.');
    return;
  }
  const meta = payload.meta || buildMeta(type);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`ls2-${type}-${stamp}.json`, {
    type,
    exportedAt: new Date().toISOString(),
    title: meta.title,
    period: meta.period,
    payload,
  });
}

export function histDelete(id) {
  if (!confirm('Excluir este relatório do histórico?')) return;
  histSetAll(histGetAll().filter((e) => e.id !== id));
  histRenderList(histListFilter);
  histUpdateHubCount();
}

function renderEntryPreview(entry) {
  const content = document.getElementById('h-hist-preview-content');
  const isDark = entry.type === 'op';

  if (entry.legacy && entry.html) {
    content.className = isDark ? 'hist-preview-dark' : 'hist-preview-light';
    content.innerHTML = entry.html;
    return;
  }

  if (entry.version === 2 && entry.payload) {
    content.className = isDark ? 'hist-preview-dark' : 'hist-preview-light';
    if (entry.type === 'suporte') {
      const meta = entry.payload.meta || { period: entry.period, footerDate: '' };
      content.innerHTML = buildSuportePreviewHtml(entry.payload.data, meta);
    } else if (entry.type === 'horas') {
      content.innerHTML = buildHorasPreviewHtml({
        rows: entry.payload.rows,
        filterSis: entry.payload.filterSis,
        filterSem: entry.payload.filterSem,
      });
    } else if (entry.type === 'op') {
      content.className = 'hist-preview-dark';
      content.innerHTML = buildOpPreviewHtml(entry.payload);
    }
    return;
  }

  content.innerHTML = '<p style="padding:20px;color:#888;">Formato de relatório não suportado.</p>';
}

export function histView(id) {
  const entry = histGetAll().find((e) => e.id === id);
  if (!entry) return;
  histCurrentId = id;
  document.getElementById('h-hist-list').style.display = 'none';
  document.getElementById('h-hist-preview').style.display = 'block';
  renderEntryPreview(entry);
}

export function histBackToList() {
  document.getElementById('h-hist-preview').style.display = 'none';
  document.getElementById('h-hist-list').style.display = 'block';
  histCurrentId = null;
}

export function histPrintCurrent() {
  if (!histCurrentId) return;
  const entry = histGetAll().find((e) => e.id === histCurrentId);
  if (!entry) return;
  const frame = document.getElementById('print-frame');
  const isDark = entry.type === 'op';
  let html = '';
  if (entry.legacy && entry.html) {
    html = entry.html;
  } else if (entry.version === 2) {
    const tmp = document.getElementById('h-hist-preview-content');
    html = tmp ? tmp.innerHTML : '';
  }
  frame.innerHTML = isDark
    ? `<div style="font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:300;background:#0c0f1a;color:#e2e8f0;padding:10px;">${html}</div>`
    : `<div style="font-family:'Inter',system-ui,sans-serif;font-size:12px;background:white;color:#111;padding:32px;">${html}</div>`;
  document.body.classList.add('ph');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('ph');
    frame.innerHTML = '';
  }, 500);
}

export function histViewAndPrint(id) {
  histView(id);
  setTimeout(() => histPrintCurrent(), 150);
}

export function histRenderList(filter) {
  histListFilter = filter || 'ALL';
  const all = histGetAll();

  const types = [
    { key: 'ALL', label: 'Todos', count: all.length },
    { key: 'suporte', label: 'Suporte', count: all.filter((e) => e.type === 'suporte').length },
    { key: 'horas', label: 'Horas Dev', count: all.filter((e) => e.type === 'horas').length },
    { key: 'op', label: 'One Pager', count: all.filter((e) => e.type === 'op').length },
  ];

  const filtersEl = document.getElementById('h-hist-filters');
  filtersEl.innerHTML = '';
  types.forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hfilt' + (histListFilter === t.key ? ' active' : '');
    btn.innerHTML = `${t.label} <span style="opacity:.6;font-size:10px;">${t.count}</span>`;
    btn.addEventListener('click', () => histRenderList(t.key));
    filtersEl.appendChild(btn);
  });

  const shown = histListFilter === 'ALL' ? all : all.filter((e) => e.type === histListFilter);
  const container = document.getElementById('h-hist-entries');

  if (!shown.length) {
    container.innerHTML = `<div class="hist-empty">
      <div class="hist-empty-icon">📋</div>
      <div style="font-size:15px;color:var(--text);margin-bottom:8px;">Nenhum relatório salvo ainda</div>
      <div style="font-size:12px;">Gere um relatório em qualquer módulo e clique em <strong>☁ Salvar</strong>.</div>
    </div>`;
    return;
  }

  container.innerHTML = '';
  shown.forEach((e) => {
    const d = new Date(e.savedAt);
    const dateStr =
      d.toLocaleDateString('pt-BR') +
      ' às ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'hist-entry';
    row.innerHTML = `
      <span class="hist-badge ${REPORT_BADGE[e.type] || ''}">${REPORT_LABELS[e.type] || e.type}${e.legacy ? ' · legado' : ''}</span>
      <div class="hist-info">
        <div class="hist-title">${escapeHtml(e.title)}</div>
        <div class="hist-meta">${e.period ? escapeHtml(e.period) + ' · ' : ''}${dateStr}</div>
      </div>
      <div class="hist-actions"></div>`;
    const actions = row.querySelector('.hist-actions');
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ha-btn ' + (cls || '');
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    mk('Ver', '', () => histView(e.id));
    mk('↓ PDF', 'primary', () => histViewAndPrint(e.id));
    mk('✕', 'danger', () => histDelete(e.id));
    container.appendChild(row);
  });
}

export function histUpdateHubCount() {
  const n = histGetAll().length;
  const el = document.getElementById('hub-hist-count');
  if (el) el.textContent = n > 0 ? `${n} salvo${n !== 1 ? 's' : ''}` : '';
}


export function initHistory() {
  histUpdateHubCount();
}
