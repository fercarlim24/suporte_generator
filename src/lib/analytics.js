import { getState, hrefFor, periodChoices, setState } from './app-state.js';
import { refreshNavBadges } from './home.js';
import { getPulse } from './pulse.js';
import { reportMonthLabel } from './report-period.js';
import { goTo, hasCloudHost, renderSync } from './shell.js';

const TABS = [
  ['pulse', 'Pulse'],
  ['suporte', 'Suporte'],
  ['uso', 'Uso (GA)'],
  ['esforco', 'Esforço'],
  ['contas', 'Contas'],
  ['qualitativo', 'Qualitativo'],
];

let sprintFilter = '';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function monthTitle(key) {
  const label = reportMonthLabel(key) || key;
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : key;
}

function monthShort(key) {
  const [y, m] = String(key).split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function minutesAgo(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return Number.isFinite(mins) ? Math.max(0, mins) : null;
}

function freshnessText(item, period) {
  if (item.source === 'Suporte' && !item.ok) return `sem CSV de ${monthTitle(period)}`;
  if (item.source === 'GA' && !item.ok) return 'não conectado';
  if (item.source === 'Metabase' && !item.ok) return 'não configurado';
  if ((item.source === 'GA' || item.source === 'Metabase') && item.ok) {
    const mins = minutesAgo(item.asOf);
    return mins == null ? 'sync' : `há ${mins} min`;
  }
  if (!item.ok) return 'sem lançamento';
  return formatWhen(item.asOf) || 'salvo';
}

function seg(name, options, selected, onChange) {
  const wrap = el('div', 'seg');
  wrap.setAttribute('role', 'radiogroup');
  options.forEach(([value, label]) => {
    const option = el('label', 'seg-opt');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = value === selected;
    input.addEventListener('change', () => {
      if (input.checked) onChange(value);
    });
    option.append(input, document.createTextNode(label));
    wrap.append(option);
  });
  return wrap;
}

function showValue(kpi) {
  if (!kpi || kpi.value == null || kpi.missing) return '—';
  return String(kpi.value);
}

function kpiCard(key, kpi) {
  const card = el('article', 'card');
  const label = el('div', 'kpi-label');
  const names = {
    mau: 'MAU',
    tickets: 'Tickets',
    bugs: 'Bugs',
    ticketsPerMau: 'Tickets / 1k MAU',
    devHours: 'Horas dev',
    tenants: 'Tenants ativos',
    rag: 'Risco RAG médio',
  };
  label.append(document.createTextNode(names[key] || key));
  if (key === 'mau') {
    const tip = el('button', 'info-tip');
    tip.type = 'button';
    tip.setAttribute('aria-describedby', 'tip-mau');
    tip.append(el('i', 'ph ph-info'));
    const tooltip = el(
      'span',
      'tooltip',
      'Monthly Active Users — usuários únicos que usaram o produto ao menos uma vez no mês. Fonte: Google Analytics.',
    );
    tooltip.id = 'tip-mau';
    tooltip.setAttribute('role', 'tooltip');
    tip.append(tooltip);
    label.append(tip);
  }
  card.append(label);
  card.append(el('div', kpi?.value == null || kpi?.missing ? 'kpi-value missing' : 'kpi-value', showValue(kpi)));
  card.append(el('div', 'kpi-sub', kpi?.sub || ''));
  card.append(el('div', 'kpi-source', kpi?.source || ''));
  return card;
}

function pushRoute() {
  const href = hrefFor(getState());
  if (location.hash !== href) location.hash = href.slice(1);
  else renderPulse();
}

function renderPulsePanel(pulse, product) {
  const panel = el('div');
  const kpis = el('div', 'pulse-kpis');
  ['mau', 'tickets', 'bugs', 'ticketsPerMau', 'devHours', 'tenants', 'rag'].forEach((key) => {
    kpis.append(kpiCard(key, pulse.kpis[key]));
  });
  panel.append(kpis);

  if (!pulse.freshness.find((item) => item.source === 'GA')?.ok) {
    const banner = el('div', 'banner');
    banner.append(el('p', '', 'Conecte o Google Analytics para ver MAU, uso por feature e tickets por MAU'));
    const button = el('button', 'btn btn-secondary', 'Ver uso');
    button.type = 'button';
    button.addEventListener('click', () => {
      setState({ pulseTab: 'uso' });
      pushRoute();
    });
    banner.append(button);
    panel.append(banner);
  }

  const charts = el('div', 'chart-grid');
  charts.append(mauChart(pulse), effortChart(pulse, product));
  panel.append(charts);

  if (pulse.insights.length) {
    const grid = el('div', 'insight-grid');
    pulse.insights.forEach((insight) => grid.append(insightCard(insight)));
    panel.append(grid);
  }
  return panel;
}

function mauChart(pulse) {
  const card = el('article', 'card');
  card.append(el('h4', '', 'Tickets por 1k MAU'));
  const points = pulse.trend.filter((row) => row.ticketsPerMau != null);
  if (!points.length) {
    card.append(el('p', 'sub', 'Conecte o Google Analytics para ver tickets por MAU.'));
    return card;
  }
  const max = Math.max(...points.map((row) => row.ticketsPerMau), 1);
  const chart = el('div', 'bar-chart');
  pulse.trend.forEach((row) => {
    const col = el('div', 'bar-col');
    col.append(el('div', 'bar-val', row.ticketsPerMau == null ? '—' : String(row.ticketsPerMau)));
    const bar = el('div', row.current ? 'bar current' : 'bar');
    const height = row.ticketsPerMau == null ? 2 : Math.max(4, Math.round((row.ticketsPerMau / max) * 120));
    bar.style.height = `${height}px`;
    col.append(bar, el('div', 'bar-label', monthShort(row.period)));
    chart.append(col);
  });
  card.append(chart);
  return card;
}

function effortChart(pulse, product) {
  const card = el('article', 'card');
  card.append(el('h4', '', 'Onde o time gastou tempo'));
  const rows = pulse.effort
    .map((row) => ({ ...row, minutes: product === 'FORE' ? row.fore : row.os2 }))
    .filter((row) => row.minutes > 0);
  if (!rows.length) {
    card.append(el('p', 'sub', 'Sem horas neste período. O lançamento continua na tela Horas.'));
    return card;
  }
  const max = Math.max(...rows.map((row) => row.minutes), 1);
  const list = el('div', 'h-bars');
  rows
    .sort((a, b) => b.minutes - a.minutes)
    .forEach((row) => {
      const line = el('div', 'h-bar-row');
      const label = row.category === 'BUG' ? 'Bugfix' : row.category;
      line.append(el('span', '', label));
      const track = el('div', 'h-bar-track');
      const fill = el('div', row.category === 'BUG' ? 'h-bar-fill accent' : 'h-bar-fill');
      fill.style.width = `${Math.round((row.minutes / max) * 100)}%`;
      track.append(fill);
      const hours = Math.round((row.minutes / 60) * 10) / 10;
      line.append(track, el('span', '', `${hours}h`));
      list.append(line);
    });
  card.append(list);
  return card;
}

function insightCard(insight) {
  const card = el('article', 'card');
  card.append(el('div', 'insight-kicker', insight.kicker));
  card.append(el('div', 'insight-metric', insight.metric));
  card.append(el('p', 'insight-context', insight.context));
  const button = el('button', 'btn btn-ghost', insight.cta);
  button.type = 'button';
  button.addEventListener('click', () => {
    if (insight.switchProduct) {
      setState({ product: insight.switchProduct, screen: 'pulse', pulseTab: 'pulse' });
      pushRoute();
      return;
    }
    setState({ pulseTab: insight.tab || 'pulse' });
    pushRoute();
  });
  card.append(button);
  return card;
}

function suportePanel(pulse) {
  if (pulse.kpis.tickets.missing === 'csv') {
    const box = el('div', 'card');
    box.append(el('h4', '', 'Sem CSV neste mês'));
    box.append(el('p', 'sub', 'O Pulse continua com as outras fontes. O upload do Drag continua manual.'));
    const button = el('button', 'btn btn-primary', 'Enviar CSV');
    button.type = 'button';
    button.addEventListener('click', () => goTo('suporte'));
    box.append(button);
    return box;
  }
  const wrap = el('div');
  wrap.append(el('p', 'sub', `${pulse.kpis.tickets.value} tickets · ${pulse.kpis.tickets.sub}`));
  return wrap;
}

function usoPanel(pulse) {
  if (!pulse.freshness.find((item) => item.source === 'GA')?.ok) {
    const banner = el('div', 'banner');
    banner.append(el('p', '', 'Conecte o Google Analytics para ver MAU, uso por feature e tickets por MAU'));
    return banner;
  }
  if (!pulse.features.length) {
    return el('p', 'sub', 'GA conectado, sem uso por feature neste recorte.');
  }
  return featureTable(pulse.features);
}

function featureTable(features) {
  const table = el('table', 'table');
  const head = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Feature', 'Eventos', 'Δ uso', 'Tickets', ''].forEach((label) => hr.append(el('th', '', label)));
  head.append(hr);
  const body = document.createElement('tbody');
  features.forEach((feature) => {
    const tr = document.createElement('tr');
    [feature.feature_key, String(feature.events), feature.deltaUsage == null ? '—' : String(feature.deltaUsage), String(feature.tickets)].forEach(
      (text) => tr.append(el('td', '', text)),
    );
    const tag = document.createElement('td');
    if (feature.pain) tag.append(el('span', 'tag tag-accent', 'Dor × uso'));
    tr.append(tag);
    body.append(tr);
  });
  table.append(head, body);
  return table;
}

function esforcoPanel(pulse) {
  if (!pulse.effort.length) return el('p', 'sub', 'Sem horas neste período.');
  const table = el('table', 'table');
  const head = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Categoria', 'OS2', 'FORE'].forEach((label) => hr.append(el('th', '', label)));
  head.append(hr);
  const body = document.createElement('tbody');
  pulse.effort.forEach((row) => {
    const tr = document.createElement('tr');
    tr.append(el('td', '', row.category === 'BUG' ? 'Bugfix' : row.category));
    tr.append(el('td', '', String(Math.round((row.os2 / 60) * 10) / 10)));
    tr.append(el('td', '', String(Math.round((row.fore / 60) * 10) / 10)));
    body.append(tr);
  });
  table.append(head, body);
  return table;
}

function contasPanel(pulse) {
  if (!pulse.freshness.find((item) => item.source === 'Metabase')?.ok) {
    return el('p', 'sub', 'Metabase não configurado.');
  }
  if (!pulse.tenants.length) return el('p', 'sub', 'Metabase conectado, sem contas neste recorte.');
  const table = el('table', 'table');
  const head = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Tenant', 'Δ uso', 'Δ tickets', 'RAG', ''].forEach((label) => hr.append(el('th', '', label)));
  head.append(hr);
  const body = document.createElement('tbody');
  pulse.tenants.forEach((tenant) => {
    const tr = document.createElement('tr');
    [tenant.tenant, tenant.deltaUsage == null ? '—' : String(tenant.deltaUsage), tenant.deltaTickets == null ? '—' : String(tenant.deltaTickets), tenant.rag || '—'].forEach(
      (text) => tr.append(el('td', '', text)),
    );
    const tag = document.createElement('td');
    tag.append(el('span', tenant.risk ? 'tag tag-accent' : 'tag tag-neutral', tenant.risk ? 'Em risco' : 'Estável'));
    tr.append(tag);
    body.append(tr);
  });
  table.append(head, body);
  return table;
}

function qualitativoPanel(pulse) {
  if (!pulse.rag.length && !pulse.risks.length) return el('p', 'sub', 'Nenhum one pager neste período.');
  const wrap = el('div', 'chart-grid');
  const rag = el('article', 'card');
  rag.append(el('h4', '', 'RAG por frente'));
  pulse.rag.forEach((row) => {
    const line = el('p', 'sub');
    line.textContent = `${row.front}: ${row.label}`;
    rag.append(line);
  });
  const risks = el('article', 'card');
  risks.append(el('h4', '', 'Riscos da semana'));
  if (!pulse.risks.length) risks.append(el('p', 'sub', 'Nenhum risco descrito.'));
  pulse.risks.forEach((risk) => {
    const line = el('p', '');
    line.textContent = `${risk.level}: ${risk.text}`;
    risks.append(line);
  });
  wrap.append(rag, risks);
  return wrap;
}

function panelFor(tab, pulse, product) {
  if (tab === 'suporte') return suportePanel(pulse);
  if (tab === 'uso') return usoPanel(pulse);
  if (tab === 'esforco') return esforcoPanel(pulse);
  if (tab === 'contas') return contasPanel(pulse);
  if (tab === 'qualitativo') return qualitativoPanel(pulse);
  return renderPulsePanel(pulse, product);
}

export function renderPulse() {
  const root = document.getElementById('pulse-root');
  if (!root) return;
  const state = getState();
  const product = state.product || 'OS2';
  const period = state.period;
  const pulse = getPulse({ product, period });
  root.replaceChildren();

  const head = el('header', 'page-head');
  head.append(el('div', 'kicker', `Product Pulse · ${product}`));
  const row = el('div', 'head-row');
  row.append(el('h2', '', `Como está o ${product} em ${monthTitle(period)}?`));
  const filters = el('div', 'filters');
  filters.append(seg('pulse-period', periodChoices(period).map((key) => [key, monthShort(key)]), period, (value) => {
    setState({ period: value });
    refreshNavBadges();
    renderPulse();
  }));
  filters.append(seg('pulse-product', [['OS2', 'OS2'], ['FORE', 'FORE']], product, (value) => {
    setState({ product: value, screen: 'pulse' });
    pushRoute();
  }));
  const sprint = el('select', 'input');
  sprint.setAttribute('aria-label', 'Sprint');
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Sprint';
  sprint.append(empty);
  sprint.value = sprintFilter;
  sprint.addEventListener('change', () => {
    sprintFilter = sprint.value;
    renderPulse();
  });
  filters.append(sprint);
  row.append(filters);
  head.append(row);
  root.append(head);

  if (hasCloudHost() === false) {
    root.append(el('p', 'pulse-note', 'Sem nuvem: o Pulse mostra só o que está neste navegador. GA e Metabase ficam vazios.'));
  }

  const fresh = el('div', 'fresh-row');
  pulse.freshness.forEach((item) => {
    const badge = el('span', item.ok ? 'fresh-badge' : 'fresh-badge missing');
    const dot = el('span', 'dot', '● ');
    badge.append(dot, document.createTextNode(`${item.source} · ${item.mode} · ${freshnessText(item, period)}`));
    fresh.append(badge);
  });
  root.append(fresh);

  const tabs = el('div', 'tabs');
  TABS.forEach(([id, label]) => {
    const button = el('button', state.pulseTab === id ? 'tab active' : 'tab', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      setState({ pulseTab: id });
      pushRoute();
    });
    tabs.append(button);
  });
  root.append(tabs);
  root.append(panelFor(state.pulseTab || 'pulse', pulse, product));
}

export async function openAnalyticsScreen() {
  await renderSync();
  renderPulse();
}

export function initAnalytics() {
  document.getElementById('btn-analytics-refresh')?.addEventListener('click', () => renderPulse());
}
