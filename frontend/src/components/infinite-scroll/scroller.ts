/**
 * The decision half of {@link InfiniteScroll}, kept apart from the DOM so it
 * can be exercised directly. Every rule here has drawn blood at least once:
 * an end that stops asking for pages, or rows arriving without the viewport
 * being moved to keep the reader where they were.
 */

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  /** clientHeight: the visible box, with any horizontal scrollbar excluded */
  clientHeight: number;
}

export interface ScrollerState {
  /** an end that has asked for a page and is still waiting on it */
  pending: '' | 'top' | 'bottom';
  /** scrollHeight when that ask went out, to measure the answer against */
  heightAtAsk: number;
  prevScrollTop: number;
}

export interface ScrollerResult {
  state: ScrollerState;
  /** an end to request a page from */
  ask?: 'top' | 'bottom';
  /** where to put scrollTop before the browser paints */
  scrollTo?: number;
  /** whether the scroll event that scrollTo causes should be ignored */
  skipNextScroll?: boolean;
  /**
   * Rows went in above the reader. `scrollTo` is the arithmetic answer, but
   * the caller should prefer an anchor on a row it can still find: any other
   * height change in the same window, a font finishing loading or the buffer
   * being trimmed, is baked into the arithmetic and shows up as a jump.
   */
  anchored?: boolean;
}

export interface ScrollerOptions {
  offset: number;
  loading: boolean;
  onTopScrollsToBottom: boolean;
}

export const initialScrollerState = (): ScrollerState => ({
  pending: '',
  heightAtAsk: 0,
  prevScrollTop: 0,
});

const distanceToBottom = (m: ScrollMetrics) =>
  m.scrollHeight - m.clientHeight - m.scrollTop;

const ask = (
  state: ScrollerState,
  m: ScrollMetrics,
  dir: 'top' | 'bottom',
): ScrollerResult => ({
  state: { ...state, pending: dir, heightAtAsk: m.scrollHeight },
  ask: dir,
});

/**
 * Offer whichever end the reader is resting against. Whether that end has
 * anything left is the view's call, not this one's: an end that answers with
 * nothing is simply offered again, and the view declines for free. Tracking
 * exhaustion here only ever produced ends that stopped asking while there was
 * still a log above them.
 */
const fillEnds = (
  state: ScrollerState,
  m: ScrollMetrics,
  { offset, loading }: ScrollerOptions,
): ScrollerResult => {
  if (loading || state.pending || m.scrollHeight <= m.clientHeight)
    return { state };
  if (m.scrollTop <= offset) return ask(state, m, 'top');
  if (distanceToBottom(m) <= offset) return ask(state, m, 'bottom');
  return { state };
};

export const onScroll = (
  state: ScrollerState,
  m: ScrollMetrics,
  options: ScrollerOptions,
): ScrollerResult => {
  const moved: ScrollerState = { ...state, prevScrollTop: m.scrollTop };

  // a page asked for on an earlier event is still on its way. `loading` only
  // turns true once react commits, so several more events land first, and
  // dropping the ask here would lose the height its answer is measured against
  if (options.loading || state.pending) return { state: moved };

  if (
    m.scrollTop > state.prevScrollTop &&
    distanceToBottom(m) <= options.offset
  )
    return ask(moved, m, 'bottom');

  if (m.scrollTop <= options.offset && m.scrollTop <= state.prevScrollTop)
    return ask(moved, m, 'top');

  return { state: moved };
};

/**
 * Run after every render. Rows arrive on whichever commit react happens to
 * make, which is not necessarily one where `loading` changed: a cached request
 * resolves before the loading state is ever rendered.
 */
export const onCommit = (
  state: ScrollerState,
  m: ScrollMetrics,
  options: ScrollerOptions,
): ScrollerResult => {
  const { pending } = state;
  if (!pending) return fillEnds(state, m, options);

  const heightDelta = m.scrollHeight - state.heightAtAsk;
  if (heightDelta <= 0) {
    // still waiting; only once the request is done does nothing mean nothing
    if (options.loading) return { state };
    return { state: { ...state, pending: '' } };
  }

  const answered: ScrollerState = { ...state, pending: '' };
  if (pending === 'bottom') {
    // rows appended below leave the reader where they are
    const next = { ...answered, prevScrollTop: m.scrollTop };
    return distanceToBottom(m) <= options.offset
      ? ask(next, m, 'bottom')
      : { state: next };
  }

  const scrollTo = options.onTopScrollsToBottom
    ? m.scrollHeight - m.clientHeight - options.offset - 2
    : // rows were prepended: push the viewport down by their height so the
      // line the reader was on stays under the cursor
      m.scrollTop + heightDelta;

  const next: ScrollerState = { ...answered, prevScrollTop: scrollTo };
  // at either extreme the position is pinned and the browser emits no further
  // scroll events, so a reader who outran the fetch would sit there with
  // nothing asking for the next page
  const again = scrollTo <= options.offset;
  return {
    state: again
      ? { ...next, pending: 'top', heightAtAsk: m.scrollHeight }
      : next,
    scrollTo,
    skipNextScroll: true,
    anchored: !options.onTopScrollsToBottom,
    ask: again ? 'top' : undefined,
  };
};

/**
 * Run on a timer. Resting against an end produces neither a scroll event nor a
 * render, so nothing else would ever notice.
 */
export const onPoll = (
  state: ScrollerState,
  m: ScrollMetrics,
  options: ScrollerOptions,
): ScrollerResult => {
  // an end asked for a page that never came, because the handler decided there
  // was nothing to fetch. release it rather than let one refusal block the end
  const released =
    state.pending && !options.loading && m.scrollHeight <= state.heightAtAsk
      ? { ...state, pending: '' as const }
      : state;
  return fillEnds(released, m, options);
};
