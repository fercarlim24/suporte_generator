import { describe, it, expect } from 'vitest';
import {
  parseDateToReportMonth,
  extractReportMonthFromDragMeta,
  extractReportMonthFromPeriodLabel,
  getEntryReportMonth,
  reportMonthLabel,
} from '../src/lib/report-period.js';

describe('parseDateToReportMonth', () => {
  it('parses Drag English date', () => {
    expect(parseDateToReportMonth('01 April 2026')).toBe('2026-04');
    expect(parseDateToReportMonth('01 May 2026')).toBe('2026-05');
  });

  it('parses ISO and BR dates', () => {
    expect(parseDateToReportMonth('2026-05-15')).toBe('2026-05');
    expect(parseDateToReportMonth('15/05/2026')).toBe('2026-05');
  });
});

describe('extractReportMonthFromDragMeta', () => {
  it('uses start date from export metadata', () => {
    expect(
      extractReportMonthFromDragMeta({
        board: 'SUPORTE LS2',
        startDate: '01 May 2026',
        endDate: '31 May 2026',
        period: '01 May 2026 — 31 May 2026',
      }),
    ).toBe('2026-05');
  });
});

describe('extractReportMonthFromPeriodLabel', () => {
  it('parses Portuguese month labels', () => {
    expect(extractReportMonthFromPeriodLabel('maio de 2026')).toBe('2026-05');
    expect(extractReportMonthFromPeriodLabel('MAIO', new Date('2026-06-10'))).toBe('2026-05');
    expect(extractReportMonthFromPeriodLabel('FEVEREIRO', new Date('2026-03-01'))).toBe('2026-02');
  });
});

describe('getEntryReportMonth', () => {
  it('prefers explicit reportMonth over savedAt', () => {
    expect(
      getEntryReportMonth({
        reportMonth: '2026-05',
        savedAt: '2026-06-20T10:00:00.000Z',
      }),
    ).toBe('2026-05');
  });

  it('derives month from suporte dragMeta when missing on entry', () => {
    expect(
      getEntryReportMonth({
        type: 'suporte',
        savedAt: '2026-06-20T10:00:00.000Z',
        payload: {
          data: { dragMeta: { startDate: '01 May 2026', endDate: '31 May 2026' } },
        },
      }),
    ).toBe('2026-05');
  });

  it('falls back to savedAt month only when export month is unknown', () => {
    expect(
      getEntryReportMonth({
        savedAt: '2026-06-20T10:00:00.000Z',
      }),
    ).toBe('2026-06');
  });
});

describe('reportMonthLabel', () => {
  it('formats YYYY-MM for display', () => {
    expect(reportMonthLabel('2026-05')).toMatch(/maio/i);
    expect(reportMonthLabel('2026-05')).toMatch(/2026/);
  });
});
