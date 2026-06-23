import { describe, it, expect } from 'vitest';
import { parseTagReportCsv, normalizeTagReportPayload } from '../src/lib/drag-reports.js';

describe('parseTagReportCsv', () => {
  it('parses CSV with CARD NAME header', () => {
    const csv = `Board,SUPORTE LS2
CARD NAME,TAGS,COLOR
Ticket A,BUG;EM ANDAMENTO,RED
Ticket B,FORE,ORANGE`;

    const rows = parseTagReportCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]['CARD NAME']).toBe('Ticket A');
    expect(rows[0].TAGS).toContain('BUG');
  });
});

describe('normalizeTagReportPayload', () => {
  it('normalizes json card list', () => {
    const out = normalizeTagReportPayload({
      data: [{ TaskName: 'Erro login', Tags: ['BUG'] }],
    });
    expect(out.format).toBe('cards');
    expect(out.rows[0]['CARD NAME']).toBe('Erro login');
  });

  it('normalizes csv string', () => {
    const out = normalizeTagReportPayload('CARD NAME,TAGS\nTeste,BUG');
    expect(out.format).toBe('csv');
    expect(out.rows[0]['CARD NAME']).toBe('Teste');
  });
});
