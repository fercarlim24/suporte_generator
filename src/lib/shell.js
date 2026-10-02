import { checkCloudAvailable } from './api.js';
import { getState, hrefFor, legacyScreen, parseHash, setState } from './app-state.js';
import { histGetAll } from './history.js';

const VIEW = {
  inicio: 'view-inicio',
  pulse: 'screen-analytics',
  suporte: 'screen-suporte',
  horas: 'screen-horas',
  op: 'screen-op',
  hist: 'screen-hist',
};

let onScreen = () => {};
let cloudHost = null;

export function hasCloudHost() {
  return cloudHost;
}

export function goTo(id) {
  const screen = legacyScreen(id);
  const current = getState();
  if (screen === 'select' || !current.product) {
    setState({ product: null, screen: 'select' });
  } else {
    setState({ screen });
  }
  const href = hrefFor(getState());
  if (location.hash !== href) location.hash = href.slice(1);
  else renderShell();
}

export function chooseProduct(product) {
  setState({ product, screen: 'inicio' });
  const href = hrefFor(getState());
  if (location.hash !== href) location.hash = href.slice(1);
  else renderShell();
}

function applyHash() {
  const parsed = parseHash(location.hash);
  if (!parsed.product) setState({ product: null, screen: 'select' });
  else {
    setState({
      product: parsed.product,
      screen: parsed.screen,
      ...(parsed.pulseTab ? { pulseTab: parsed.pulseTab } : {}),
    });
  }
}

export function renderShell() {
  const state = getState();
  const select = document.getElementById('screen-select');
  const shell = document.getElementById('app-shell');
  const inWorkspace = Boolean(state.product) && state.screen !== 'select';
  select?.classList.toggle('active', !inWorkspace);
  shell?.classList.toggle('active', inWorkspace);
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  if (!inWorkspace) return;

  const productEl = document.getElementById('sidebar-product');
  if (productEl) productEl.textContent = state.product;
  document.getElementById(VIEW[state.screen] || VIEW.inicio)?.classList.add('active');
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === state.screen);
  });
  onScreen(state);
}

export function setNavBadges({ horas = 0, op = 0 } = {}) {
  const horasEl = document.getElementById('nav-badge-horas');
  const opEl = document.getElementById('nav-badge-op');
  if (horasEl) {
    horasEl.hidden = !(horas > 0);
    horasEl.textContent = String(horas);
  }
  if (opEl) {
    opEl.hidden = !(op > 0);
    opEl.textContent = String(op);
  }
}

function latestSavedAt() {
  return histGetAll()
    .map((entry) => entry.savedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
}

export async function renderSync() {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  let api = false;
  try {
    const res = await fetch('/api/reports');
    const type = res.headers.get('content-type') || '';
    api = type.includes('json') || res.status === 401 || res.status === 403 || res.status === 405;
  } catch {
    api = false;
  }
  cloudHost = api;
  if (!api) {
    el.className = 'sync-indicator local';
    el.textContent = '● Somente local · Esta versão não tem nuvem. Os dados ficam só neste navegador.';
    return;
  }
  await checkCloudAvailable();
  const saved = latestSavedAt();
  const mins = saved ? Math.max(0, Math.round((Date.now() - new Date(saved).getTime()) / 60000)) : 0;
  el.className = 'sync-indicator';
  el.textContent = `● Sincronizado · Local + nuvem · última sync há ${mins} min`;
}

export function startShell(handler) {
  onScreen = handler || (() => {});
  document.getElementById('product-os2')?.addEventListener('click', () => chooseProduct('OS2'));
  document.getElementById('product-fore')?.addEventListener('click', () => chooseProduct('FORE'));
  document.getElementById('btn-switch-product')?.addEventListener('click', () => goTo('select'));
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => goTo(btn.dataset.nav));
  });
  window.addEventListener('hashchange', () => {
    applyHash();
    renderShell();
  });
  if (!location.hash) location.replace(hrefFor(getState()));
  else applyHash();
  renderShell();
  renderSync();
}
