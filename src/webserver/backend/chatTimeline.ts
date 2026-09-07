/**
 * Assembles search results and the context revealed around them into one
 * timeline, the way a diff viewer stitches hunks together: entries appear once
 * no matter how many matches they sit next to, and the collapsed run between
 * two of them closes on its own once enough context is revealed to join them.
 *
 * Lives under the backend so it can be tested there, but it is UI state and is
 * imported by the web UI.
 */

/** The parts of a chat log entry the timeline needs; the rest rides along. */
export interface TimelineEntry {
  _id: string;
}

export interface ChatTimeline<T extends TimelineEntry> {
  entries: Map<string, T>;
  /** entries that matched the search, rather than context around one */
  matches: Set<string>;
  /** entries whose immediate predecessor is loaded, or that start the log */
  closedBefore: Set<string>;
  /** entries whose immediate successor is loaded, or that end the log */
  closedAfter: Set<string>;
}

export type TimelineItem<T> =
  | { kind: 'entry'; id: string; entry: T; isMatch: boolean }
  /** a collapsed run; expanding it asks for entries in `direction` of `id` */
  | { kind: 'gap'; id: string; direction: 'before' | 'after' };

export const emptyTimeline = <T extends TimelineEntry>(): ChatTimeline<T> => ({
  entries: new Map(),
  matches: new Set(),
  closedBefore: new Set(),
  closedAfter: new Set(),
});

const clone = <T extends TimelineEntry>(
  timeline: ChatTimeline<T>,
): ChatTimeline<T> => ({
  entries: new Map(timeline.entries),
  matches: new Set(timeline.matches),
  closedBefore: new Set(timeline.closedBefore),
  closedAfter: new Set(timeline.closedAfter),
});

/** Record that `left` and `right` are neighbours with nothing between them. */
const join = <T extends TimelineEntry>(
  timeline: ChatTimeline<T>,
  left: string,
  right: string,
) => {
  timeline.closedAfter.add(left);
  timeline.closedBefore.add(right);
};

/**
 * Merge a page of search results, each with the neighbour the search returned
 * on either side. A match with no neighbour in a direction sits at that end of
 * the log, so nothing can ever be revealed there.
 */
export const addMatches = <T extends TimelineEntry>(
  timeline: ChatTimeline<T>,
  matches: { match: T; before: T[]; after: T[] }[],
): ChatTimeline<T> => {
  const next = clone(timeline);

  for (const { match, before, after } of matches) {
    next.entries.set(match._id, match);
    next.matches.add(match._id);

    const previous = before[before.length - 1];
    if (previous) {
      next.entries.set(previous._id, previous);
      join(next, previous._id, match._id);
    } else {
      next.closedBefore.add(match._id);
    }

    const following = after[0];
    if (following) {
      next.entries.set(following._id, following);
      join(next, match._id, following._id);
    } else {
      next.closedAfter.add(match._id);
    }
  }

  return next;
};

/**
 * Merge entries revealed by expanding a gap. `requested` is the number asked
 * for: coming back with fewer means that end of the log was reached, which
 * retires the expander rather than leaving one that can never reveal anything.
 */
export const addContext = <T extends TimelineEntry>(
  timeline: ChatTimeline<T>,
  anchorId: string,
  direction: 'before' | 'after',
  rows: T[],
  requested: number,
): ChatTimeline<T> => {
  const next = clone(timeline);
  for (const row of rows) next.entries.set(row._id, row);

  // rows always run oldest first, so the anchor caps whichever end they extend
  const chain =
    direction === 'after'
      ? [anchorId, ...rows.map(r => r._id)]
      : [...rows.map(r => r._id), anchorId];

  for (let i = 0; i < chain.length - 1; i++) join(next, chain[i], chain[i + 1]);

  if (rows.length < requested) {
    if (direction === 'after') next.closedAfter.add(chain[chain.length - 1]);
    else next.closedBefore.add(chain[0]);
  }

  return next;
};

/**
 * Flatten to the list to render. Entries are ordered by id, which is insertion
 * order, so entries logged in the same millisecond keep the order they were
 * written in rather than an arbitrary one.
 */
export const timelineItems = <T extends TimelineEntry>(
  timeline: ChatTimeline<T>,
  newestFirst: boolean,
): TimelineItem<T>[] => {
  const ids = [...timeline.entries.keys()].sort(
    (a, b) => Number(a) - Number(b),
  );
  const items: TimelineItem<T>[] = [];

  if (ids.length > 0 && !timeline.closedBefore.has(ids[0]))
    items.push({ kind: 'gap', id: ids[0], direction: 'before' });

  for (const id of ids) {
    items.push({
      kind: 'entry',
      id,
      entry: timeline.entries.get(id)!,
      isMatch: timeline.matches.has(id),
    });
    if (!timeline.closedAfter.has(id))
      items.push({ kind: 'gap', id, direction: 'after' });
  }

  // reversing keeps every gap between the same two entries it separated
  return newestFirst ? items.reverse() : items;
};
