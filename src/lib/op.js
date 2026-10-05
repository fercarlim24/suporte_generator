import {
  OP_FIELDS,
  OP_SK,
  OP_SL,
  OP_SP,
  OP_STORAGE_KEY,
} from './config.js';
import { escapeHtml, showToast } from './utils.js';

const RAG_OPTIONS = [
  [0, 'No prazo', 'rag-ok'],
  [1, 'Atenção', 'rag-watch'],
  [2, 'Bloqueado', 'rag-block'],
];

function sprintList() {
  if (!Array.isArray(opState.sprints) || !opState.sprints.length) {
    opState.sprints = OP_SP.map(([name, date]) => ({ name, date }));
  }
  return opState.sprints;
}

function sprintCount() {
  return Math.max(sprintList().length, 1);
}

let opCloudTimer = null;

function queueOpCloudSave() {
  clearTimeout(opCloudTimer);
  opCloudTimer = setTimeout(() => {
    import('./history.js').then(({ histAutoSave }) => histAutoSave('op', { quiet: true }));
  }, 800);
}

const defaultState = {
  esc: 0,
  rm: 1,
  rec: 1,
  ri: 2,
  cu: 1,
  curSprint: 2,
  items: [
    { id: 1, n: 'Feature A', s: 0, e: 1, done: true },
    { id: 2, n: 'Feature B', s: 2, e: 3, done: false },
    { id: 3, n: 'Feature C', s: 4, e: 6, done: false },
  ],
};

export let opState = { ...defaultState, items: [...defaultState.items] };

export function getOpPayload() {
  const tx = {};
  OP_FIELDS.forEach((f) => {
    const el = document.getElementById('op-' + f);
    if (el) tx[f] = el.value;
  });
  return {
    state: JSON.parse(JSON.stringify(opState)),
    tx,
    produto: document.getElementById('op-produto')?.value || 'LandscapeOS 2',
    stakeholder: document.getElementById('op-stakeholder')?.value || '',
    data: document.getElementById('op-data')?.value || new Date().toLocaleDateString('pt-BR'),
  };
}

export function opSave() {
  const tx = {};
  OP_FIELDS.forEach((f) => {
    const el = document.getElementById('op-' + f);
    if (el) tx[f] = el.value;
  });
  try {
    localStorage.setItem(OP_STORAGE_KEY, JSON.stringify({ state: opState, tx }));
  } catch (e) {
    console.warn('Falha ao salvar One Pager:', e);
  }
}

export function opLoad() {
  try {
    const raw = localStorage.getItem(OP_STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.state) opState = { ...opState, ...d.state, items: d.state.items || opState.items };
    if (d.tx) {
      Object.entries(d.tx).forEach(([k, v]) => {
        const el = document.getElementById('op-' + k);
        if (el) el.value = v;
      });
    }
  } catch (e) {
    console.warn('Dados do One Pager corrompidos; usando padrão.', e);
  }
}

export function opRenderStatus() {
  const c = document.getElementById('op-status-rows');
  if (!c) return;
  c.replaceChildren();
  OP_SK.forEach((key, index) => {
    const row = document.createElement('div');
    row.className = 'status-row-op';
    const label = document.createElement('span');
    label.className = 'status-lbl';
    label.textContent = OP_SL[index];
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', OP_SL[index]);
    RAG_OPTIONS.forEach(([value, text, dotClass]) => {
      const option = document.createElement('label');
      option.className = 'seg-opt';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `rag-${key}`;
      input.value = String(value);
      input.checked = opState[key] === value;
      input.addEventListener('change', () => {
        opState[key] = value;
        opRenderVisao();
        opSave();
      });
      const dot = document.createElement('span');
      dot.className = `rag-dot ${dotClass}`;
      option.append(input, dot, document.createTextNode(` ${text}`));
      seg.append(option);
    });
    row.append(label, seg);
    c.append(row);
  });
}

export function opRenderVisao() {
  const ns = OP_SK.map((key) => opState[key]).filter((value) => value < 3);
  const worst = ns.length ? Math.max(...ns) : 1;
  const el = document.getElementById('op-visao');
  if (!el) return;
  el.className = `visao-circle ${RAG_OPTIONS[worst]?.[2] || 'rag-watch'}`;
}

export function opRenderSprintHdr() {
  const hdr = document.getElementById('op-sprint-hdr');
  if (!hdr) return;
  const count = sprintCount();
  hdr.style.gridTemplateColumns = `repeat(${count}, minmax(88px, 1fr))`;
  hdr.replaceChildren();
  sprintList().forEach((sprint, index) => {
    const cell = document.createElement('div');
    cell.className = 'sprint-hdr-cell';
    const name = document.createElement('input');
    name.className = 'input';
    name.value = sprint.name || '';
    name.setAttribute('aria-label', `Nome da sprint ${index + 1}`);
    name.addEventListener('input', () => {
      sprintList()[index].name = name.value;
      opPopulateSelects();
      opSave();
    });
    const date = document.createElement('input');
    date.className = 'input';
    date.value = sprint.date || '';
    date.setAttribute('aria-label', `Data da sprint ${index + 1}`);
    date.addEventListener('input', () => {
      sprintList()[index].date = date.value;
      opSave();
    });
    cell.append(name, date);
    hdr.append(cell);
  });
}

export function opRenderRoadmap() {
  const wrap = document.getElementById('op-roadmap-rows');
  if (!wrap) return;
  wrap.innerHTML = '';
  const count = sprintCount();
  const rows = [...opState.items, ...Array(Math.max(0, 4 - opState.items.length)).fill(null)];
  rows.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.style.gridTemplateColumns = `repeat(${count}, minmax(88px, 1fr))`;
    sprintList().forEach((_, ci) => {
      const cell = document.createElement('div');
      cell.className = 'item-cell' + (ci === opState.curSprint ? ' cur' : '');
      if (ci === opState.curSprint) {
        const l = document.createElement('div');
        l.className = 'cur-line';
        cell.appendChild(l);
      }
      row.appendChild(cell);
    });
    if (item) {
      const start = Math.min(Math.max(item.s, 0), count - 1);
      const end = Math.min(Math.max(item.e, start), count - 1);
      const bar = document.createElement('div');
      bar.className = 'rbar ' + (item.done ? 'done' : 'active');
      bar.style.left = `calc(${(start / count) * 100}% + 2px)`;
      bar.style.width = `calc(${((end - start + 1) / count) * 100}% - 4px)`;
      bar.onclick = () => {
        item.done = !item.done;
        opRenderRoadmap();
        opSave();
      };
      const label = document.createElement('span');
      label.className = 'rbar-text';
      label.textContent = item.done ? `${item.n} ✓` : item.n;
      bar.append(label);
      const del = document.createElement('button');
      del.textContent = '✕';
      del.className = 'np rbar-del';
      del.onclick = (e) => {
        e.stopPropagation();
        opState.items = opState.items.filter((it) => it.id !== item.id);
        opRenderRoadmap();
        opSave();
      };
      bar.appendChild(del);
      row.appendChild(bar);
    }
    wrap.appendChild(row);
  });
}

export function opPopulateSelects() {
  ['op-new-start', 'op-new-end', 'op-cur-sprint'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const previous = sel.value;
    sel.replaceChildren();
    sprintList().forEach((sprint, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = sprint.name || `Sprint ${i + 1}`;
      sel.appendChild(o);
    });
    if (id !== 'op-cur-sprint' && previous !== '') sel.value = previous;
    if (id === 'op-cur-sprint') sel.value = opState.curSprint;
  });
}

export function opToggleAdd() {
  document.getElementById('op-add-form')?.classList.toggle('open');
}

export function opAddSprint() {
  sprintList().push({ name: `Sprint ${sprintList().length + 1}`, date: '' });
  opRenderSprintHdr();
  opRenderRoadmap();
  opPopulateSelects();
  opSave();
  queueOpCloudSave();
}

export async function inheritPreviousOp() {
  const { histGetAll } = await import('./history.js');
  const { getState } = await import('./app-state.js');
  const { product } = getState();
  const prev = histGetAll()
    .filter((entry) => entry.type === 'op' && entry.version === 2 && entry.payload)
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
    .find((entry) => {
      const produto = entry.payload?.produto || '';
      const code = /fore/i.test(produto) && !/os\s*2|landscape/i.test(produto) ? 'FORE' : 'OS2';
      return !product || code === product;
    });
  if (!prev) {
    showToast('Nenhum one pager anterior');
    return;
  }
  applyOpPayload(prev.payload);
  opSave();
  queueOpCloudSave();
  showToast('Herdado da semana anterior');
}

export function opAddItem() {
  const n = document.getElementById('op-new-name')?.value.trim();
  if (!n) return;
  const s = +document.getElementById('op-new-start').value;
  const e = +document.getElementById('op-new-end').value;
  opState.items.push({ id: Date.now(), n, s, e, done: false });
  document.getElementById('op-new-name').value = '';
  opRenderRoadmap();
  opSave();
  document.getElementById('op-add-form')?.classList.remove('open');
}

export function applyOpPayload(payload) {
  if (payload.state) {
    opState = { ...opState, ...payload.state };
  }
  if (payload.tx) {
    Object.entries(payload.tx).forEach(([k, v]) => {
      const el = document.getElementById('op-' + k);
      if (el) el.value = v;
    });
  }
  if (payload.produto != null) {
    const el = document.getElementById('op-produto');
    if (el) el.value = payload.produto;
  }
  if (payload.stakeholder != null) {
    const el = document.getElementById('op-stakeholder');
    if (el) el.value = payload.stakeholder;
  }
  if (payload.data != null) {
    const el = document.getElementById('op-data');
    if (el) el.value = payload.data;
  }
  opRenderStatus();
  opRenderVisao();
  opRenderSprintHdr();
  opRenderRoadmap();
  opPopulateSelects();
}

export function buildOpPreviewHtml(payload) {
  const esc = (s) => escapeHtml(s || '');
  const statusRows = OP_SK.map((k, i) => {
    const dot = RAG_OPTIONS[payload.state?.[k] ?? 0]?.[2] || 'rag-watch';
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span class="status-lbl">${OP_SL[i]}</span>
      <span class="rag-dot ${dot}"></span>
    </div>`;
  }).join('');

  const field = (label, key) => {
    const v = payload.tx?.[key] || '';
    return v
      ? `<div style="margin-bottom:12px;"><div style="font-size:10px;color:rgba(226,232,240,.45);text-transform:uppercase;margin-bottom:4px;">${label}</div><div style="white-space:pre-wrap;font-size:11px;">${esc(v)}</div></div>`
      : '';
  };

  const items = (payload.state?.items || [])
    .map((it) => `<li style="margin-bottom:4px;">${esc(it.n)} ${it.done ? '✓' : ''}</li>`)
    .join('');

  return `<div class="card" style="font-size:13px;">
    <div style="padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:16px;">
      <strong style="font-size:16px;">${esc(payload.produto)}</strong>
      ${payload.stakeholder ? `<span style="color:rgba(226,232,240,.45);"> · ${esc(payload.stakeholder)}</span>` : ''}
      <span style="float:right;color:rgba(226,232,240,.45);font-size:11px;">${esc(payload.data)}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${field('Entregas', 'entregas')}
      ${field('Resumo Executivo', 'resumo')}
    </div>
    <div style="margin-top:12px;">${field('Equipe', 'equipe')}${field('Indicadores', 'indicadores')}</div>
    <div style="margin-top:12px;"><strong>Status</strong>${statusRows}</div>
    ${items ? `<div style="margin-top:12px;"><strong>Roadmap</strong><ul>${items}</ul></div>` : ''}
  </div>`;
}

export function buildOpMeta() {
  return {
    title: document.getElementById('op-produto')?.value || 'One Pager',
    period: document.getElementById('op-data')?.value || new Date().toLocaleDateString('pt-BR'),
  };
}

export function initOp() {
  opLoad();
  opRenderStatus();
  opRenderVisao();
  opRenderSprintHdr();
  opRenderRoadmap();
  opPopulateSelects();

  const curSprint = document.getElementById('op-cur-sprint');
  if (curSprint) {
    curSprint.addEventListener('change', function () {
      opState.curSprint = +this.value;
      opRenderRoadmap();
      opSave();
    });
  }

  document.addEventListener('input', (e) => {
    if (
      e.target.tagName === 'TEXTAREA' ||
      (e.target.tagName === 'INPUT' && e.target.type === 'text' && e.target.id?.startsWith('op-'))
    ) {
      opSave();
    }
  });
}
