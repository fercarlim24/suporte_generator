const STORAGE_KEY = 'ls2-shell-v1';
const SCREENS = new Set(['inicio', 'pulse', 'suporte', 'horas', 'op', 'hist', 'select']);
const TABS = new Set(['pulse', 'suporte', 'uso', 'esforco', 'contas', 'qualitativo']);

const SLUG = {
  inicio: 'inicio',
  pulse: 'pulse',
  suporte: 'suporte',
  horas: 'horas',
  op: 'onepager',
  hist: 'historico',
};

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key, delta) {
  const [y, m] = String(key || currentMonthKey()).split('-').map(Number);
  const d = new Date(y, (m || 1) - 1 + delta, 1);
  return currentMonthKey(d);
}

/** Três meses: janela corrente, ou centrada no período salvo. */
export function periodChoices(selected, now = new Date()) {
  const end = currentMonthKey(now);
  const windowKeys = [shiftMonth(end, -2), shiftMonth(end, -1), end];
  if (selected && /^\d{4}-\d{2}$/.test(selected) && !windowKeys.includes(selected)) {
    return [shiftMonth(selected, -1), selected, shiftMonth(selected, 1)];
  }
  return windowKeys;
}

function fresh() {
  return { product: null, period: currentMonthKey(), screen: 'inicio', pulseTab: 'pulse' };
}

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return fresh();
    return {
      product: raw.product === 'OS2' || raw.product === 'FORE' ? raw.product : null,
      period: /^\d{4}-\d{2}$/.test(raw.period) ? raw.period : currentMonthKey(),
      screen: SCREENS.has(raw.screen) ? raw.screen : 'inicio',
      pulseTab: TABS.has(raw.pulseTab) ? raw.pulseTab : 'pulse',
    };
  } catch {
    return fresh();
  }
}

let state = typeof localStorage === 'undefined' ? fresh() : read();

export function getState() {
  return { ...state };
}

export function setState(partial) {
  state = { ...state, ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
  return getState();
}

export function hrefFor(next = state) {
  if (!next.product) return '#/select';
  if (next.screen === 'pulse') return `#/${next.product}/pulse/${next.pulseTab || 'pulse'}`;
  return `#/${next.product}/${SLUG[next.screen] || 'inicio'}`;
}

export function parseHash(hash) {
  const parts = String(hash || '')
    .replace(/^#/, '')
    .split('/')
    .filter(Boolean);
  if (!parts.length || parts[0] === 'select') return { product: null, screen: 'select' };
  const product = parts[0] === 'OS2' || parts[0] === 'FORE' ? parts[0] : null;
  if (!product) return { product: null, screen: 'select' };
  const section = parts[1] || 'inicio';
  if (section === 'pulse') {
    return {
      product,
      screen: 'pulse',
      pulseTab: TABS.has(parts[2]) ? parts[2] : 'pulse',
    };
  }
  const screen = Object.entries(SLUG).find(([, slug]) => slug === section)?.[0] || 'inicio';
  return { product, screen };
}

export function legacyScreen(id) {
  const map = {
    hub: 'inicio',
    analytics: 'pulse',
    hist: 'hist',
    historico: 'hist',
    op: 'op',
    onepager: 'op',
    suporte: 'suporte',
    horas: 'horas',
    inicio: 'inicio',
    pulse: 'pulse',
    select: 'select',
  };
  return map[id] || 'inicio';
}
