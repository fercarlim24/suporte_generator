import { periodChoices, getState, setState } from './app-state.js';
import { mapHorasEffort } from './bi/facts.js';
import { REPORT_LABELS } from './config.js';
import { histGetAll } from './history.js';
import { getEntryReportMonth, reportMonthLabel } from './report-period.js';
import { entryInScope } from './report-scope.js';
import { goTo, setNavBadges } from './shell.js';

function monthTitle(key) {
  const label = reportMonthLabel(key) || key;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthShort(key) {
  const [y, m] = String(key).split('-').map(Number);
  if (!y || !m) return key;
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
  return `${name.replace('.', '')} ${y}`;
}

function entries() {
  return histGetAll().filter((entry) => entry && !entry.legacy && entry.version === 2);
}

function forPeriod(product, period) {
  return entries()
    .filter((entry) => entryInScope(entry, product, period))
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

function latest(list, type) {
  return list.find((entry) => entry.type === type) || null;
}

function supportSlice(entry, product) {
  const data = entry?.payload?.data;
  if (!data) return null;
  if (product === 'FORE') {
    const tickets = Number(data.foreTickets || 0);
    const bugs = (data.bugs || []).filter((bug) => /fore/i.test(bug.name || '')).length;
    if (!tickets && !bugs) return null;
    return { tickets, closedRate: null, bugs };
  }
  const tickets = Number(data.realTickets || 0);
  const closed = Number(data.closed || 0);
  return {
    tickets,
    closedRate: tickets ? Math.round((100 * closed) / tickets) : null,
    bugs: Array.isArray(data.bugs) ? data.bugs.length : 0,
  };
}

function hoursOf(entry, product) {
  if (!entry) return null;
  const minutes = mapHorasEffort(entry)
    .filter((row) => row.product_code === product)
    .reduce((sum, row) => sum + row.minutes, 0);
  if (!minutes) return null;
  return Math.round((minutes / 60) * 10) / 10;
}

function launchedWeeks(entry, product) {
  const weeks = new Set();
  mapHorasEffort(entry || { payload: { rows: [] } })
    .filter((row) => row.product_code === product && row.week_of_month >= 1 && row.week_of_month <= 4)
    .forEach((row) => weeks.add(row.week_of_month));
  return weeks.size;
}

function snapshot(product, period) {
  const list = forPeriod(product, period);
  const suporte = latest(list, 'suporte');
  const horas = latest(list, 'horas');
  const op = latest(list, 'op');
  const support = supportSlice(suporte, product);
  return {
    list,
    suporte,
    horas,
    op,
    tickets: support ? support.tickets : null,
    closedRate: support ? support.closedRate : null,
    bugs: support ? support.bugs : null,
    hours: hoursOf(horas, product),
    weeks: horas ? launchedWeeks(horas, product) : 0,
  };
}

function deltaText(current, previous, suffix) {
  if (current == null || previous == null) return 'sem mês anterior';
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return 'igual ao mês anterior';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff}${suffix} vs mês anterior`;
}

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function kpiCard(label, value, sub) {
  const card = node('article', 'card');
  card.append(node('div', 'kpi-label', label));
  const missing = value == null;
  card.append(node('div', missing ? 'kpi-value missing' : 'kpi-value', missing ? '—' : String(value)));
  card.append(node('div', 'kpi-sub', sub));
  return card;
}

function statusCard({ title, done, detail, cta, screen }) {
  const card = node('article', 'card status-card');
  card.append(node('span', done ? 'tag tag-accent' : 'tag tag-neutral', done ? 'Gerado' : 'Pendente'));
  card.append(node('h4', '', title));
  card.append(node('p', 'status-detail', detail));
  const button = node('button', done ? 'btn btn-secondary' : 'btn btn-primary', cta);
  button.type = 'button';
  button.addEventListener('click', () => goTo(screen));
  card.append(button);
  return card;
}

export function refreshNavBadges() {
  const { product, period } = getState();
  if (!product) {
    setNavBadges({ horas: 0, op: 0 });
    return;
  }
  const now = snapshot(product, period);
  setNavBadges({
    horas: Math.max(0, 4 - now.weeks),
    op: now.op ? 0 : 1,
  });
}

export function renderHome() {
  const root = document.getElementById('view-inicio');
  if (!root) return;
  const { product, period } = getState();
  if (!product) return;
  const current = snapshot(product, period);
  const previous = snapshot(product, shiftSafe(period));

  root.replaceChildren();
  const head = node('header', 'page-head');
  const row = node('div', 'head-row');
  const titles = node('div');
  titles.append(node('div', 'kicker', `Início · ${product}`));
  titles.append(node('h2', '', monthTitle(period)));
  row.append(titles, periodControl(period));
  head.append(row);
  root.append(head);

  const summaryHead = node('div', 'head-row');
  summaryHead.append(node('h4', '', 'Resumo parcial'));
  const pulseLink = node('button', 'section-link', 'Abrir Product Pulse →');
  pulseLink.type = 'button';
  pulseLink.addEventListener('click', () => goTo('pulse'));
  summaryHead.append(pulseLink);
  root.append(summaryHead);

  const kpis = node('div', 'kpi-grid');
  kpis.append(
    kpiCard('Tickets', current.tickets, deltaText(current.tickets, previous.tickets, '')),
    kpiCard(
      'Resolução',
      current.closedRate == null ? null : `${current.closedRate}%`,
      deltaText(current.closedRate, previous.closedRate, ' p.p.'),
    ),
    kpiCard('Bugs', current.bugs, deltaText(current.bugs, previous.bugs, '')),
    kpiCard('Horas de dev', current.hours, deltaText(current.hours, previous.hours, ' h')),
  );
  root.append(kpis);

  root.append(node('h4', '', 'Status por gerador'));
  const status = node('div', 'status-grid');
  status.append(
    statusCard({
      title: 'Suporte',
      done: Boolean(current.suporte),
      detail: current.suporte ? `${current.tickets ?? 0} tickets no período` : `sem CSV de ${monthTitle(period)}`,
      cta: current.suporte ? 'Abrir relatório' : 'Enviar CSV',
      screen: 'suporte',
    }),
    statusCard({
      title: 'Horas',
      done: current.weeks >= 4,
      detail: `${current.weeks} de 4 semanas lançadas`,
      cta: current.weeks >= 4 ? 'Abrir horas' : 'Lançar horas',
      screen: 'horas',
    }),
    statusCard({
      title: 'One Pager',
      done: Boolean(current.op),
      detail: current.op ? 'Resumo da semana salvo' : 'One pager ainda não lançado',
      cta: current.op ? 'Abrir one pager' : 'Preencher',
      screen: 'op',
    }),
  );
  root.append(status);

  const tableHead = node('div', 'head-row');
  tableHead.append(node('h4', '', 'Últimos relatórios'));
  const histLink = node('button', 'section-link', 'Ver histórico');
  histLink.type = 'button';
  histLink.addEventListener('click', () => goTo('hist'));
  tableHead.append(histLink);
  root.append(tableHead);
  root.append(reportsTable(current.list));
  refreshNavBadges();
}

function shiftSafe(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodControl(selected) {
  const seg = node('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Período');
  periodChoices(selected).forEach((key) => {
    const label = node('label', 'seg-opt');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'home-period';
    input.value = key;
    input.checked = key === selected;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      setState({ period: key });
      renderHome();
    });
    label.append(input, document.createTextNode(monthShort(key)));
    seg.append(label);
  });
  return seg;
}

function reportsTable(list) {
  const wrap = node('div', 'card');
  if (!list.length) {
    wrap.append(node('p', 'sub', 'Nenhum relatório neste período.'));
    return wrap;
  }
  const table = node('table', 'table');
  const head = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Relatório', 'Período', 'Gerado em', 'Onde está salvo'].forEach((label) => {
    hr.append(node('th', '', label));
  });
  head.append(hr);
  const body = document.createElement('tbody');
  list.slice(0, 8).forEach((entry) => {
    const tr = document.createElement('tr');
    const saved = entry.savedAt ? new Date(entry.savedAt) : null;
    const when = saved && !Number.isNaN(saved.getTime())
      ? saved.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';
    [
      entry.title || REPORT_LABELS[entry.type] || entry.type,
      monthTitle(getEntryReportMonth(entry) || ''),
      when,
      entry.cloud ? 'Local + nuvem' : 'Neste navegador',
    ].forEach((text) => tr.append(node('td', '', text)));
    body.append(tr);
  });
  table.append(head, body);
  wrap.append(table);
  return wrap;
}
