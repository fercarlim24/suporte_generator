import { loadProductPulse } from './bi.js';
import { rollupPulseByPeriod, summarizePulse } from './bi/pulse.js';
import { reportMonthLabel } from './report-period.js';
import { escapeHtml } from './utils.js';

const TABS = [
  ['pulse', 'Pulse'],
  ['suporte', 'Suporte'],
  ['uso', 'Uso'],
  ['esforco', 'Esforço'],
  ['contas', 'Contas'],
  ['qualitativo', 'Qualitativo'],
];

const FRESH_SOURCES = [
  ['drag', 'Suporte'],
  ['manual_horas', 'Horas'],
  ['one_pager', 'One Pager'],
  ['ga4', 'GA4'],
  ['metabase', 'Metabase'],
];

let activeTab = 'pulse';
let lastModel = null;
let loadSeq = 0;

function readFilters() {
  return {
    from: document.getElementById('pulse-from')?.value || '',
    to: document.getElementById('pulse-to')?.value || '',
    product: document.getElementById('pulse-product')?.value || 'ALL',
  };
}

function monthLabel(key) {
  return reportMonthLabel(key) || key || '—';
}

function fmt(value, kind) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (kind === 'pct') return `${Math.round(n)}%`;
  if (kind === 'hours') return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (kind === 'ratio') return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return Math.round(n).toLocaleString('pt-BR');
}

function formatAsOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function kpi(label, value, sub, placeholder = false) {
  return `<div class="metric${placeholder ? ' metric-placeholder' : ''}">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${value}</div>
    <div class="metric-sub">${escapeHtml(sub || '')}</div>
  </div>`;
}

function renderKpis(summary, integrations) {
  const el = document.getElementById('analytics-kpis');
  if (!el) return;
  const gaPlaceholder = !summary.hasUsage;
  const mbPlaceholder = !summary.hasBusiness;
  const gaSub = summary.hasUsage
    ? summary.months > 1
      ? 'pico no período'
      : 'proxy GA'
    : integrations.ga4
      ? 'sem dados no período'
      : 'GA não configurado';
  const mbSub = summary.hasBusiness
    ? summary.months > 1
      ? 'pico no período'
      : 'Metabase'
    : integrations.metabase
      ? 'sem dados no período'
      : 'Metabase não configurado';

  el.innerHTML = [
    kpi('Tickets', fmt(summary.tickets), summary.hasSupport ? 'suporte' : 'sem CSV no período', !summary.hasSupport),
    kpi('Fechamento', fmt(summary.closed_rate, 'pct'), 'taxa no recorte', summary.closed_rate == null),
    kpi('Bugs', fmt(summary.bugs), summary.hasSupport ? 'chamados com bug' : 'sem CSV no período', !summary.hasSupport),
    kpi('Contatos', fmt(summary.unique_contacts), 'únicos por mês, somados', !summary.hasSupport),
    kpi('Horas dev', fmt(summary.dev_hours, 'hours'), summary.hasEffort ? 'lançamento manual' : 'sem horas no período', !summary.hasEffort),
    kpi('% bugfix', fmt(summary.pct_bugfix, 'pct'), 'horas na categoria BUG', summary.pct_bugfix == null),
    kpi('MAU', fmt(summary.mau_proxy), gaSub, gaPlaceholder),
    kpi('Tenants', fmt(summary.active_tenants), mbSub, mbPlaceholder),
  ].join('');
}

function renderFreshness(model) {
  const el = document.getElementById('pulse-freshness');
  if (!el) return;
  const bySource = new Map((model.freshness || []).map((s) => [s.source, s]));
  el.innerHTML = FRESH_SOURCES.map(([id, label]) => {
    const row = bySource.get(id);
    const configured =
      (id === 'ga4' && model.integrations?.ga4) || (id === 'metabase' && model.integrations?.metabase);
    let detail = 'sem dados';
    let missing = true;
    if (row?.as_of) {
      detail = formatAsOf(row.as_of);
      missing = false;
    } else if ((id === 'ga4' || id === 'metabase') && !configured) {
      detail = 'não configurado';
    } else if (configured) {
      detail = 'configurado · sem sync';
    }
    const origin =
      id === 'drag'
        ? 'upload manual'
        : id === 'ga4' || id === 'metabase'
          ? 'sync'
          : 'save manual';
    return `<span class="fresh-badge${missing ? ' missing' : ''}">${escapeHtml(label)} · ${origin} · ${escapeHtml(detail)}</span>`;
  }).join('');
}

function renderNote(model) {
  const el = document.getElementById('pulse-source-note');
  if (!el) return;
  if (model.origin === 'cloud') {
    el.textContent = 'Fonte: warehouse (mart_product_pulse). Upload de suporte continua manual.';
    return;
  }
  if (model.warning === 'schema') {
    el.textContent =
      'schema_bi ainda não está no Supabase. Mostrando suporte, horas e one pager do histórico deste navegador. GA e Metabase ficam vazios.';
    return;
  }
  if (model.warning === 'empty') {
    el.textContent =
      'Warehouse sem fatos neste recorte. Mostrando o histórico deste navegador. GA e Metabase ficam vazios até o sync.';
    return;
  }
  if (model.warning) {
    el.textContent = `Nuvem indisponível (${model.warning}). Mostrando o histórico deste navegador.`;
    return;
  }
  el.textContent =
    'Histórico deste navegador. No GitHub Pages a API não existe — o BI na nuvem fica na Vercel. GA e Metabase aparecem vazios.';
}

function renderBars(rows, field, colorClass) {
  const withVal = rows.filter((r) => r[field] != null);
  if (!withVal.length) {
    return '<div class="analytics-empty">Sem dados suficientes para este gráfico.</div>';
  }
  const max = Math.max(...withVal.map((r) => Number(r[field] || 0)), 1);
  return `<div class="bar-chart">${withVal
    .map((r) => {
      const val = Number(r[field] || 0);
      const h = Math.max(2, Math.round((val / max) * 150));
      const shown = field === 'dev_hours' ? fmt(val, 'hours') : field === 'closed_rate' ? fmt(val, 'pct') : fmt(val);
      return `<div class="bar-col">
        <div class="bar-val">${shown}</div>
        <div class="bar ${colorClass}" style="height:${h}px"></div>
        <div class="bar-label">${escapeHtml(monthLabel(r.period))}</div>
      </div>`;
    })
    .join('')}</div>`;
}

function emptyBox(text) {
  return `<div class="pulse-empty">${text}</div>`;
}

function table(headers, bodyRows) {
  if (!bodyRows.length) return '';
  return `<table class="analytics-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${bodyRows.join('')}</tbody></table>`;
}

function insight(summary) {
  if (summary.bugs == null && summary.pct_bugfix == null) return '';
  const bits = [];
  if (summary.bugs != null) bits.push(`${fmt(summary.bugs)} bugs`);
  if (summary.pct_bugfix != null) bits.push(`${fmt(summary.pct_bugfix, 'pct')} das horas em BUG`);
  if (summary.tickets_per_mau != null) bits.push(`${fmt(summary.tickets_per_mau, 'ratio')} tickets por MAU`);
  if (!bits.length) return '';
  return `<p class="pulse-insight">${bits.join(' · ')}</p>`;
}

function renderPulse(months, summary) {
  return `<div class="analytics-grid">
    <div class="rpt-card">
      <div class="rpt-card-title"><span class="dot dot-purple"></span>Tickets por mês</div>
      ${summary.hasSupport ? renderBars(months, 'tickets', '') : emptyBox('Sem CSV no período. O upload continua manual na tela Suporte.')}
    </div>
    <div class="rpt-card">
      <div class="rpt-card-title"><span class="dot dot-green"></span>Horas de desenvolvimento por mês</div>
      ${summary.hasEffort ? renderBars(months, 'dev_hours', 'green') : emptyBox('Sem horas neste período. O lançamento continua manual na tela Horas.')}
    </div>
  </div>${insight(summary)}`;
}

function renderSuporte(months, summary, product) {
  if (!summary.hasSupport) {
    const extra =
      product === 'FORE'
        ? ' O CSV do Drag entra como produto OS2; no filtro FORE o suporte fica vazio.'
        : '';
    return emptyBox(`Nenhum relatório de suporte neste período. O upload do CSV continua manual na tela Suporte.${extra}`);
  }
  const rows = months
    .filter((r) => r.tickets != null)
    .map(
      (r) => `<tr>
        <td>${escapeHtml(monthLabel(r.period))}</td>
        <td>${fmt(r.tickets)}</td>
        <td>${fmt(r.closed)}</td>
        <td>${fmt(r.closed_rate, 'pct')}</td>
        <td>${fmt(r.bugs)}</td>
        <td>${fmt(r.unique_contacts)}</td>
      </tr>`,
    );
  return `<div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-purple"></span>Suporte no recorte</div>
    ${table(['Mês', 'Tickets', 'Fechados', 'Fechamento', 'Bugs', 'Contatos'], rows)}</div>`;
}

function renderUso(months, model) {
  if (!model.integrations.ga4 && !model.summary.hasUsage) {
    return emptyBox('Google Analytics não configurado. Defina GA_PROPERTY_ID, GA_CLIENT_EMAIL e GA_PRIVATE_KEY na Vercel. O sync remoto ainda é um stub: POST /api/bi/sync/ga.');
  }
  if (!model.summary.hasUsage && !(model.features || []).length) {
    return emptyBox('GA configurado, sem uso neste período. Rode o sync ou envie rows para /api/bi/sync/ga.');
  }
  const monthRows = months
    .filter((r) => r.mau_proxy != null || r.sessions != null)
    .map(
      (r) => `<tr>
        <td>${escapeHtml(monthLabel(r.period))}</td>
        <td>${escapeHtml(r.product_code)}</td>
        <td>${fmt(r.mau_proxy)}</td>
        <td>${fmt(r.sessions)}</td>
        <td>${fmt(r.feature_events)}</td>
      </tr>`,
    );
  const featureRows = (model.features || []).slice(0, 40).map(
    (f) => `<tr>
      <td>${escapeHtml(f.feature_key || '—')}</td>
      <td>${escapeHtml(f.product_code || '')}</td>
      <td>${fmt(f.event_count)}</td>
      <td>${fmt(f.users)}</td>
      <td>${fmt(f.tickets)}</td>
    </tr>`,
  );
  return `<div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-purple"></span>Uso mensal</div>
      ${monthRows.length ? table(['Mês', 'Produto', 'MAU proxy', 'Sessões', 'feature_use'], monthRows) : '<div class="analytics-empty">Sem agregado mensal de GA.</div>'}
    </div>
    <div class="rpt-card" style="margin-top:14px;">
      <div class="rpt-card-title"><span class="dot dot-orange"></span>Features na semana ${escapeHtml(model.weekStart || '')}</div>
      ${featureRows.length ? table(['Feature', 'Produto', 'Eventos', 'Usuários', 'Tickets'], featureRows) : emptyBox('Sem linhas em mart_feature_health para esta semana.')}
    </div>`;
}

function renderEsforco(model) {
  if (!model.summary.hasEffort) {
    return emptyBox('Nenhum lançamento de horas neste período. As horas continuam manuais na tela Horas.');
  }
  const rows = model.rows
    .filter((r) => r.dev_hours != null || r.dev_minutes != null)
    .map(
      (r) => `<tr>
        <td>${escapeHtml(monthLabel(r.period))}</td>
        <td>${escapeHtml(r.product_code)}</td>
        <td>${fmt(r.dev_hours, 'hours')}</td>
        <td>${fmt(r.pct_bugfix, 'pct')}</td>
      </tr>`,
    );
  return `<div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-green"></span>Esforço por produto</div>
    ${table(['Mês', 'Produto', 'Horas', '% bugfix'], rows)}</div>`;
}

function renderContas(model) {
  if (!model.integrations.metabase && !model.summary.hasBusiness && !(model.tenants || []).length) {
    return emptyBox('Metabase não configurado. Defina METABASE_URL e METABASE_API_KEY na Vercel. O sync remoto ainda é um stub: POST /api/bi/sync/metabase.');
  }
  const tenantRows = (model.tenants || []).slice(0, 40).map(
    (t) => `<tr>
      <td>${escapeHtml(t.tenant_name || t.tenant_id || '—')}</td>
      <td>${escapeHtml(t.product_code || '')}</td>
      <td>${fmt(t.ga_users)}</td>
      <td>${fmt(t.support_tickets_month)}</td>
      <td>${fmt(t.backend_errors)}</td>
    </tr>`,
  );
  if (!tenantRows.length && !model.summary.hasBusiness) {
    return emptyBox('Metabase configurado, sem contas nesta semana.');
  }
  return `<div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-orange"></span>Contas na semana ${escapeHtml(model.weekStart || '')}</div>
    ${tenantRows.length ? table(['Conta', 'Produto', 'Usuários GA', 'Tickets no mês', 'Erros backend'], tenantRows) : emptyBox('Sem linhas em mart_tenant_health. O agregado mensal de tenants está nos KPIs.')}
  </div>`;
}

function renderQualitativo(model) {
  if (!model.summary.hasHealth) {
    return emptyBox('Nenhum one pager neste período. O formulário semanal continua na tela One Pager.');
  }
  const rows = model.rows
    .filter((r) => r.rag_risk_avg != null)
    .map((r) => {
      const text = r.summary_text ? escapeHtml(String(r.summary_text).slice(0, 180)) : '—';
      return `<tr>
        <td>${escapeHtml(monthLabel(r.period))}</td>
        <td>${escapeHtml(r.product_code)}</td>
        <td>${fmt(r.rag_risk_avg, 'ratio')}</td>
        <td>${fmt(r.rag_scope_avg, 'ratio')}</td>
        <td>${text}</td>
      </tr>`;
    });
  return `<div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-orange"></span>RAG do one pager</div>
    <p class="pulse-insight">0 verde · 1 amarelo · 2 vermelho · 3 n/a. Média das semanas do mês.</p>
    ${table(['Mês', 'Produto', 'Risco', 'Escopo', 'Resumo'], rows)}</div>`;
}

function renderPanel(model) {
  const panel = document.getElementById('pulse-panel');
  if (!panel) return;
  const months = rollupPulseByPeriod(model.rows);
  const product = readFilters().product;
  if (activeTab === 'suporte') panel.innerHTML = renderSuporte(months, model.summary, product);
  else if (activeTab === 'uso') panel.innerHTML = renderUso(months, model);
  else if (activeTab === 'esforco') panel.innerHTML = renderEsforco(model);
  else if (activeTab === 'contas') panel.innerHTML = renderContas(model);
  else if (activeTab === 'qualitativo') panel.innerHTML = renderQualitativo(model);
  else panel.innerHTML = renderPulse(months, model.summary);
}

function renderAll(model) {
  const summary = summarizePulse(model.rows);
  const view = { ...model, summary };
  const periodEl = document.getElementById('analytics-period');
  const filters = readFilters();
  if (periodEl) {
    const product = filters.product === 'ALL' ? 'todos os produtos' : filters.product;
    if (summary.months) {
      const months = rollupPulseByPeriod(model.rows);
      periodEl.textContent = `${monthLabel(months[0].period)} — ${monthLabel(months[months.length - 1].period)} · ${product}`;
    } else {
      periodEl.textContent = `Sem fatos neste recorte · ${product}`;
    }
  }
  renderNote(view);
  renderFreshness(view);
  renderKpis(summary, model.integrations || {});
  renderPanel(view);
  lastModel = view;
}

export async function openAnalyticsScreen() {
  const seq = ++loadSeq;
  const note = document.getElementById('pulse-source-note');
  if (note) note.textContent = 'Carregando…';
  const model = await loadProductPulse(readFilters());
  if (seq !== loadSeq) return;
  renderAll(model);
}

export function initAnalytics() {
  document.getElementById('btn-analytics-refresh')?.addEventListener('click', () => openAnalyticsScreen());
  ['pulse-from', 'pulse-to', 'pulse-product'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => openAnalyticsScreen());
  });
  document.getElementById('pulse-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pulse-tab]');
    if (!btn) return;
    activeTab = btn.dataset.pulseTab;
    document.querySelectorAll('[data-pulse-tab]').forEach((el) => {
      el.classList.toggle('active', el === btn);
    });
    if (lastModel) renderPanel(lastModel);
  });
}
