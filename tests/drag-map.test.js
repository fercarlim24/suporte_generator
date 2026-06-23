import { describe, it, expect } from 'vitest';
import {
  extractTagsFromCard,
  mapDragCardToRow,
  filterCardsByDate,
  formatDragPeriod,
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
    { DragTaskId: 2, CreatedAt: '2026-03-20T12:00:00.000Z' },
  ];

  it('filters by start and end date', () => {
    const filtered = filterCardsByDate(cards, '2026-04-01', '2026-04-30');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].DragTaskId).toBe(1);
  });
});

describe('formatDragPeriod', () => {
  it('formats date range', () => {
    const period = formatDragPeriod('2026-04-01', '2026-04-30');
    expect(period).toContain('April');
    expect(period).toContain('—');
  });
});
