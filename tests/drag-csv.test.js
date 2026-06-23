import { describe, it, expect } from 'vitest';
import {
  parseDragDailyCardsMatrix,
  findDragHeaderRowIndex,
  extractDragExportMeta,
} from '../src/lib/drag-csv.js';

describe('parseDragDailyCardsMatrix', () => {
  const dragMatrix = [
    ['Daily_Cards_123'],
    ['Board', 'SUPORTE LS2'],
    ['User', 'All users'],
    ['Start date', '01 April 2026'],
    ['End date', '30 April 2026'],
    ['Result', 'CARD NAME', 'EMAIL SUBJECT', 'ASSIGNEES', 'NOTE', 'DUE DATE', 'PERMALINK', 'COLOR', 'TAGS'],
    ['', 'Dúvida contato', 'Subject', '', '', '', 'http://x', 'GREEN', 'TICKET FECHADO\nEMPRESAS/CONFIG'],
    ['', 'Bug login', 'Subj', '', '', '', '', 'RED', 'BUG\n✨ Action required'],
    ['', 'FORE email', '', '', '', '', '', '', 'EMAILS FORE'],
  ];

  it('finds header at row with CARD NAME', () => {
    expect(findDragHeaderRowIndex(dragMatrix)).toBe(5);
  });

  it('extracts period from metadata', () => {
    const meta = extractDragExportMeta(dragMatrix, 5);
    expect(meta.board).toBe('SUPORTE LS2');
    expect(meta.period).toContain('01 April 2026');
    expect(meta.period).toContain('30 April 2026');
  });

  it('parses data rows after header', () => {
    const { rows, meta } = parseDragDailyCardsMatrix(dragMatrix);
    expect(rows).toHaveLength(3);
    expect(meta.board).toBe('SUPORTE LS2');
    expect(rows[0]['CARD NAME']).toBe('Dúvida contato');
    expect(rows[0].TAGS).toContain('TICKET FECHADO');
    expect(rows[0].TAGS).toContain('EMPRESAS/CONFIG');
  });

  it('finds header row with TAGS column', () => {
    const matrix = [
      ['TAGS', 'CARD NAME', 'COLOR'],
      ['BUG', 'Erro login', 'RED'],
    ];
    expect(findDragHeaderRowIndex(matrix)).toBe(0);
  });
});
