import { initHistory, histRenderList, histSave, histBackToList, histPrintCurrent, exportReportJson } from './lib/history.js';
import { initSuporte, resetSuporteView, loadSuporteDemo } from './lib/suporte.js';
import {
  initHoras,
  resetHorasView,
  loadHorasDemo,
  hSwitchTab,
  hMethodChange,
  hCopyScript,
  hSheetsConnect,
  hSheetsRefresh,
  hSheetsDisconnect,
} from './lib/horas.js';
import {
  initOp,
  opToggleAdd,
  opAddItem,
} from './lib/op.js';

const SCREEN_MAP = {
  hub: 'screen-hub',
  suporte: 'screen-suporte',
  op: 'screen-op',
  horas: 'screen-horas',
  hist: 'screen-hist',
};

export function goTo(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(SCREEN_MAP[id] || 'screen-hub');
  if (el) {
    el.classList.add('active');
    window.scrollTo(0, 0);
  }
  if (id === 'hist') histRenderList('ALL');
}

function bindHub() {
  document.querySelectorAll('[data-go]').forEach((el) => {
    el.addEventListener('click', () => goTo(el.dataset.go));
  });
}

function bindSuporteActions() {
  document.getElementById('btn-suporte-reset')?.addEventListener('click', resetSuporteView);
  document.getElementById('btn-suporte-demo')?.addEventListener('click', loadSuporteDemo);
  document.getElementById('btn-suporte-save')?.addEventListener('click', () => histSave('suporte'));
  document.getElementById('btn-suporte-json')?.addEventListener('click', () => exportReportJson('suporte'));
  document.getElementById('btn-suporte-pdf')?.addEventListener('click', () => window.print());
}

function bindHorasActions() {
  document.getElementById('btn-horas-reset')?.addEventListener('click', resetHorasView);
  document.getElementById('btn-horas-demo')?.addEventListener('click', loadHorasDemo);
  document.getElementById('btn-horas-save')?.addEventListener('click', () => histSave('horas'));
  document.getElementById('btn-horas-json')?.addEventListener('click', () => exportReportJson('horas'));
  document.getElementById('btn-horas-pdf')?.addEventListener('click', () => window.print());
  document.getElementById('h-tab-upload')?.addEventListener('click', () => hSwitchTab('upload'));
  document.getElementById('h-tab-sheets')?.addEventListener('click', () => hSwitchTab('sheets'));
  document.querySelectorAll('input[name="h-method"]').forEach((r) => {
    r.addEventListener('change', () => hMethodChange(r.value));
  });
  document.getElementById('h-sheets-connect-btn')?.addEventListener('click', hSheetsConnect);
  document.getElementById('h-copy-script-btn')?.addEventListener('click', hCopyScript);
  document.getElementById('h-sheets-disconnect-btn')?.addEventListener('click', hSheetsDisconnect);
  document.getElementById('h-refresh-btn')?.addEventListener('click', hSheetsRefresh);
  document.getElementById('h-rpt-refresh-btn')?.addEventListener('click', hSheetsRefresh);
  const urlInput = document.getElementById('h-sheets-url');
  if (urlInput) {
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') hSheetsConnect();
    });
  }
}

function bindOpActions() {
  document.getElementById('btn-op-save')?.addEventListener('click', () => histSave('op'));
  document.getElementById('btn-op-json')?.addEventListener('click', () => exportReportJson('op'));
  document.getElementById('btn-op-pdf')?.addEventListener('click', () => window.print());
  document.getElementById('op-add-btn')?.addEventListener('click', opToggleAdd);
  document.getElementById('btn-op-add-item')?.addEventListener('click', opAddItem);
  document.getElementById('btn-op-add-cancel')?.addEventListener('click', opToggleAdd);
}

function bindHistActions() {
  document.getElementById('btn-hist-back-hub')?.addEventListener('click', () => goTo('hub'));
  document.getElementById('btn-hist-back-list')?.addEventListener('click', histBackToList);
  document.getElementById('btn-hist-print')?.addEventListener('click', histPrintCurrent);
}

function boot() {
  bindHub();
  bindSuporteActions();
  bindHorasActions();
  bindOpActions();
  bindHistActions();
  initSuporte();
  initHoras();
  initOp();
  initHistory();

  const opData = document.getElementById('op-data');
  if (opData && !opData.value) {
    opData.value = new Date().toLocaleDateString('pt-BR');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Legacy global hooks (optional)
window.goTo = goTo;
window.histSave = histSave;
