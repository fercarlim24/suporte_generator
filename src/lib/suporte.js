import { CLOSED_TICKET_TAG, NOISE, NOTIFICATION_EMAIL_TAGS } from './config.js';
import { extractReportMonthFromDragMeta, reportMonthLabel } from './report-period.js';
import {
  escapeHtml,
  getCardName,
  getTagsRaw,
  normalizeCsvData,
  pickRowField,
  parseSuporteCsvFile,
} from './utils.js';

let insightsSaveTimer = null;
let suporteFileName = '';
let suporteCommitted = false;
let suporteSourceRows = [];

function scheduleSuporteAutoSave() {
  if (!suporteCommitted) return;
  import('./history.js').then(({ histAutoSave }) => histAutoSave('suporte'));
}

function textNode(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

/** Conta ruído (cards só com tags de status) sem alterar o que entra em chamados. */
export function summarizeSuporteParse(rows, processed) {
  const named = normalizeCsvData(rows || []).filter((row) => getCardName(row));
  let noise = 0;
  const statusOnly = new Set([
    'EM ANDAMENTO',
    'TICKET FECHADO',
    '✨ RESOLVED',
    '✨ ACTION REQUIRED',
    '✨ AWAITING RESPONSE',
    '✨ FYI',
    'INTERNO',
  ]);
  named.forEach((row) => {
    const tags = parseTags(getTagsRaw(row));
    const name = getCardName(row);
    if (isNotificationEmailCard({ tags, name })) return;
    const meaningful = tags.filter((tag) => !statusOnly.has(tag));
    if (!meaningful.length) noise += 1;
  });
  return {
    lines: processed?.total ?? named.length,
    tickets: processed?.realTickets ?? 0,
    notifications: processed?.notifications ?? 0,
    noise,
  };
}

export function setSuporteStep(step) {
  document.querySelectorAll('[data-suporte-step]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.suporteStep) === step);
  });
  document.getElementById('uploadArea')?.classList.toggle('active', step === 1);
  document.getElementById('reportWrap')?.classList.toggle('active', step === 2);
  document.getElementById('suporte-export')?.classList.toggle('active', step === 3);
  if (step === 3) prepareSuporteExport();
}

function renderParsePreview(processed, meta) {
  const box = document.getElementById('suporte-parse');
  if (!box) return;
  box.replaceChildren();
  if (!processed) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const summary = summarizeSuporteParse(suporteSourceRows, processed);
  box.append(textNode('h4', '', suporteFileName || 'CSV'));
  const metaLine = textNode('p', 'sub');
  metaLine.textContent = `${summary.lines} linhas · período ${meta.period || 'não detectado'}`;
  box.append(metaLine);
  const grid = textNode('div', 'parse-grid');
  [
    ['Tickets considerados', summary.tickets, 'Chamados reais, sem e-mail automático'],
    ['Notificações descartadas', summary.notifications, 'Tags EMAILS ou NOTIFICAÇÃO, fora da análise'],
    ['Ruído descartado', summary.noise, 'Só tags de status, sem categoria de produto'],
  ].forEach(([label, value, reason]) => {
    const card = textNode('article', 'card');
    card.append(textNode('div', 'kpi-label', label));
    card.append(textNode('div', 'kpi-value', String(value)));
    card.append(textNode('div', 'kpi-sub', reason));
    grid.append(card);
  });
  box.append(grid);
  const next = textNode('button', 'btn btn-primary', 'Revisar métricas');
  next.type = 'button';
  next.addEventListener('click', () => setSuporteStep(2));
  box.append(next);
}

async function prepareSuporteExport() {
  const replaceBox = document.getElementById('suporte-replace');
  const savedBox = document.getElementById('suporte-saved');
  if (!currentSuporteData) return;
  if (suporteCommitted) {
    if (replaceBox) replaceBox.hidden = true;
    if (savedBox) savedBox.hidden = false;
    return;
  }
  const meta = buildSuporteMeta(currentSuporteData.dragMeta || {});
  const { histGetAll } = await import('./history.js');
  const { getEntryReportMonth, reportMonthLabel } = await import('./report-period.js');
  const existing = meta.reportMonth
    ? histGetAll().find(
        (entry) =>
          entry.type === 'suporte' &&
          !entry.legacy &&
          entry.version === 2 &&
          getEntryReportMonth(entry) === meta.reportMonth,
      )
    : null;
  if (existing) {
    if (savedBox) savedBox.hidden = true;
    if (replaceBox) replaceBox.hidden = false;
    const text = document.getElementById('suporte-replace-text');
    if (text) {
      text.textContent = `Já existe um relatório de ${reportMonthLabel(meta.reportMonth)}. Substituir?`;
    }
    return;
  }
  if (replaceBox) replaceBox.hidden = true;
  await commitSuporteReport();
}

export async function commitSuporteReport() {
  if (!currentSuporteData) return null;
  suporteCommitted = true;
  const { histAutoSave } = await import('./history.js');
  const { isCloudAvailable } = await import('./api.js');
  const entry = await histAutoSave('suporte', { quiet: true });
  const replaceBox = document.getElementById('suporte-replace');
  const savedBox = document.getElementById('suporte-saved');
  if (replaceBox) replaceBox.hidden = true;
  if (savedBox) savedBox.hidden = false;
  const tag = document.getElementById('suporte-saved-tag');
  if (tag) {
    tag.className = 'tag tag-accent';
    tag.textContent = entry?.cloud || isCloudAvailable() ? 'Salvo · local + nuvem' : 'Salvo · local';
  }
  return entry;
}

function bindInsightsAutoSave(input) {
  input.addEventListener('input', () => {
    if (currentSuporteData) currentSuporteData.customInsights = input.value;
    clearTimeout(insightsSaveTimer);
    insightsSaveTimer = setTimeout(() => {
      if (!suporteCommitted) return;
      import('./history.js').then(({ histAutoSave }) => histAutoSave('suporte', { quiet: true }));
    }, 1500);
  });
}

export function parseTags(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\n\r]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

/** Card de email/notificação automática — não entra na análise de chamados */
export function isNotificationEmailCard({ tags, name = '' }) {
  if (!tags?.length) return false;
  if (tags.some((t) => NOTIFICATION_EMAIL_TAGS.has(t) || /^EMAILS\b/.test(t))) return true;
  if (tags.includes('✨ FYI') && /notifica|notification|no-reply|automati/i.test(name)) return true;
  return false;
}

export function isClosedTicket(tags) {
  return tags.includes(CLOSED_TICKET_TAG);
}

function extractEmails(raw) {
  if (!raw) return [];
  const m = String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return (m || []).map((e) => e.toLowerCase());
}

function isInternalSupportEmail(email) {
  return (
    email.endsWith('@landscape.to') ||
    email.endsWith('@fore.today') ||
    email.includes('no-reply')
  );
}

function getContactEmails(row) {
  const raw = [
    pickRowField(row, 'PARTICIPANTS'),
    pickRowField(row, 'CUSTOM'),
    pickRowField(row, 'CUSTOMER'),
    pickRowField(row, 'EMAIL'),
  ]
    .filter(Boolean)
    .join(', ');
  return extractEmails(raw).filter((e) => !isInternalSupportEmail(e));
}

function detectEnvironment(name, tags) {
  const txt = `${name} ${tags.join(' ')}`.toUpperCase();
  if (txt.includes('FORE')) return 'FORE';
  if (txt.includes('OS2') || txt.includes('LANDSCAPEOS2') || txt.includes('LS2')) return 'OS2';
  return 'GERAL';
}

function detectProblemType(name, tags) {
  const txt = `${name} ${tags.join(' ')}`.toUpperCase();
  if (txt.includes('BUG') || txt.includes('ERRO') || txt.includes('FALHA')) return 'Bug/Erro';
  if (
    txt.includes('ACESSO') ||
    txt.includes('LOGIN') ||
    txt.includes('SENHA') ||
    txt.includes('PERMISS')
  ) {
    return 'Acesso e permissões';
  }
  if (
    txt.includes('PAGAMENTO') ||
    txt.includes('PIX') ||
    txt.includes('NF') ||
    txt.includes('FISCAL') ||
    txt.includes('IMPOSTO') ||
    txt.includes('BOLETO') ||
    txt.includes('FORE')
  ) {
    return 'Financeiro/FORE';
  }
  if (txt.includes('INTEGRA') || txt.includes('API') || txt.includes('WEBHOOK')) {
    return 'Integrações';
  }
  if (txt.includes('RELATÓRIO') || txt.includes('EXPORT')) return 'Relatórios';
  if (txt.includes('DÚVIDA') || txt.includes('DUVIDA') || txt.includes('COMO')) {
    return 'Dúvidas operacionais';
  }
  return 'Outros';
}

function buildSuggestedAdjustments(data) {
  const suggestions = [];

  if (data.actionRequired > 0) {
    suggestions.push(
      `Criar regra de triagem para tickets "Action required" (atualmente ${data.actionRequired}) com SLA e responsável por categoria.`,
    );
  }

  if (data.bugs.length > 0) {
    suggestions.push(
      `Priorizar correção de bugs recorrentes (${data.bugs.length} no período) e acompanhar taxa de reincidência após deploy.`,
    );
  }

  const topEnv = data.envTypeMatrix?.[0];
  if (topEnv?.types?.length) {
    const topType = topEnv.types[0];
    suggestions.push(
      `No ambiente ${topEnv.env}, o principal tipo é "${topType.type}" (${topType.count} chamados). Avaliar ajuste estrutural para reduzir volume.`,
    );
  }

  const topCategory = data.categoryInsights?.[0];
  if (topCategory) {
    suggestions.push(
      `Na categoria "${topCategory.category}", o tipo dominante é "${topCategory.topType}" (${topCategory.topPct}%). Criar playbook específico para esse fluxo.`,
    );
  }

  if (data.uniqueContacts > 0) {
    suggestions.push(
      `Monitorar jornada dos ${data.uniqueContacts} usuários únicos com maior volume de contato e identificar pontos de fricção no produto.`,
    );
  }

  return suggestions.slice(0, 5);
}

export function processSuporteRows(data) {
  const rows = normalizeCsvData(data).filter((r) => getCardName(r));
  const total = rows.length;

  const enriched = rows.map((r) => ({
    row: r,
    name: getCardName(r),
    tags: parseTags(getTagsRaw(r)),
  }));

  const notifications = enriched.filter((e) => isNotificationEmailCard(e));
  const foreEmails = notifications.filter((e) => e.tags.includes('EMAILS FORE'));
  const foreTickets = enriched.filter(
    (e) =>
      !isNotificationEmailCard(e) &&
      e.tags.includes('FORE'),
  );
  const realTickets = enriched.filter((e) => !isNotificationEmailCard(e));
  const bugs = realTickets.filter((e) => e.tags.includes('BUG'));
  const closed = realTickets.filter((e) => isClosedTicket(e.tags));
  const openTickets = realTickets.length - closed.length;
  const actionRequired = realTickets.filter((e) => e.tags.includes('✨ ACTION REQUIRED'));
  const awaiting = realTickets.filter((e) => e.tags.includes('✨ AWAITING RESPONSE'));
  const inProgress = realTickets.filter((e) => e.tags.includes('EM ANDAMENTO'));

  const catMap = {};
  const envTypeMap = {};
  const categoryTypeMap = {};
  const uniqueContactEmails = new Set();
  realTickets.forEach(({ tags }) => {
    const cats = tags.filter((t) => !NOISE.has(t));
    if (!cats.length) {
      catMap['SEM CATEGORIA'] = (catMap['SEM CATEGORIA'] || 0) + 1;
    } else {
      cats.forEach((c) => {
        catMap[c] = (catMap[c] || 0) + 1;
      });
    }
  });
  realTickets.forEach(({ row, name, tags }) => {
    getContactEmails(row).forEach((email) => uniqueContactEmails.add(email));

    const env = detectEnvironment(name, tags);
    const ptype = detectProblemType(name, tags);
    envTypeMap[env] = envTypeMap[env] || {};
    envTypeMap[env][ptype] = (envTypeMap[env][ptype] || 0) + 1;

    const cats = tags.filter((t) => !NOISE.has(t));
    const targetCats = cats.length ? cats : ['SEM CATEGORIA'];
    targetCats.forEach((cat) => {
      categoryTypeMap[cat] = categoryTypeMap[cat] || {};
      categoryTypeMap[cat][ptype] = (categoryTypeMap[cat][ptype] || 0) + 1;
    });
  });

  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const envTypeMatrix = Object.entries(envTypeMap)
    .map(([env, types]) => {
      const totalEnv = Object.values(types).reduce((a, v) => a + v, 0);
      const sortedTypes = Object.entries(types)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({
          type,
          count,
          pct: totalEnv ? Math.round((count / totalEnv) * 100) : 0,
        }));
      return { env, total: totalEnv, types: sortedTypes };
    })
    .sort((a, b) => b.total - a.total);

  const categoryInsights = Object.entries(categoryTypeMap)
    .map(([category, types]) => {
      const totalCat = Object.values(types).reduce((a, v) => a + v, 0);
      const [topType, topCount] = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
      return {
        category,
        total: totalCat,
        topType,
        topCount,
        topPct: totalCat ? Math.round((topCount / totalCat) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const result = {
    total,
    notifications: notifications.length,
    foreEmails: foreEmails.length,
    foreTickets: foreTickets.length,
    realTickets: realTickets.length,
    bugs: bugs.map((e) => ({ name: e.name })),
    closed: closed.length,
    openTickets,
    actionRequired: actionRequired.length,
    awaiting: awaiting.length,
    inProgress: inProgress.length,
    cats,
    uniqueContacts: uniqueContactEmails.size,
    envTypeMatrix,
    categoryInsights,
    generatedAt: new Date().toISOString(),
  };

  result.suggestedAdjustments = buildSuggestedAdjustments(result);

  return result;
}

export function buildSuporteMeta(dragMeta = {}) {
  const now = new Date();
  const reportMonth = extractReportMonthFromDragMeta(dragMeta);
  const period =
    dragMeta.period ||
    (reportMonth ? reportMonthLabel(reportMonth) : null) ||
    now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return {
    title: dragMeta.board ? `Relatório de Suporte — ${dragMeta.board}` : 'Relatório de Suporte',
    period,
    reportMonth,
    footerDate: now.toLocaleDateString('pt-BR'),
  };
}

export function renderSuporteReport(d, meta = buildSuporteMeta()) {
  document.getElementById('rptPeriod').textContent = meta.period || '';
  document.getElementById('rptFooterRight').textContent =
    'Gerado em ' + (meta.footerDate || new Date().toLocaleDateString('pt-BR'));

  const closedPct = d.realTickets ? Math.round((d.closed / d.realTickets) * 100) : 0;

  document.getElementById('rptMetrics').innerHTML = `
    <div class="metric"><div class="metric-label">Tickets</div><div class="metric-value">${d.realTickets}</div><div class="metric-sub">excl. ${d.notifications} notificações</div></div>
    <div class="metric"><div class="metric-label">Fechados</div><div class="metric-value">${d.closed}</div><div class="metric-sub">${closedPct}% só com TICKET FECHADO</div></div>
    <div class="metric"><div class="metric-label">FORE</div><div class="metric-value">${d.foreTickets}</div><div class="metric-sub">${d.foreEmails} notificações FORE à parte</div></div>
    <div class="metric"><div class="metric-label">Bugs</div><div class="metric-value">${d.bugs.length}</div><div class="metric-sub">chamados com tag BUG</div></div>
  `;

  document.getElementById('rptFore').innerHTML = `
    <div class="rpt-card-title"><span class="dot dot-orange"></span>Notificações e FORE</div>
    <div class="fore-metrics">
      <div class="fore-metric"><div class="fore-label">Notificações</div><div class="fore-value">${d.notifications}</div><div class="fore-sub">emails automáticos (fora dos chamados)</div></div>
      <div class="fore-metric"><div class="fore-label">Emails FORE</div><div class="fore-value">${d.foreEmails}</div><div class="fore-sub">tag EMAILS FORE</div></div>
      <div class="fore-metric"><div class="fore-label">Tickets FORE</div><div class="fore-value">${d.foreTickets}</div><div class="fore-sub">chamados reais FORE</div></div>
      <div class="fore-note">Notificações automáticas não entram no total de chamados nem na taxa de fechamento. A taxa de sucesso considera apenas cards com a tag <strong>TICKET FECHADO</strong>.</div>
    </div>
  `;

  const catBars = d.cats
    .map(([c, v]) => {
      const pct = d.realTickets ? Math.round((v / d.realTickets) * 100) : 0;
      return `<div class="cat-row"><div class="cat-meta"><span>${escapeHtml(c)}</span><span>${v} · ${pct}%</span></div><div class="cat-bar"><div class="cat-fill" style="width:${pct}%"></div></div></div>`;
    })
    .join('');

  const statusHTML = `
    <div class="status-pills">
      <span class="pill pill-green">${d.closed} TICKET FECHADO</span>
      <span class="pill pill-gray">${d.openTickets} Em aberto</span>
      <span class="pill pill-orange">${d.actionRequired} Action required</span>
      <span class="pill pill-gray">${d.awaiting} Awaiting response</span>
      <span class="pill pill-gray">${d.inProgress} Em andamento</span>
      <span class="pill pill-red">${d.bugs.length} Bugs</span>
    </div>
  `;

  document.getElementById('rptTwoCol').innerHTML = `
    <div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-purple"></span>Categorias</div>${catBars}</div>
    <div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-green"></span>Status dos tickets</div>${statusHTML}</div>
  `;

  const bugList = d.bugs.length
    ? `<ul class="bug-list">${d.bugs.map((b) => `<li class="bug-item"><span class="bug-dot"></span><span>${escapeHtml(b.name)}</span></li>`).join('')}</ul>`
    : `<p class="sub">Nenhum bug reportado no período.</p>`;
  document.getElementById('rptBugs').innerHTML = `<div class="rpt-card-title"><span class="dot dot-red"></span>Bugs (${d.bugs.length})</div>${bugList}`;

  const envRows =
    d.envTypeMatrix?.length
      ? d.envTypeMatrix
          .map((env) => {
            const top = env.types.slice(0, 3).map((t) => `${escapeHtml(t.type)} (${t.count})`).join(' · ');
            return `<tr><td>${escapeHtml(env.env)}</td><td>${env.total}</td><td>${top}</td></tr>`;
          })
          .join('')
      : '<tr><td colspan="3">Sem dados</td></tr>';

  const catInsights =
    d.categoryInsights?.length
      ? d.categoryInsights
          .slice(0, 6)
          .map(
            (c) =>
              `<li><strong>${escapeHtml(c.category)}</strong>: ${escapeHtml(c.topType)} (${c.topCount}/${c.total} · ${c.topPct}%)</li>`,
          )
          .join('')
      : '<li>Sem dados suficientes para análise por categoria.</li>';

  const defaultInsightsText = (d.suggestedAdjustments || [])
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');
  const customInsightsText = d.customInsights || defaultInsightsText;

  document.getElementById('rptObs').innerHTML = `
    <div class="rpt-card-title"><span class="dot dot-purple"></span>Observações</div>
    <div class="obs-item"><span class="obs-tag obs-alert">Atenção</span><span class="obs-text">Revise os tickets de <strong>Action required</strong> em aberto.</span></div>
    <div class="obs-item"><span class="obs-tag obs-ok">Positivo</span><span class="obs-text">Taxa de fechamento (<strong>TICKET FECHADO</strong>) de <strong>${closedPct}%</strong> sobre ${d.realTickets} chamados.</span></div>
    <div class="obs-item"><span class="obs-tag pill-gray">Contato</span><span class="obs-text"><strong>${d.uniqueContacts || 0}</strong> usuários únicos entraram em contato no período.</span></div>
    <div class="insights-block">
      <div class="insights-title">Ambiente × tipo de problema</div>
      <table class="insights-table">
        <thead><tr><th>Ambiente</th><th>Tickets</th><th>Principais tipos</th></tr></thead>
        <tbody>${envRows}</tbody>
      </table>
      <div class="insights-title" style="margin-top:10px;">Tipo dominante por categoria</div>
      <ul class="insights-list">${catInsights}</ul>
      <div class="insights-title" style="margin-top:12px;">Sugestões de ajustes do sistema (editável)</div>
      <textarea id="rptInsightsInput" class="insights-input" rows="6" placeholder="Adicione recomendações para o time de produto/suporte...">${escapeHtml(customInsightsText)}</textarea>
    </div>
  `;

  const insightsInput = document.getElementById('rptInsightsInput');
  if (insightsInput) bindInsightsAutoSave(insightsInput);
}

export function buildSuportePreviewHtml(d, meta) {
  const closedPct = d.realTickets ? Math.round((d.closed / d.realTickets) * 100) : 0;
  const catBars = d.cats
    .map(([c, v]) => {
      const pct = d.realTickets ? Math.round((v / d.realTickets) * 100) : 0;
      return `<div class="cat-row"><div class="cat-meta"><span>${escapeHtml(c)}</span><span>${v} · ${pct}%</span></div><div class="cat-bar"><div class="cat-fill" style="width:${pct}%"></div></div></div>`;
    })
    .join('');
  const bugList = d.bugs.length
    ? `<ul class="bug-list">${d.bugs.map((b) => `<li class="bug-item"><span class="bug-dot"></span><span>${escapeHtml(b.name)}</span></li>`).join('')}</ul>`
    : `<p class="sub">Nenhum bug reportado no período.</p>`;
  const suggestions = d.customInsights
    ? `<div style="white-space:pre-wrap;font-size:12px;line-height:1.6;color:var(--color-text);">${escapeHtml(d.customInsights)}</div>`
    : `<ul class="insights-list">${(d.suggestedAdjustments || [])
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join('')}</ul>`;

  return `
    <div class="report-wrap" style="display:block;">
      <div class="report-header">
        <div>
          <div class="report-logo">LandscapeOS 2 — Suporte</div>
          <div class="report-title">Relatório mensal</div>
          <div class="report-period">${escapeHtml(meta.period || '')}</div>
        </div>
      </div>
      <div class="metrics">
        <div class="metric"><div class="metric-label">Total de cards</div><div class="metric-value">${d.total}</div></div>
        <div class="metric"><div class="metric-label">Chamados</div><div class="metric-value">${d.realTickets}</div><div class="metric-sub">excl. ${d.notifications} notif.</div></div>
        <div class="metric"><div class="metric-label">Fechados</div><div class="metric-value">${d.closed}</div><div class="metric-sub">${closedPct}% TICKET FECHADO</div></div>
        <div class="metric"><div class="metric-label">Bugs</div><div class="metric-value">${d.bugs.length}</div></div>
      </div>
      <div class="fore-wrap"><div class="rpt-card-title">Notificações</div><p class="sub">${d.notifications} fora dos chamados · FORE: ${d.foreEmails} emails · ${d.foreTickets} tickets</p></div>
      <div class="two-col">
        <div class="rpt-card"><div class="rpt-card-title">Categorias</div>${catBars}</div>
        <div class="rpt-card"><div class="rpt-card-title">Status</div>
          <div class="status-pills">
            <span class="pill pill-green">${d.closed} TICKET FECHADO</span>
            <span class="pill pill-gray">${d.openTickets} Em aberto</span>
          </div>
        </div>
      </div>
      <div class="rpt-card">${bugList}</div>
      <div class="rpt-card"><div class="rpt-card-title">Sugestões de ajustes do sistema</div>${suggestions}</div>
      <div class="report-footer"><span>LandscapeOS 2</span><span>Gerado em ${escapeHtml(meta.footerDate || '')}</span></div>
    </div>`;
}

let currentSuporteData = null;

export function getCurrentSuporteData() {
  return currentSuporteData;
}

export function processAndRenderSuporte(data, dragMeta = {}) {
  if (!data?.length) {
    alert('O CSV está vazio ou não foi lido. Confira o export Daily Cards do Drag.app.');
    return null;
  }
  currentSuporteData = processSuporteRows(data);
  if (currentSuporteData.total === 0) {
    const keys = Object.keys(data[0] || {}).join(', ') || '(nenhuma)';
    alert(
      'Nenhum card encontrado no CSV.\n\n' +
        'Colunas detectadas: ' +
        keys +
        '\n\nEsperado: CARD NAME e TAGS na linha de cabeçalho do export Daily Cards.\n' +
        'Exporte de novo: Drag → três pontos → Export → Daily Cards CSV.',
    );
    return null;
  }
  currentSuporteData.dragMeta = dragMeta;
  suporteSourceRows = data;
  suporteCommitted = false;
  const meta = buildSuporteMeta(dragMeta);
  renderSuporteReport(currentSuporteData, meta);
  renderParsePreview(currentSuporteData, meta);
  setSuporteStep(1);
  return currentSuporteData;
}

export function resetSuporteView() {
  currentSuporteData = null;
  suporteFileName = '';
  suporteSourceRows = [];
  suporteCommitted = false;
  const input = document.getElementById('csvInput');
  if (input) input.value = '';
  const preview = document.getElementById('suporte-parse');
  if (preview) {
    preview.replaceChildren();
    preview.hidden = true;
  }
  const saved = document.getElementById('suporte-saved');
  const replaceBox = document.getElementById('suporte-replace');
  if (saved) saved.hidden = true;
  if (replaceBox) replaceBox.hidden = true;
  setSuporteStep(1);
}

export function printSuporteReport() {
  const source = document.getElementById('reportWrap');
  const frame = document.getElementById('print-frame');
  if (!source || !frame) return;

  const liveFields = [...source.querySelectorAll('textarea')];
  const clone = source.cloneNode(true);
  clone.classList.add('active');
  clone.removeAttribute('id');
  clone.querySelectorAll('.np, .report-actions').forEach((el) => el.remove());
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  clone.querySelectorAll('.insights-title').forEach((el) => {
    el.textContent = el.textContent.replace(/\s*\(editável\)\s*$/u, '');
  });
  clone.querySelectorAll('textarea').forEach((area, index) => {
    const block = document.createElement('div');
    block.className = 'insights-print';
    block.textContent = liveFields[index]?.value || '';
    area.replaceWith(block);
  });

  frame.replaceChildren(clone);
  document.body.classList.add('print-doc');

  const cleanup = () => {
    document.body.classList.remove('print-doc');
    frame.replaceChildren();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export function loadSuporteDemo() {
  const demo = [
    { CARD_NAME: 'Ajuste no cadastro de fornecedor', TAGS: 'AJUSTES,TICKET FECHADO', COLOR: 'green' },
    { CARD_NAME: 'FORE - Pagamento não processado', TAGS: 'FORE,EM ANDAMENTO', COLOR: 'orange' },
    { CARD_NAME: 'FORE notification auto', TAGS: 'EMAILS FORE', COLOR: 'gray' },
    { CARD_NAME: 'FORE notification auto 2', TAGS: 'EMAILS FORE', COLOR: 'gray' },
    { CARD_NAME: 'FORE notification auto 3', TAGS: 'EMAILS FORE', COLOR: 'gray' },
    { CARD_NAME: 'Erro ao aprovar budget', TAGS: 'BUG,✨ Action required', COLOR: 'red' },
    { CARD_NAME: 'Dúvida sobre verba adiantada', TAGS: 'VERBAS,TICKET FECHADO', COLOR: 'green' },
    { CARD_NAME: 'PO não enviada', TAGS: 'PO,✨ Awaiting response', COLOR: 'yellow' },
    { CARD_NAME: 'Acesso bloqueado para usuário', TAGS: 'ACESSO,TICKET FECHADO', COLOR: 'green' },
    { CARD_NAME: 'Relatório P&L incorreto', TAGS: 'BUG,EM ANDAMENTO', COLOR: 'orange' },
    { CARD_NAME: 'Integração Autentique falhando', TAGS: 'INTEGRAÇÕES,✨ Action required', COLOR: 'red' },
    { CARD_NAME: 'Dúvida sobre cashê teste', TAGS: 'CASTING,TICKET FECHADO', COLOR: 'green' },
    { CARD_NAME: 'Erro de cálculo de imposto', TAGS: 'BUG,✨ Action required', COLOR: 'red' },
    { CARD_NAME: 'FORE - Divergência de valor', TAGS: 'FORE,TICKET FECHADO', COLOR: 'green' },
    { CARD_NAME: 'Upload de NF não funciona', TAGS: 'NF,EM ANDAMENTO', COLOR: 'orange' },
    { CARD_NAME: 'FORE notification auto 4', TAGS: 'EMAILS FORE', COLOR: 'gray' },
    { CARD_NAME: 'FORE notification auto 5', TAGS: 'EMAILS FORE', COLOR: 'gray' },
    { CARD_NAME: 'Novo usuário não recebe email', TAGS: 'ACESSO,TICKET FECHADO', COLOR: 'green' },
    { CARD_NAME: 'Cronograma não exporta', TAGS: 'AJUSTES,✨ Awaiting response', COLOR: 'yellow' },
    { CARD_NAME: 'Multi-moeda com taxa errada', TAGS: 'BUDGET,✨ Action required', COLOR: 'red' },
  ].map((r) => ({ 'CARD NAME': r.CARD_NAME, TAGS: r.TAGS, COLOR: r.COLOR }));
  processAndRenderSuporte(demo);
}

function handleSuporteCsv(file) {
  if (!file) return;
  suporteFileName = file.name || 'CSV';
  parseSuporteCsvFile(file, (rows, meta) => processAndRenderSuporte(rows, meta || {}));
}

export function initSuporte() {
  const input = document.getElementById('csvInput');
  const dz = document.getElementById('dropZone');
  if (!input || !dz) return;

  input.addEventListener('change', (e) => {
    handleSuporteCsv(e.target.files[0]);
  });

  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    handleSuporteCsv(e.dataTransfer.files[0]);
  });

  document.querySelectorAll('[data-suporte-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentSuporteData && Number(btn.dataset.suporteStep) > 1) return;
      setSuporteStep(Number(btn.dataset.suporteStep));
    });
  });
  document.getElementById('suporte-replace-yes')?.addEventListener('click', () => commitSuporteReport());
  document.getElementById('suporte-replace-no')?.addEventListener('click', () => setSuporteStep(2));
  document.getElementById('btn-suporte-goto-export')?.addEventListener('click', () => {
    if (currentSuporteData) setSuporteStep(3);
  });
  document.getElementById('btn-suporte-print')?.addEventListener('click', () => printSuporteReport());
  document.getElementById('btn-suporte-history')?.addEventListener('click', () => {
    import('./shell.js').then(({ goTo }) => goTo('hist'));
  });
  setSuporteStep(1);
}
