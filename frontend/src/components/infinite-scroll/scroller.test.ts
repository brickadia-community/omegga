import { describe, expect, it } from 'vitest';
import {
  initialScrollerState,
  onCommit,
  onPoll,
  onScroll,
  type ScrollMetrics,
  type ScrollerState,
} from './scroller';

const OFFSET = 500;
const VIEW = 800;

/**
 * A log the reader scrolls through, standing in for the browser: rows are
 * prepended by the page an end asks for, and the viewport moves only when the
 * scroller says to.
 */
class Harness {
  state: ScrollerState = initialScrollerState();
  scrollTop: number;
  scrollHeight: number;
  loading = false;
  /** pages left above; each is 2000px of rows */
  pagesAbove: number;
  asks = 0;

  constructor(scrollHeight: number, pagesAbove: number) {
    this.scrollHeight = scrollHeight;
    this.scrollTop = scrollHeight - VIEW;
    this.pagesAbove = pagesAbove;
  }

  private get metrics(): ScrollMetrics {
    return {
      scrollTop: this.scrollTop,
      scrollHeight: this.scrollHeight,
      clientHeight: VIEW,
    };
  }

  private apply(result: ReturnType<typeof onScroll>) {
    this.state = result.state;
    if (result.scrollTo !== undefined) this.scrollTop = result.scrollTo;
    if (result.ask) {
      this.asks++;
      // the request goes out; react has not rendered the loading state yet,
      // which is the window the fast scroller lives in
      if (result.ask === 'top' && this.pagesAbove > 0) this.loading = true;
    }
    return result;
  }

  scrollBy(delta: number) {
    this.scrollTop = Math.max(
      0,
      Math.min(this.scrollHeight - VIEW, this.scrollTop + delta),
    );
    this.apply(onScroll(this.state, this.metrics, this.options()));
  }

  /** the page comes back and react commits the new rows */
  deliver() {
    if (this.pagesAbove > 0) {
      this.pagesAbove--;
      this.scrollHeight += 2000;
    }
    this.loading = false;
    this.commit();
  }

  commit() {
    this.apply(onCommit(this.state, this.metrics, this.options()));
  }

  poll() {
    this.apply(onPoll(this.state, this.metrics, this.options()));
  }

  private options() {
    return {
      offset: OFFSET,
      loading: this.loading,
      onTopScrollsToBottom: false,
    };
  }
}

describe('infinite scroller', () => {
  it('asks for a page when the reader reaches the top', () => {
    const h = new Harness(5000, 3);
    h.scrollBy(-5000);
    expect(h.state.pending).toBe('top');
  });

  it('keeps the reader in place when rows arrive above them', () => {
    const h = new Harness(5000, 3);
    h.scrollBy(-5000);
    expect(h.scrollTop).toBe(0);
    h.deliver();
    // 2000px of rows went in above, so the same line is 2000px further down
    expect(h.scrollTop).toBe(2000);
  });

  it('survives events arriving before the loading state renders', () => {
    const h = new Harness(5000, 3);
    h.scrollBy(-4000);
    h.scrollBy(-500);
    // the request is out, but react has not committed `loading` yet, so more
    // scroll events land first. this is what a fast scroll looks like
    h.loading = false;
    h.scrollBy(-500);
    h.scrollBy(-500);
    h.loading = true;

    h.deliver();
    expect(h.scrollTop).toBe(2000);
    expect(h.state.pending).toBe('');
  });

  it('keeps paging while the reader stays pinned at the top', () => {
    const h = new Harness(5000, 3);
    h.scrollBy(-5000);
    h.deliver();
    h.scrollBy(-2000);
    h.deliver();
    h.scrollBy(-2000);
    h.deliver();
    expect(h.pagesAbove).toBe(0);
  });

  it('keeps offering an end that answered with nothing', () => {
    // the view knows whether the log has more and declines for free; an end
    // that stops offering can never recover if it was wrong
    const h = new Harness(5000, 0);
    h.scrollBy(-5000);
    h.commit();
    expect(h.state.pending).toBe('');
    const before = h.asks;
    h.poll();
    expect(h.asks).toBe(before + 1);
  });

  it('releases and retries an end whose handler refused to load', () => {
    const h = new Harness(5000, 1);
    h.scrollBy(-5000);
    // the view declines: already fetching, or no cursor yet, so nothing ever
    // arrives and the end would otherwise stay marked as waiting for good
    h.loading = false;
    const before = h.asks;
    h.poll();
    expect(h.asks).toBe(before + 1);
  });

  it('keeps offering the top to a reader parked there by autoscroll', () => {
    // middle click holds the view against the top and stops producing scroll
    // events, so every later page depends on the poll alone
    const h = new Harness(5000, 2);
    h.scrollTop = 0;
    h.poll();
    expect(h.state.pending).toBe('top');
    h.deliver();
    expect(h.scrollTop).toBe(2000);
  });

  it('picks up a reader parked at the top with no events at all', () => {
    const h = new Harness(5000, 2);
    h.scrollTop = 0;
    h.poll();
    expect(h.state.pending).toBe('top');
  });
});
