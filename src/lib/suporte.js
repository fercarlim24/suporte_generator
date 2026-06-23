import { NOISE, DRAG_BOARD_KEY } from './config.js';
import {
  checkDragAvailable,
  exportDragBoard,
  listDragBoards,
} from './drag-api.js';
import {
  escapeHtml,
  getCardName,
  getTagsRaw,
  normalizeCsvData,
  pickRowField,
  parseSuporteCsvFile,
  setLoading,
  showToast,
} from './utils.js';

export function parseTags(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\n\r]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
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

  const foreEmails = enriched.filter((e) => e.tags.includes('EMAILS FORE'));
  const foreTickets = enriched.filter(
    (e) => e.tags.includes('FORE') && !e.tags.includes('EMAILS FORE'),
  );
  const realTickets = enriched.filter((e) => !e.tags.includes('EMAILS FORE'));
  const bugs = realTickets.filter((e) => e.tags.includes('BUG'));
  const closed = realTickets.filter(
    (e) => e.tags.includes('TICKET FECHADO') || e.tags.includes('✨ RESOLVED'),
  );
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
    foreEmails: foreEmails.length,
    foreTickets: foreTickets.length,
    realTickets: realTickets.length,
    bugs: bugs.map((e) => ({ name: e.name })),
    closed: closed.length,
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
  return {
    title: dragMeta.board ? `Relatório de Suporte — ${dragMeta.board}` : 'Relatório de Suporte',
    period:
      dragMeta.period ||
      now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    footerDate: now.toLocaleDateString('pt-BR'),
  };
}

export function renderSuporteReport(d, meta = buildSuporteMeta()) {
  document.getElementById('uploadArea').style.display = 'none';
  const wrap = document.getElementById('reportWrap');
  wrap.style.display = 'block';

  document.getElementById('rptPeriod').textContent = meta.period || '';
  document.getElementById('rptFooterRight').textContent =
    'Gerado em ' + (meta.footerDate || new Date().toLocaleDateString('pt-BR'));

  const closedPct = d.realTickets ? Math.round((d.closed / d.realTickets) * 100) : 0;

  document.getElementById('rptMetrics').innerHTML = `
    <div class="metric"><div class="metric-label">Total de cards</div><div class="metric-value">${d.total}</div><div class="metric-sub">incl. notificações FORE</div></div>
    <div class="metric"><div class="metric-label">Tickets reais</div><div class="metric-value">${d.realTickets}</div><div class="metric-sub">excl. EMAILS FORE</div></div>
    <div class="metric"><div class="metric-label">Fechados</div><div class="metric-value">${d.closed}</div><div class="metric-sub">${closedPct}% de resolução</div></div>
    <div class="metric"><div class="metric-label">Bugs</div><div class="metric-value">${d.bugs.length}</div><div class="metric-sub">reportados no período</div></div>
  `;

  document.getElementById('rptFore').innerHTML = `
    <div class="rpt-card-title"><span class="dot dot-orange"></span>FORE</div>
    <div class="fore-metrics">
      <div class="fore-metric"><div class="fore-label">Emails FORE</div><div class="fore-value">${d.foreEmails}</div><div class="fore-sub">notificações automáticas</div></div>
      <div class="fore-metric"><div class="fore-label">Tickets FORE</div><div class="fore-value">${d.foreTickets}</div><div class="fore-sub">chamados reais</div></div>
      <div class="fore-metric"><div class="fore-label">Total FORE</div><div class="fore-value">${d.foreEmails + d.foreTickets}</div><div class="fore-sub">do total de ${d.total}</div></div>
      <div class="fore-note">Os emails FORE são notificações automáticas do sistema de pagamentos e não representam chamados de suporte. Os ${d.foreTickets} tickets FORE são interações reais com o time.</div>
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
      <span class="pill pill-green">${d.closed} Fechados</span>
      <span class="pill pill-orange">${d.actionRequired} Action required</span>
      <span class="pill pill-gray">${d.awaiting} Awaiting response</span>
      <span class="pill pill-gray">${d.inProgress} Em andamento</span>
    </div>
  `;

  document.getElementById('rptTwoCol').innerHTML = `
    <div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-purple"></span>Categorias</div>${catBars}</div>
    <div class="rpt-card"><div class="rpt-card-title"><span class="dot dot-green"></span>Status dos tickets</div>${statusHTML}</div>
  `;

  const bugList = d.bugs.length
    ? `<ul class="bug-list">${d.bugs.map((b) => `<li class="bug-item"><span class="bug-dot"></span><span>${escapeHtml(b.name)}</span></li>`).join('')}</ul>`
    : `<p style="font-size:12px;color:#aaa;">Nenhum bug reportado no período.</p>`;
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
    <div class="obs-item"><span class="obs-tag pill-orange" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;">Atenção</span><span class="obs-text">Revise os tickets de <strong>Action required</strong> em aberto.</span></div>
    <div class="obs-item"><span class="obs-tag pill-green" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;">Positivo</span><span class="obs-text">Taxa de resolução de <strong>${closedPct}%</strong> no período.</span></div>
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
  if (insightsInput) {
    insightsInput.addEventListener('input', () => {
      if (currentSuporteData) currentSuporteData.customInsights = insightsInput.value;
    });
  }
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
    : `<p style="font-size:12px;color:#aaa;">Nenhum bug reportado no período.</p>`;
  const suggestions = d.customInsights
    ? `<div style="white-space:pre-wrap;font-size:11px;line-height:1.6;color:#444;">${escapeHtml(d.customInsights)}</div>`
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
        <div class="metric"><div class="metric-label">Tickets reais</div><div class="metric-value">${d.realTickets}</div></div>
        <div class="metric"><div class="metric-label">Fechados</div><div class="metric-value">${d.closed}</div><div class="metric-sub">${closedPct}%</div></div>
        <div class="metric"><div class="metric-label">Bugs</div><div class="metric-value">${d.bugs.length}</div></div>
      </div>
      <div class="fore-wrap"><div class="rpt-card-title">FORE</div><p style="font-size:12px;color:#666;">Emails: ${d.foreEmails} · Tickets: ${d.foreTickets}</p></div>
      <div class="two-col">
        <div class="rpt-card"><div class="rpt-card-title">Categorias</div>${catBars}</div>
        <div class="rpt-card"><div class="rpt-card-title">Status</div>
          <div class="status-pills">
            <span class="pill pill-green">${d.closed} Fechados</span>
            <span class="pill pill-orange">${d.actionRequired} Action required</span>
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
  renderSuporteReport(currentSuporteData, buildSuporteMeta(dragMeta));
  return currentSuporteData;
}

export function resetSuporteView() {
  currentSuporteData = null;
  document.getElementById('uploadArea').style.display = 'flex';
  document.getElementById('reportWrap').style.display = 'none';
  const input = document.getElementById('csvInput');
  if (input) input.value = '';
}

function setDefaultDragDateRange() {
  const start = document.getElementById('drag-start-date');
  const end = document.getElementById('drag-end-date');
  if (!start || !end || (start.value && end.value)) return;

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const toInput = (d) => d.toISOString().slice(0, 10);
  start.value = toInput(first);
  end.value = toInput(now);
}

function suporteSwitchTab(tab) {
  const isApi = tab === 'api';
  document.getElementById('suporte-tab-api')?.classList.toggle('active', isApi);
  document.getElementById('suporte-tab-csv')?.classList.toggle('active', !isApi);
  const apiPanel = document.getElementById('suporte-panel-api');
  const csvPanel = document.getElementById('suporte-panel-csv');
  if (apiPanel) apiPanel.style.display = isApi ? 'block' : 'none';
  if (csvPanel) csvPanel.style.display = isApi ? 'none' : 'block';
}

function showDragApiError(message) {
  const el = document.getElementById('drag-api-error');
  if (!el) return;
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = message;
}

async function initDragApiPanel() {
  const statusEl = document.getElementById('drag-api-status');
  const formEl = document.getElementById('drag-api-form');
  const selectEl = document.getElementById('drag-board-select');
  if (!statusEl || !formEl || !selectEl) return;

  const available = await checkDragAvailable();
  if (!available) {
    statusEl.innerHTML =
      'API Drag não configurada no servidor. Defina <strong>DRAG_API_KEY</strong> na Vercel e faça redeploy. ' +
      'Enquanto isso, use a aba <strong>Upload CSV</strong>.';
    formEl.style.display = 'none';
    suporteSwitchTab('csv');
    return;
  }

  statusEl.textContent = 'Conectado à API Drag. Selecione o board e o período.';
  formEl.style.display = 'block';
  setDefaultDragDateRange();

  try {
    const boards = await listDragBoards();
    if (!boards.length) {
      selectEl.innerHTML = '<option value="">Nenhum board encontrado</option>';
      return;
    }

    const savedId = localStorage.getItem(DRAG_BOARD_KEY) || '';
    selectEl.innerHTML = boards
      .map(
        (b) =>
          `<option value="${escapeHtml(String(b.id))}"${String(b.id) === savedId ? ' selected' : ''}>${escapeHtml(b.name)}</option>`,
      )
      .join('');

    if (!savedId && boards.length === 1) {
      selectEl.value = String(boards[0].id);
    }
  } catch (e) {
    showDragApiError(e.message || 'Erro ao carregar boards.');
    selectEl.innerHTML = '<option value="">Erro ao carregar</option>';
  }
}

async function fetchFromDragApi() {
  const selectEl = document.getElementById('drag-board-select');
  const boardId = selectEl?.value;
  if (!boardId) {
    alert('Selecione um board de suporte.');
    return;
  }

  const startDate = document.getElementById('drag-start-date')?.value || '';
  const endDate = document.getElementById('drag-end-date')?.value || '';

  showDragApiError('');
  setLoading(true, 'Buscando cards no Drag.app…');

  try {
    const { rows, meta } = await exportDragBoard(boardId, { startDate, endDate });
    localStorage.setItem(DRAG_BOARD_KEY, boardId);

    if (!rows.length) {
      alert('Nenhum card encontrado no período selecionado.');
      return;
    }

    processAndRenderSuporte(rows, {
      board: meta.board,
      period: meta.period,
      source: 'drag-api',
      startDate: meta.startDate,
      endDate: meta.endDate,
    });
    showToast('Relatório gerado via API Drag.');
  } catch (e) {
    showDragApiError(e.message || 'Erro ao buscar dados do Drag.');
  } finally {
    setLoading(false);
  }
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

export function initSuporte() {
  const input = document.getElementById('csvInput');
  const dz = document.getElementById('dropZone');
  if (!input || !dz) return;

  suporteSwitchTab('api');
  initDragApiPanel();

  document.getElementById('suporte-tab-api')?.addEventListener('click', () => suporteSwitchTab('api'));
  document.getElementById('suporte-tab-csv')?.addEventListener('click', () => suporteSwitchTab('csv'));
  document.getElementById('btn-drag-fetch')?.addEventListener('click', fetchFromDragApi);

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    parseSuporteCsvFile(file, (rows, meta) => processAndRenderSuporte(rows, meta || {}));
  });

  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    parseSuporteCsvFile(file, (rows, meta) => processAndRenderSuporte(rows, meta || {}));
  });
}
