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

export function buildTagNameMap(tags) {
  const map = new Map();
  asArray(tags).forEach((tag) => {
    const id = tag?.Id ?? tag?.id;
    const name = tag?.Name ?? tag?.name;
    if (id != null && name) map.set(String(id), String(name).trim());
  });
  return map;
}

function resolveTagValue(item, tagNameMap) {
  if (item == null) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'number') return tagNameMap?.get(String(item)) || '';
  if (typeof item === 'object') {
    const direct = item.Name ?? item.name ?? item.Tag ?? item.tag ?? item.Label ?? item.label;
    if (direct) return String(direct).trim();
    const id = item.Id ?? item.id ?? item.TagId ?? item.tagId;
    if (id != null && tagNameMap?.has(String(id))) return tagNameMap.get(String(id));
  }
  return '';
}

function collectTagCandidates(card) {
  return [
    card.Tags,
    card.tags,
    card.TaskTags,
    card.taskTags,
    card.Labels,
    card.labels,
    card.TagList,
    card.tagList,
    card.TagIds,
    card.tagIds,
    card.CardTags,
    card.cardTags,
    card.TagNames,
    card.tagNames,
  ];
}

export function extractTagsFromCard(card, tagNameMap = null) {
  if (!card || typeof card !== 'object') return [];

  for (const value of collectTagCandidates(card)) {
    const tags = asArray(value).map((item) => resolveTagValue(item, tagNameMap)).filter(Boolean);
    if (tags.length) return [...new Set(tags)];
  }

  const raw = card.TagString ?? card.tagString ?? card.TagName ?? card.tagName;
  if (typeof raw === 'string' && raw.trim()) {
    return [...new Set(raw.split(/[,;\n\r]+/).map((t) => t.trim()).filter(Boolean))];
  }

  return [];
}

export function cardNeedsTagEnrichment(card, tagNameMap = null) {
  return extractTagsFromCard(card, tagNameMap).length === 0;
}

export function flattenCardDetail(detail) {
  if (!detail || typeof detail !== 'object') return detail;
  if (detail.TaskName || detail.DragTaskId || detail.taskName) return detail;
  if (detail.Card && typeof detail.Card === 'object') return { ...detail, ...detail.Card };
  if (detail.card && typeof detail.card === 'object') return { ...detail, ...detail.card };
  return detail;
}

function parseDateInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getCardActivityDates(card) {
  const fields = [
    card.CreatedAt,
    card.createdAt,
    card.UpdatedAt,
    card.updatedAt,
    card.ModifiedAt,
    card.modifiedAt,
    card.LastUpdated,
    card.lastUpdated,
    card.ClosedAt,
    card.closedAt,
    card.ResolvedAt,
    card.resolvedAt,
    card.LastActivityAt,
    card.lastActivityAt,
  ];

  return fields.map(parseDateInput).filter(Boolean);
}

export function filterCardsByDate(cards, startDate, endDate) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  if (!start && !end) return cards;

  const endOfDay = end ? new Date(end) : null;
  if (endOfDay) endOfDay.setHours(23, 59, 59, 999);

  return cards.filter((card) => {
    const dates = getCardActivityDates(card);
    if (!dates.length) return true;
    return dates.some((date) => {
      if (start && date < start) return false;
      if (endOfDay && date > endOfDay) return false;
      return true;
    });
  });
}

export function mapDragCardToRow(card, tagNameMap = null) {
  const tags = extractTagsFromCard(card, tagNameMap);
  const participants = [
    card.ThreadOwnerEmail,
    card.Assignees,
    card.Participants,
    card.participants,
    card.FromEmail,
    card.fromEmail,
    card.CustomFields,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    'CARD NAME': card.TaskName ?? card.taskName ?? card.Name ?? card.name ?? '',
    TAGS: tags.join('\n'),
    COLOR: card.Color ?? card.color ?? card.StatusColor ?? card.ColumnColor ?? '',
    PARTICIPANTS: participants,
    EMAIL: card.ThreadOwnerEmail ?? card.email ?? card.FromEmail ?? '',
    CREATED_AT: card.CreatedAt ?? card.createdAt ?? '',
  };
}

export function countCardsWithTags(cards, tagNameMap = null) {
  return cards.filter((card) => extractTagsFromCard(card, tagNameMap).length > 0).length;
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

export function pickDefaultSupportBoard(boards) {
  if (!boards?.length) return null;
  const savedId = null;
  const bySupportName = boards.find((b) => /suporte|support|ls2/i.test(b.name || ''));
  if (bySupportName) return bySupportName;
  return boards[0];
}
