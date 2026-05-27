import { describe, it, expect } from 'vitest';
import { parseTags, processSuporteRows } from '../src/lib/suporte.js';

describe('parseTags multiline (Drag TAGS column)', () => {
  it('splits tags on newlines', () => {
    expect(parseTags('TICKET FECHADO\nEMPRESAS/CONFIG\n✨ FYI')).toEqual([
      'TICKET FECHADO',
      'EMPRESAS/CONFIG',
      '✨ FYI',
    ]);
  });
});

describe('processSuporteRows with Drag-shaped row', () => {
  it('counts categories from multiline tags', () => {
    const data = processSuporteRows([
      {
        'CARD NAME': 'Test card',
        TAGS: 'BUG\n✨ Action required',
        COLOR: 'RED',
      },
    ]);
    expect(data.total).toBe(1);
    expect(data.bugs).toHaveLength(1);
    expect(data.actionRequired).toBe(1);
  });
});
