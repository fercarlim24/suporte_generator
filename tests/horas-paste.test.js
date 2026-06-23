import { describe, it, expect } from 'vitest';
import {
  parsePasteDuration,
  inferHorasCategory,
  parseHorasPasteBlock,
} from '../src/lib/horas-paste.js';

const SAMPLE = `Semana 1 (01 de junho até 05 de junho) - Total de horas: 21h25min

4h - Ajuste de verbas
1h - Investigação de integração com moeda
10min - Call semanal 01/06
15min - Call de dúvidas sobre as regras de comissões
13h - Feat e ajustes sobre 6 em comissões
2h - Ajustando caso de fechar projeto
1h - call de alinhamentos entre o time`;

describe('parsePasteDuration', () => {
  it('parses h, min and combined formats', () => {
    expect(parsePasteDuration('4h')).toBe(240);
    expect(parsePasteDuration('10min')).toBe(10);
    expect(parsePasteDuration('21h25min')).toBe(1285);
    expect(parsePasteDuration('1h30min')).toBe(90);
  });
});

describe('inferHorasCategory', () => {
  it('classifies by description keywords', () => {
    expect(inferHorasCategory('Call semanal 01/06')).toBe('CALL');
    expect(inferHorasCategory('Feat e ajustes sobre comissões')).toBe('NOVA FEATURE');
    expect(inferHorasCategory('Investigação de integração')).toBe('SUPORTE');
    expect(inferHorasCategory('Ajuste de verbas')).toBe('SUPORTE');
  });
});

describe('parseHorasPasteBlock', () => {
  it('parses user weekly paste format into entries', () => {
    const { entries, reportMonth, skipped } = parseHorasPasteBlock(SAMPLE, {
      refDate: new Date('2026-06-15'),
    });

    expect(reportMonth).toBe('2026-06');
    expect(entries).toHaveLength(7);
    expect(skipped).toHaveLength(0);
    expect(entries.every((e) => e.sem === '1')).toBe(true);

    const totalMins = entries.reduce((a, e) => {
      const [h, m] = e.timeStr.split(':').map(Number);
      return a + h * 60 + m;
    }, 0);
    expect(totalMins).toBe(1285);

    expect(entries.find((e) => e.desc.includes('Call semanal'))?.cat).toBe('CALL');
    expect(entries.find((e) => e.desc.includes('Feat e ajustes'))?.cat).toBe('NOVA FEATURE');
  });

  it('handles multiple weeks in one paste', () => {
    const text = `Semana 1 (01 de junho até 05 de junho) - Total: 2h
1h - Call kickoff
1h - Ajuste geral

Semana 2 (08 de junho até 12 de junho) - Total: 3h
2h - Feat nova tela
1h - Call review`;

    const { entries } = parseHorasPasteBlock(text, { refDate: new Date('2026-06-15') });
    expect(entries.filter((e) => e.sem === '1')).toHaveLength(2);
    expect(entries.filter((e) => e.sem === '2')).toHaveLength(2);
  });
});
