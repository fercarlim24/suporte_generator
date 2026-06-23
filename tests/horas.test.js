import { describe, it, expect } from 'vitest';
import {
  draftEntryToRow,
  normalizeHorasDraftEntry,
  monthKeyToMesToken,
  defaultReportMonth,
} from '../src/lib/horas.js';
import { parseTime } from '../src/lib/utils.js';

describe('normalizeHorasDraftEntry', () => {
  it('fills defaults for a new row', () => {
    const row = normalizeHorasDraftEntry({});
    expect(row.sem).toBe('1');
    expect(row.sis).toBe('OS2');
    expect(row.cat).toBe('NOVA FEATURE');
    expect(row.id).toBeTruthy();
  });
});

describe('draftEntryToRow', () => {
  it('converts editor entry to report row with parsed minutes', () => {
    const entry = normalizeHorasDraftEntry({
      sem: '2',
      sis: 'FORE',
      cat: 'BUG',
      timeStr: '1:30',
      desc: 'correção de notificações',
    });
    const row = draftEntryToRow(entry, '2026-02');
    expect(row.sem).toBe('2');
    expect(row.sis).toBe('FORE');
    expect(row.cat).toBe('BUG');
    expect(row.mins).toBe(parseTime('1:30'));
    expect(row.desc).toContain('notificações');
    expect(row.mes).toMatch(/FEVEREIRO/i);
  });
});

describe('monthKeyToMesToken', () => {
  it('maps YYYY-MM to Portuguese month token', () => {
    expect(monthKeyToMesToken('2026-05')).toMatch(/MAIO/i);
  });
});

describe('defaultReportMonth', () => {
  it('returns YYYY-MM format', () => {
    expect(defaultReportMonth()).toMatch(/^\d{4}-\d{2}$/);
  });
});
