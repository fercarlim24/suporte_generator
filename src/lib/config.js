export const HIST_KEY = 'ls2-history-v2';
export const HIST_KEY_LEGACY = 'ls2-history-v1';
export const HIST_MAX = 50;

export const OP_STORAGE_KEY = 'ls2-op2';
export const SHEETS_KEY = 'ls2-horas-sheets';

export const NOISE = new Set([
  'EMAILS FORE', 'FORE', 'EM ANDAMENTO', 'TICKET FECHADO',
  '✨ RESOLVED', '✨ ACTION REQUIRED', '✨ AWAITING RESPONSE', '✨ FYI',
  'BUG', 'AJUSTES', 'ATUALIZAÇÃO', 'INTERNO',
]);

export const OP_SP = [
  ['Sprint 14', '16/12'], ['Sprint 15', '06/01'], ['Sprint 16', '20/01'],
  ['Sprint 17', '03/02'], ['Sprint 18', '17/02'], ['Sprint 19', '03/03'], ['Sprint 20', '17/03'],
];

export const OP_SK = ['esc', 'rm', 'rec', 'ri', 'cu'];
export const OP_SL = ['ESCOPO', 'ROADMAP', 'RECURSOS', 'RISCO', 'CUSTO'];
export const OP_SC = [
  'linear-gradient(135deg,#15803d,#4ade80)',
  'linear-gradient(135deg,#c2410c,#fb923c)',
  'linear-gradient(135deg,#991b1b,#f87171)',
  'rgba(255,255,255,.15)',
];
export const OP_FIELDS = [
  'produto', 'stakeholder', 'data', 'entregas', 'resumo', 'equipe',
  'indicadores', 'proximos', 'rA', 'rM', 'rB',
];

export const CAT_ORDER = ['NOVA FEATURE', 'SUPORTE', 'BUG', 'CALL', 'ROTINA'];
export const CAT_COLORS = {
  'NOVA FEATURE': { bar: '#4ade80', cls: 'cat-nova' },
  SUPORTE: { bar: '#fb923c', cls: 'cat-suporte' },
  BUG: { bar: '#f87171', cls: 'cat-bug' },
  CALL: { bar: '#60a5fa', cls: 'cat-call' },
  ROTINA: { bar: '#a78bfa', cls: 'cat-rotina' },
};

export const REPORT_LABELS = {
  suporte: 'Suporte',
  horas: 'Horas Dev',
  op: 'One Pager',
};

export const REPORT_BADGE = {
  suporte: 'hb-suporte',
  horas: 'hb-horas',
  op: 'hb-op',
};
