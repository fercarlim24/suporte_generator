import { histRefreshFromCloud, getSupportReportEntries } from './history.js';
import { getEntryReportMonth, reportMonthLabel } from './report-period.js';
import { escapeHtml } from './utils.js';

function monthLabel(key) {
  return reportMonthLabel(key) || key;
}

function aggregateSupportReports(entries) {
  const map = {};
  entries.forEach((e) => {
    const k = getEntryReportMonth(e);
    if (!k) return;
    const d = e.payload.data || {};
    map[k] = map[k] || {
      month: k,
      reports: 0,
      tickets: 0,
      closed: 0,
      bugs: 0,
      uniqueContacts: 0,
    };
    map[k].reports += 1;
    map[k].tickets += Number(d.realTickets || 0);
    map[k].closed += Number(d.closed || 0);
    map[k].bugs += Number((d.bugs || []).length);
    map[k].uniqueContacts += Number(d.uniqueContacts || 0);
  });

  const months = Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  return months.map((m) => ({
    ...m,
    resolutionPct: m.tickets ? Math.round((m.closed / m.tickets) * 100) : 0,
  }));
}

function renderBars(targetId, rows, field, colorClass = '') {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="analytics-empty">Sem dados suficientes para gerar gráfico.</div>';
    return;
  }
  const max = Math.max(...rows.map((r) => Number(r[field] || 0)), 1);
  el.innerHTML = `<div class="bar-chart">${rows
    .map((r) => {
      const val = Number(r[field] || 0);
      const h = Math.max(2, Math.round((val / max) * 150));
      return `
        <div class="bar-col">
          <div class="bar-val">${val}${field === 'resolutionPct' ? '%' : ''}</div>
          <div class="bar ${colorClass}" style="height:${h}px"></div>
          <div class="bar-label">${monthLabel(r.month)}</div>
        </div>`;
    })
    .join('')}</div>`;
}

function renderTable(rows) {
  const wrap = document.getElementById('analytics-table-wrap');
  if (!wrap) return;
  if (!rows.length) {
    wrap.innerHTML = '<div class="analytics-empty">Ainda não existem relatórios de suporte salvos.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="analytics-table">
      <thead>
        <tr>
          <th>Mês</th>
          <th>Relatórios</th>
          <th>Tickets</th>
          <th>Fechados</th>
          <th>Resolução</th>
          <th>Bugs</th>
          <th>Usuários únicos</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
            <tr>
              <td>${escapeHtml(monthLabel(r.month))}</td>
              <td>${r.reports}</td>
              <td>${r.tickets}</td>
              <td>${r.closed}</td>
              <td>${r.resolutionPct}%</td>
              <td>${r.bugs}</td>
              <td>${r.uniqueContacts}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderKpis(rows) {
  const el = document.getElementById('analytics-kpis');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '';
    return;
  }
  const totalReports = rows.reduce((a, r) => a + r.reports, 0);
  const totalTickets = rows.reduce((a, r) => a + r.tickets, 0);
  const totalClosed = rows.reduce((a, r) => a + r.closed, 0);
  const totalBugs = rows.reduce((a, r) => a + r.bugs, 0);
  const totalContacts = rows.reduce((a, r) => a + r.uniqueContacts, 0);
  const avgResolution = totalTickets ? Math.round((totalClosed / totalTickets) * 100) : 0;

  el.innerHTML = `
    <div class="metric"><div class="metric-label">Relatórios consolidados</div><div class="metric-value">${totalReports}</div></div>
    <div class="metric"><div class="metric-label">Tickets no período</div><div class="metric-value">${totalTickets}</div></div>
    <div class="metric"><div class="metric-label">Resolução média</div><div class="metric-value">${avgResolution}%</div></div>
    <div class="metric"><div class="metric-label">Bugs / Usuários únicos</div><div class="metric-value">${totalBugs} / ${totalContacts}</div></div>
  `;
}

export async function openAnalyticsScreen() {
  await histRefreshFromCloud();
  const supportEntries = getSupportReportEntries();
  const rows = aggregateSupportReports(supportEntries);

  const periodEl = document.getElementById('analytics-period');
  if (periodEl) {
    if (rows.length) {
      periodEl.textContent = `De ${monthLabel(rows[0].month)} até ${monthLabel(rows[rows.length - 1].month)}`;
    } else {
      periodEl.textContent = 'Sem histórico de suporte suficiente';
    }
  }

  renderKpis(rows);
  renderBars('analytics-chart-volume', rows, 'tickets');
  renderBars('analytics-chart-resolution', rows, 'resolutionPct', 'green');
  renderBars('analytics-chart-bugs', rows, 'bugs', 'red');
  renderBars('analytics-chart-contacts', rows, 'uniqueContacts', 'orange');
  renderTable(rows);
}

export function initAnalytics() {
  document.getElementById('btn-analytics-refresh')?.addEventListener('click', openAnalyticsScreen);
}
