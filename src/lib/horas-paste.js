import { CAT_ORDER } from './config.js';
import { extractReportMonthFromPeriodLabel } from './report-period.js';
import { minsToTimeStr } from './utils.js';

const PT_MONTH_IN_TEXT =
  /(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?/i;

const WEEK_HEADER_RE = /^\s*Semana\s+(\d+)\b/i;

/** Converte token tipo 4h, 10min, 1h30min em minutos */
export function parsePasteDuration(token) {
  if (!token) return 0;
  const s = String(token).trim().toLowerCase().replace(/\s+/g, '');
  let m = s.match(/^(\d+)h(\d+)(?:min)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d+)h$/);
  if (m) return Number(m[1]) * 60;
  m = s.match(/^(\d+)min$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d+)m$/);
  if (m) return Number(m[1]);
  return 0;
}

export function inferHorasCategory(desc) {
  const d = String(desc || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (/\bcall\b|reuniao|meeting|sync\b|alinhamento/.test(d)) return 'CALL';
  if (/\bbug\b|erro|falha|correcao|fix\b/.test(d)) return 'BUG';
  if (/\bfeat\b|feature|refator|implement|novo fluxo|desenvolv/.test(d)) return 'NOVA FEATURE';
  if (/\brotina\b|deploy|review|document/.test(d)) return 'ROTINA';
  if (/\binvestig|ajust|suporte|duvida|caso\b|verbas|comiss/.test(d)) return 'SUPORTE';
  return 'SUPORTE';
}

export function inferHorasSystem(desc) {
  const d = String(desc || '').toUpperCase();
  if (/\bFORE\b/.test(d)) return 'FORE';
  return 'OS2';
}

function extractMonthFromLine(line, refDate = new Date()) {
  const m = line.match(PT_MONTH_IN_TEXT);
  if (!m) return null;
  const year = m[3] ? Number(m[3]) : refDate.getFullYear();
  const monthLabel = `${m[2]} de ${year}`;
  return extractReportMonthFromPeriodLabel(monthLabel, refDate);
}

function parseEntryLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const dash = trimmed.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!dash) return null;

  const mins = parsePasteDuration(dash[1]);
  const desc = dash[2].trim();
  if (!mins || !desc) return null;

  return {
    timeStr: minsToTimeStr(mins),
    mins,
    desc,
    cat: inferHorasCategory(desc),
    sis: inferHorasSystem(desc),
  };
}

/**
 * Converte bloco colado (Semana N + linhas "4h - descrição") em lançamentos.
 */
export function parseHorasPasteBlock(text, options = {}) {
  const refDate = options.refDate || new Date();
  const lines = String(text || '').split(/\r?\n/);

  let currentWeek = '1';
  let reportMonth = null;
  const entries = [];
  const skipped = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const weekMatch = trimmed.match(WEEK_HEADER_RE);
    if (weekMatch) {
      currentWeek = weekMatch[1];
      const month = extractMonthFromLine(trimmed, refDate);
      if (month) reportMonth = month;
      continue;
    }

    const entry = parseEntryLine(trimmed);
    if (!entry) {
      skipped.push(trimmed);
      continue;
    }

    if (!CAT_ORDER.includes(entry.cat)) entry.cat = 'SUPORTE';

    entries.push({
      sem: currentWeek,
      sis: entry.sis,
      cat: entry.cat,
      timeStr: entry.timeStr,
      desc: entry.desc,
    });
  }

  return { entries, reportMonth, skipped };
}
