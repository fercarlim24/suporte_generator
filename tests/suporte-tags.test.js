import { describe, it, expect } from 'vitest';
import {
  parseTags,
  processSuporteRows,
  isNotificationEmailCard,
  isClosedTicket,
} from '../src/lib/suporte.js';

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
    expect(data.suggestedAdjustments.length).toBeGreaterThan(0);
  });

  it('excludes all notification emails from chamados totals', () => {
    const data = processSuporteRows([
      { 'CARD NAME': 'FORE auto', TAGS: 'EMAILS FORE' },
      { 'CARD NAME': 'Alerta sistema', TAGS: 'NOTIFICAÇÃO' },
      { 'CARD NAME': 'Chamado real', TAGS: 'ACESSO,EM ANDAMENTO' },
    ]);
    expect(data.total).toBe(3);
    expect(data.notifications).toBe(2);
    expect(data.realTickets).toBe(1);
  });

  it('counts closure only with TICKET FECHADO tag', () => {
    const data = processSuporteRows([
      { 'CARD NAME': 'Resolvido drag', TAGS: '✨ Resolved' },
      { 'CARD NAME': 'Fechado suporte', TAGS: 'ACESSO,TICKET FECHADO' },
      { 'CARD NAME': 'Em aberto', TAGS: 'BUG,✨ Action required' },
    ]);
    expect(data.realTickets).toBe(3);
    expect(data.closed).toBe(1);
    expect(data.openTickets).toBe(2);
  });

  it('does not count notification contacts in unique users', () => {
    const data = processSuporteRows([
      {
        'CARD NAME': 'FORE notification',
        TAGS: 'EMAILS FORE',
        PARTICIPANTS: 'cliente@empresa.com',
      },
      {
        'CARD NAME': 'Dúvida real',
        TAGS: 'ACESSO,TICKET FECHADO',
        PARTICIPANTS: 'cliente@empresa.com',
      },
    ]);
    expect(data.notifications).toBe(1);
    expect(data.realTickets).toBe(1);
    expect(data.uniqueContacts).toBe(1);
  });
});

describe('isNotificationEmailCard', () => {
  it('detects EMAILS FORE and generic notification tags', () => {
    expect(isNotificationEmailCard({ tags: parseTags('EMAILS FORE') })).toBe(true);
    expect(isNotificationEmailCard({ tags: parseTags('NOTIFICAÇÃO') })).toBe(true);
    expect(isNotificationEmailCard({ tags: parseTags('FORE,EM ANDAMENTO') })).toBe(false);
  });
});

describe('isClosedTicket', () => {
  it('requires TICKET FECHADO', () => {
    expect(isClosedTicket(parseTags('TICKET FECHADO,ACESSO'))).toBe(true);
    expect(isClosedTicket(parseTags('✨ Resolved'))).toBe(false);
  });
});
