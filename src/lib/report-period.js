const EN_MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const PT_MONTHS = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeMonthToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Converte data textual do Drag para chave YYYY-MM do mês do export */
export function parseDateToReportMonth(value) {
  if (!value) return null;
  const s = String(value).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${pad2(br[2])}`;

  const en = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (en) {
    const month = EN_MONTHS[en[2].toLowerCase()];
    if (month) return `${en[3]}-${pad2(month)}`;
  }

  return null;
}

export function extractReportMonthFromDragMeta(dragMeta = {}) {
  if (!dragMeta || typeof dragMeta !== 'object') return null;

  const fromStart = parseDateToReportMonth(dragMeta.startDate);
  if (fromStart) return fromStart;

  if (dragMeta.period) {
    const startPart = String(dragMeta.period).split(/[—–-]/)[0].trim();
    const fromPeriod = parseDateToReportMonth(startPart);
    if (fromPeriod) return fromPeriod;
  }

  return null;
}

export function extractReportMonthFromPeriodLabel(period, refDate = new Date()) {
  if (!period) return null;

  const fromDate = parseDateToReportMonth(period);
  if (fromDate) return fromDate;

  const s = normalizeMonthToken(period);

  const monthOnly = s.match(
    /^(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)$/,
  );
  if (monthOnly) {
    const month = PT_MONTHS[monthOnly[1]];
    if (month) return `${refDate.getFullYear()}-${pad2(month)}`;
  }

  const pt = s.match(
    /(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s+)?(\d{4})/,
  );
  if (pt) {
    const month = PT_MONTHS[pt[1]];
    if (month) return `${pt[2]}-${pad2(month)}`;
  }

  return null;
}

export function reportMonthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function monthKeyFromIso(dateIso) {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Mês de referência de um relatório salvo (export > metadados > data do upload) */
export function getEntryReportMonth(entry) {
  if (!entry) return null;
  if (entry.reportMonth) return entry.reportMonth;

  const meta = entry.payload?.meta || {};
  if (meta.reportMonth) return meta.reportMonth;

  if (entry.type === 'suporte') {
    const fromDrag = extractReportMonthFromDragMeta(entry.payload?.data?.dragMeta || {});
    if (fromDrag) return fromDrag;
  }

  const fromPeriod = extractReportMonthFromPeriodLabel(meta.period || entry.period);
  if (fromPeriod) return fromPeriod;

  return monthKeyFromIso(entry.savedAt);
}
