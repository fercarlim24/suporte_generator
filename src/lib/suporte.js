import { NOISE } from './config.js';
import {
  escapeHtml,
  getCardName,
  getTagsRaw,
  normalizeCsvData,
  parseCsvFile,
} from './utils.js';

export function parseTags(raw) {
  if (!raw) return [];
  return raw.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
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
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return {
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
    generatedAt: new Date().toISOString(),
  };
}

export function buildSuporteMeta() {
  const now = new Date();
  return {
    title: 'Relatório de Suporte',
    period: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
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

  document.getElementById('rptObs').innerHTML = `
    <div class="rpt-card-title"><span class="dot dot-purple"></span>Observações</div>
    <div class="obs-item"><span class="obs-tag pill-orange" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;">Atenção</span><span class="obs-text">Revise os tickets de <strong>Action required</strong> em aberto.</span></div>
    <div class="obs-item"><span class="obs-tag pill-green" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;">Positivo</span><span class="obs-text">Taxa de resolução de <strong>${closedPct}%</strong> no período.</span></div>
  `;
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
      <div class="report-footer"><span>LandscapeOS 2</span><span>Gerado em ${escapeHtml(meta.footerDate || '')}</span></div>
    </div>`;
}

let currentSuporteData = null;

export function getCurrentSuporteData() {
  return currentSuporteData;
}

export function processAndRenderSuporte(data) {
  currentSuporteData = processSuporteRows(data);
  renderSuporteReport(currentSuporteData);
  return currentSuporteData;
}

export function resetSuporteView() {
  currentSuporteData = null;
  document.getElementById('uploadArea').style.display = 'flex';
  document.getElementById('reportWrap').style.display = 'none';
  const input = document.getElementById('csvInput');
  if (input) input.value = '';
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

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    parseCsvFile(file, processAndRenderSuporte);
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
    parseCsvFile(file, processAndRenderSuporte);
  });
}
