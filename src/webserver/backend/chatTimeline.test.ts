import { describe, expect, it } from 'vitest';
import {
  addContext,
  addMatches,
  emptyTimeline,
  timelineItems,
  type ChatTimeline,
} from './chatTimeline';

type Entry = { _id: string };
const e = (id: number): Entry => ({ _id: String(id) });

/** Rendered shape, as "id" for an entry, "*id" for a match, "<" / ">" a gap. */
const render = (timeline: ChatTimeline<Entry>, newestFirst = false) =>
  timelineItems(timeline, newestFirst)
    .map(item =>
      item.kind === 'gap'
        ? `${item.direction === 'before' ? '<' : '>'}${item.id}`
        : `${item.isMatch ? '*' : ''}${item.id}`,
    )
    .join(' ');

describe('chat timeline', () => {
  it('surrounds a lone match with expanders', () => {
    const t = addMatches(emptyTimeline<Entry>(), [
      { match: e(10), before: [e(9)], after: [e(11)] },
    ]);
    expect(render(t)).toBe('<9 9 *10 11 >11');
  });

  it('retires the expander at the ends of the log', () => {
    const t = addMatches(emptyTimeline<Entry>(), [
      { match: e(1), before: [], after: [] },
    ]);
    expect(render(t)).toBe('*1');
  });

  it('shows one gap between two nearby matches, not two', () => {
    const t = addMatches(emptyTimeline<Entry>(), [
      { match: e(10), before: [e(9)], after: [e(11)] },
      { match: e(20), before: [e(19)], after: [e(21)] },
    ]);
    expect(render(t)).toBe('<9 9 *10 11 >11 19 *20 21 >21');
  });

  it('never lists an entry twice when matches share a neighbour', () => {
    const t = addMatches(emptyTimeline<Entry>(), [
      { match: e(10), before: [e(9)], after: [e(11)] },
      { match: e(11), before: [e(10)], after: [e(12)] },
    ]);
    expect(render(t)).toBe('<9 9 *10 *11 12 >12');
  });

  it('closes the gap once expansion joins two matches', () => {
    let t = addMatches(emptyTimeline<Entry>(), [
      { match: e(10), before: [e(9)], after: [e(11)] },
      { match: e(15), before: [e(14)], after: [e(16)] },
    ]);
    expect(render(t)).toBe('<9 9 *10 11 >11 14 *15 16 >16');

    // revealing 12 and 13 joins 11 to 14, so the gap between them disappears
    t = addContext(t, '11', 'after', [e(12), e(13)], 5);
    expect(render(t)).toBe('<9 9 *10 11 12 13 14 *15 16 >16');
  });

  it('keeps the expander when a gap is only partly revealed', () => {
    let t = addMatches(emptyTimeline<Entry>(), [
      { match: e(10), before: [e(9)], after: [e(11)] },
      { match: e(30), before: [e(29)], after: [e(31)] },
    ]);
    t = addContext(t, '11', 'after', [e(12), e(13)], 2);
    expect(render(t)).toBe('<9 9 *10 11 12 13 >13 29 *30 31 >31');
  });

  it('expands backwards from the top of the list', () => {
    let t = addMatches(emptyTimeline<Entry>(), [
      { match: e(10), before: [e(9)], after: [e(11)] },
    ]);
    t = addContext(t, '9', 'before', [e(7), e(8)], 2);
    expect(render(t)).toBe('<7 7 8 9 *10 11 >11');
  });

  it('stops asking once expansion runs out of log', () => {
    let t = addMatches(emptyTimeline<Entry>(), [
      { match: e(10), before: [e(9)], after: [e(11)] },
    ]);
    t = addContext(t, '9', 'before', [e(8)], 5);
    expect(render(t)).toBe('8 9 *10 11 >11');
  });

  it('reverses without moving a gap out from between its entries', () => {
    const t = addMatches(emptyTimeline<Entry>(), [
      { match: e(10), before: [e(9)], after: [e(11)] },
      { match: e(20), before: [e(19)], after: [e(21)] },
    ]);
    expect(render(t, true)).toBe('>21 21 *20 19 >11 11 *10 9 <9');
  });
});
