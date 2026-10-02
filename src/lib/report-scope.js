import { mapOnePager } from './bi/facts.js';
import { getEntryReportMonth } from './report-period.js';

export function entryInScope(entry, product, period) {
  if (!entry) return false;
  if (period && getEntryReportMonth(entry) !== period) return false;
  if (!product) return true;
  if (entry.legacy) return product === 'OS2';
  if (entry.type === 'suporte') {
    if (product === 'OS2') return true;
    return Number(entry.payload?.data?.foreTickets || 0) > 0;
  }
  if (entry.type === 'horas') {
    return (entry.payload?.rows || []).some((row) => String(row.sis || '').toUpperCase() === product);
  }
  if (entry.type === 'op') return mapOnePager(entry)?.product_code === product;
  return false;
}
