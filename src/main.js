import {
  initHistory,
  openHistoryScreen,
  histRenderList,
  histSave,
  histBackToList,
  histPrintCurrent,
  exportReportJson,
  histRefreshFromCloud,
  histMigrateLocalToCloud,
  getHistListFilter,
} from './lib/history.js';
import { initAnalytics, openAnalyticsScreen } from './lib/analytics.js';
import { initSuporte, resetSuporteView } from './lib/suporte.js';
import { initHoras, showHorasEditor } from './lib/horas.js';
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
  analytics: 'screen-analytics',
};

export function goTo(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(SCREEN_MAP[id] || 'screen-hub');
  if (el) {
    el.classList.add('active');
    window.scrollTo(0, 0);
  }
  if (id === 'hist') openHistoryScreen();
  if (id === 'analytics') openAnalyticsScreen();
}

function bindHub() {
  document.querySelectorAll('[data-go]').forEach((el) => {
    el.addEventListener('click', () => goTo(el.dataset.go));
  });
}

function bindSuporteActions() {
  document.getElementById('btn-suporte-reset')?.addEventListener('click', resetSuporteView);
  document.getElementById('btn-suporte-save')?.addEventListener('click', () => histSave('suporte'));
  document.getElementById('btn-suporte-json')?.addEventListener('click', () => exportReportJson('suporte'));
  document.getElementById('btn-suporte-pdf')?.addEventListener('click', () => window.print());
}

function bindHorasActions() {
  document.getElementById('btn-horas-edit')?.addEventListener('click', showHorasEditor);
  document.getElementById('btn-horas-save')?.addEventListener('click', () => histSave('horas'));
  document.getElementById('btn-horas-json')?.addEventListener('click', () => exportReportJson('horas'));
  document.getElementById('btn-horas-pdf')?.addEventListener('click', () => window.print());
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
  document.getElementById('btn-hist-refresh')?.addEventListener('click', async () => {
    await histRefreshFromCloud();
    histRenderList(getHistListFilter());
  });
  document.getElementById('btn-hist-migrate')?.addEventListener('click', histMigrateLocalToCloud);
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
  initAnalytics();

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

window.goTo = goTo;
window.histSave = histSave;
