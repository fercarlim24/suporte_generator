import { describe, it, expect } from 'vitest';
import {
  extractTagsFromCard,
  mapDragCardToRow,
  filterCardsByDate,
  formatDragPeriod,
  buildTagNameMap,
  flattenCardDetail,
} from '../src/lib/drag-map.js';

describe('extractTagsFromCard', () => {
  it('reads string tags array', () => {
    expect(extractTagsFromCard({ Tags: ['BUG', 'FORE'] })).toEqual(['BUG', 'FORE']);
  });

  it('reads object tags with Name field', () => {
    expect(extractTagsFromCard({ tags: [{ Name: 'TICKET FECHADO' }] })).toEqual([
      'TICKET FECHADO',
    ]);
  });

  it('resolves tag ids using board tag map', () => {
    const map = buildTagNameMap([{ Id: 77163, Name: 'EMAILS FORE' }]);
    expect(extractTagsFromCard({ TagIds: [77163] }, map)).toEqual(['EMAILS FORE']);
  });
});

describe('mapDragCardToRow', () => {
  it('maps API card to CSV-shaped row', () => {
    const row = mapDragCardToRow({
      TaskName: 'Erro no login',
      Tags: ['BUG', 'EM ANDAMENTO'],
      ThreadOwnerEmail: 'cliente@empresa.com',
      CreatedAt: '2026-04-01T10:00:00.000Z',
    });

    expect(row['CARD NAME']).toBe('Erro no login');
    expect(row.TAGS).toContain('BUG');
    expect(row.PARTICIPANTS).toContain('cliente@empresa.com');
  });
});

describe('filterCardsByDate', () => {
  const cards = [
    { DragTaskId: 1, CreatedAt: '2026-04-05T12:00:00.000Z' },
    { DragTaskId: 2, CreatedAt: '2026-03-20T12:00:00.000Z', UpdatedAt: '2026-04-10T12:00:00.000Z' },
  ];

  it('filters by any activity date in range', () => {
    const filtered = filterCardsByDate(cards, '2026-04-01', '2026-04-30');
    expect(filtered).toHaveLength(2);
  });

  it('returns all cards when no dates provided', () => {
    expect(filterCardsByDate(cards, '', '')).toHaveLength(2);
  });
});

describe('flattenCardDetail', () => {
  it('unwraps nested Card object', () => {
    const flat = flattenCardDetail({ Card: { TaskName: 'Teste', Tags: ['BUG'] } });
    expect(flat.TaskName).toBe('Teste');
    expect(flat.Tags).toEqual(['BUG']);
  });
});

describe('formatDragPeriod', () => {
  it('formats date range', () => {
    const period = formatDragPeriod('2026-04-01', '2026-04-30');
    expect(period).toContain('April');
    expect(period).toContain('—');
  });
});
