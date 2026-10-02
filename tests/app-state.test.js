import { describe, expect, it } from 'vitest';
import { hrefFor, parseHash, periodChoices, shiftMonth } from '../src/lib/app-state.js';

describe('parseHash', () => {
  it('opens product selection when the hash has no product', () => {
    expect(parseHash('')).toEqual({ product: null, screen: 'select' });
    expect(parseHash('#/select')).toEqual({ product: null, screen: 'select' });
  });

  it('maps workspace routes onto screen and pulse tab', () => {
    expect(parseHash('#/OS2/inicio')).toMatchObject({ product: 'OS2', screen: 'inicio' });
    expect(parseHash('#/FORE/onepager')).toMatchObject({ product: 'FORE', screen: 'op' });
    expect(parseHash('#/OS2/historico')).toMatchObject({ product: 'OS2', screen: 'hist' });
    expect(parseHash('#/FORE/pulse/uso')).toEqual({ product: 'FORE', screen: 'pulse', pulseTab: 'uso' });
  });
});

describe('hrefFor', () => {
  it('round-trips the hash for a selected product', () => {
    const state = { product: 'OS2', period: '2026-09', screen: 'pulse', pulseTab: 'contas' };
    expect(parseHash(hrefFor(state))).toMatchObject({ product: 'OS2', screen: 'pulse', pulseTab: 'contas' });
    expect(hrefFor({ product: null, screen: 'inicio' })).toBe('#/select');
  });
});

describe('periodChoices', () => {
  it('returns three months ending at the anchor month', () => {
    expect(periodChoices('2026-10', new Date(2026, 9, 2))).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
