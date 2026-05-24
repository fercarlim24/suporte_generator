import {
  OP_FIELDS,
  OP_SC,
  OP_SK,
  OP_SL,
  OP_SP,
  OP_STORAGE_KEY,
} from './config.js';
import { escapeHtml } from './utils.js';

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
  c.innerHTML = '';
  OP_SK.forEach((k, i) => {
    const row = document.createElement('div');
    row.className = 'status-row-op';
    row.innerHTML = `<span class="status-lbl">${OP_SL[i]}</span>`;
    const dot = document.createElement('div');
    dot.className = 'sdot';
    dot.style.cssText = `width:12px;height:12px;background:${OP_SC[opState[k]]};`;
    dot.title = ['Verde', 'Amarelo', 'Vermelho', 'N/A'][opState[k]];
    dot.onclick = () => {
      opState[k] = (opState[k] + 1) % 4;
      opRenderStatus();
      opRenderVisao();
      opSave();
    };
    row.appendChild(dot);
    c.appendChild(row);
  });
}

export function opRenderVisao() {
  const ns = OP_SK.map((k) => opState[k]).filter((v) => v < 3);
  const worst = ns.length ? Math.max(...ns) : 3;
  const el = document.getElementById('op-visao');
  if (el) el.style.background = OP_SC[worst];
}

export function opRenderSprintHdr() {
  const hdr = document.getElementById('op-sprint-hdr');
  if (!hdr) return;
  hdr.innerHTML = '';
  OP_SP.forEach(([n, d]) => {
    const c = document.createElement('div');
    c.className = 'sprint-hdr-cell';
    c.innerHTML = `<div class="sprint-name">${escapeHtml(n)}</div><div class="sprint-date">${escapeHtml(d)}</div>`;
    hdr.appendChild(c);
  });
}

export function opRenderRoadmap() {
  const wrap = document.getElementById('op-roadmap-rows');
  if (!wrap) return;
  wrap.innerHTML = '';
  const rows = [...opState.items, ...Array(Math.max(0, 4 - opState.items.length)).fill(null)];
  rows.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    OP_SP.forEach((_, ci) => {
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
      const bar = document.createElement('div');
      bar.className = 'rbar ' + (item.done ? 'done' : 'active');
      bar.style.left = `calc(${item.s / 7 * 100}% + 2px)`;
      bar.style.width = `calc(${(item.e - item.s + 1) / 7 * 100}% - 4px)`;
      bar.onclick = () => {
        item.done = !item.done;
        opRenderRoadmap();
        opSave();
      };
      bar.innerHTML = `<span class="rbar-text">${escapeHtml(item.n)}</span>`;
      if (item.done) {
        bar.innerHTML += `<span style="color:rgba(255,255,255,.8);font-size:11px;margin-left:4px;">✓</span>`;
      }
      const del = document.createElement('button');
      del.textContent = '✕';
      del.className = 'np';
      del.style.cssText =
        'background:rgba(0,0,0,.3);border:none;border-radius:50%;width:14px;height:14px;color:rgba(255,255,255,.7);cursor:pointer;display:flex;align-items:center;justify-content:center;margin-left:4px;flex-shrink:0;padding:0;font-family:inherit;font-size:9px;line-height:1;';
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
    sel.innerHTML = '';
    OP_SP.forEach(([n], i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = n;
      sel.appendChild(o);
    });
    if (id === 'op-cur-sprint') sel.value = opState.curSprint;
  });
}

export function opToggleAdd() {
  document.getElementById('op-add-form')?.classList.toggle('open');
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
    const bg = OP_SC[payload.state?.[k] ?? 0];
    return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:10px;color:rgba(226,232,240,.6);">${OP_SL[i]}</span>
      <span style="width:12px;height:12px;border-radius:50%;background:${bg};display:inline-block;"></span>
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

  return `<div style="font-family:Inter,system-ui,sans-serif;font-size:12px;background:#0c0f1a;color:#e2e8f0;padding:16px;border-radius:8px;">
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
