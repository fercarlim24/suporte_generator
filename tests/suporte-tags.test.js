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

  it('extracts unique external contacts and insights by ambiente/tipo', () => {
    const data = processSuporteRows([
      {
        'CARD NAME': 'LandscapeOS2 | erro no login',
        TAGS: 'BUG\nEM ANDAMENTO',
        PARTICIPANTS: 'helpdesk@landscape.to, cliente1@empresa.com',
      },
      {
        'CARD NAME': 'FORE | pagamento pix divergente',
        TAGS: 'FORE\n✨ Action required',
        PARTICIPANTS: 'suporte@landscape.to, cliente2@empresa.com, cliente1@empresa.com',
      },
    ]);

    expect(data.uniqueContacts).toBe(2);
    expect(data.envTypeMatrix.length).toBeGreaterThan(0);
    const envs = data.envTypeMatrix.map((e) => e.env);
    expect(envs).toContain('OS2');
    expect(envs).toContain('FORE');
    expect(data.categoryInsights.length).toBeGreaterThan(0);
  });
});
