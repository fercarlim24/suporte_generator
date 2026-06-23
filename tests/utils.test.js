import { describe, it, expect } from 'vitest';
import { escapeHtml, normalizeCsvRow, normalizeCsvKey, parseTime, fmtTime } from '../src/lib/utils.js';
import { parseTags, processSuporteRows } from '../src/lib/suporte.js';

describe('escapeHtml', () => {
  it('escapes special characters', () => {
    expect(escapeHtml('<script>&"')).toBe('&lt;script&gt;&amp;&quot;');
  });
});

describe('normalizeCsvRow', () => {
  it('normalizes CARD NAME key', () => {
    const row = normalizeCsvRow({ CARD_NAME: 'Test', TAGS: 'BUG' });
    expect(row['CARD NAME']).toBe('Test');
  });

  it('strips BOM from header key', () => {
    const row = normalizeCsvRow({ '\ufeffCARD NAME': 'Ticket A', TAGS: 'BUG' });
    expect(row['CARD NAME']).toBe('Ticket A');
  });
});

describe('getCardName via processSuporteRows', () => {
  it('reads cards when header has BOM', () => {
    const data = processSuporteRows([
      { '\ufeffCARD NAME': 'Erro login', TAGS: 'BUG,EM ANDAMENTO' },
    ]);
    expect(data.total).toBe(1);
    expect(data.bugs).toHaveLength(1);
  });
});

describe('parseTime', () => {
  it('parses H:MM:SS', () => {
    expect(parseTime('1:30:00')).toBe(90);
  });
  it('parses H:MM', () => {
    expect(parseTime('2:15')).toBe(135);
  });
});

describe('fmtTime', () => {
  it('formats minutes', () => {
    expect(fmtTime(90)).toBe('1:30');
  });
});

describe('processSuporteRows', () => {
  it('counts chamados excluding notification emails', () => {
    const data = processSuporteRows([
      { 'CARD NAME': 'A', TAGS: 'EMAILS FORE' },
      { 'CARD NAME': 'B', TAGS: 'BUG,✨ Action required' },
    ]);
    expect(data.total).toBe(2);
    expect(data.notifications).toBe(1);
    expect(data.realTickets).toBe(1);
    expect(data.bugs).toHaveLength(1);
    expect(data.bugs[0].name).toBe('B');
  });
});

describe('parseTags', () => {
  it('uppercases and trims', () => {
    expect(parseTags('bug, Ticket fechado')).toEqual(['BUG', 'TICKET FECHADO']);
  });
});
