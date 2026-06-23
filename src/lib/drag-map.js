export function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeBoard(board) {
  return {
    id: board.Id ?? board.id ?? board.BoardId ?? board.boardId,
    name: board.Name ?? board.name ?? board.BoardName ?? board.boardName ?? 'Board',
    owner: board.Owner ?? board.owner ?? null,
  };
}

export function normalizeColumn(column) {
  return {
    id: column.ColumnId ?? column.columnId ?? column.Id ?? column.id,
    name: column.Name ?? column.name ?? column.ColumnId ?? 'Coluna',
  };
}

export function extractTagsFromCard(card) {
  if (!card || typeof card !== 'object') return [];

  const candidates = [
    card.Tags,
    card.tags,
    card.TaskTags,
    card.taskTags,
    card.Labels,
    card.labels,
    card.TagList,
    card.tagList,
  ];

  for (const value of candidates) {
    const tags = asArray(value)
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          return String(item.Name ?? item.name ?? item.Tag ?? item.tag ?? item.Label ?? '').trim();
        }
        return '';
      })
      .filter(Boolean);
    if (tags.length) return tags;
  }

  return [];
}

export function cardNeedsTagEnrichment(card) {
  return extractTagsFromCard(card).length === 0;
}

export function mapDragCardToRow(card) {
  const tags = extractTagsFromCard(card);
  const participants = [
    card.ThreadOwnerEmail,
    card.Assignees,
    card.Participants,
    card.participants,
    card.CustomFields,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    'CARD NAME': card.TaskName ?? card.taskName ?? card.Name ?? card.name ?? '',
    TAGS: tags.join('\n'),
    COLOR: card.Color ?? card.color ?? card.StatusColor ?? '',
    PARTICIPANTS: participants,
    EMAIL: card.ThreadOwnerEmail ?? card.email ?? '',
    CREATED_AT: card.CreatedAt ?? card.createdAt ?? '',
  };
}

function parseDateInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function filterCardsByDate(cards, startDate, endDate) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  if (!start && !end) return cards;

  return cards.filter((card) => {
    const created = parseDateInput(card.CreatedAt ?? card.createdAt);
    if (!created) return true;
    if (start && created < start) return false;
    if (end) {
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      if (created > endOfDay) return false;
    }
    return true;
  });
}

export function formatDragPeriod(startDate, endDate) {
  const fmt = (value) => {
    const d = parseDateInput(value);
    if (!d) return String(value || '');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  if (startDate && endDate) return `${fmt(startDate)} — ${fmt(endDate)}`;
  if (startDate) return fmt(startDate);
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
