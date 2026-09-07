import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
} from 'react';
import {
  initialScrollerState,
  onCommit,
  onPoll,
  onScroll,
  type ScrollerOptions,
  type ScrollerResult,
  type ScrollerState,
  type ScrollMetrics,
} from './scroller';

export interface InfiniteScrollHandle {
  /**
   * Rows were removed from above the viewport; give back the height they took
   * so the reader does not slide. Routed through here rather than by writing
   * scrollTop directly, because a move the scroller does not know about reads
   * to it as the reader jumping, and it answers by paging the wrong end.
   */
  keepPlaceAfterHeightChange(heightBefore: number): void;
}

export const InfiniteScroll = ({
  ref: handle,
  loading,
  offset = 0,
  onTopScrollsToBottom = true,
  onBottom,
  onTop,
  children,
  className,
  ...props
}: {
  loading: boolean;
  offset?: number;
  onTopScrollsToBottom?: boolean;
  onBottom: () => void;
  onTop: () => void;
  children: React.ReactNode;
  ref?: React.Ref<InfiniteScrollHandle>;
} & Omit<HTMLAttributes<HTMLDivElement>, 'ref'>) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(initialScrollerState());
  // read by handlers that run after paint, so a value assigned during render
  // would be lost on a render react discards
  const optionsRef = useRef<ScrollerOptions>({
    offset,
    loading,
    onTopScrollsToBottom,
  });
  // the scroll event caused by moving scrollTop ourselves is not the reader
  const skipNextScroll = useRef(false);
  // the row the reader was looking at when a page was asked for above them,
  // and how far below the top of the viewport it sat
  const anchor = useRef<{ node: Element; offset: number } | null>(null);

  /** The first row still on screen, which is the one worth keeping still. */
  const takeAnchor = (el: HTMLDivElement) => {
    for (const node of el.children) {
      const top = (node as HTMLElement).offsetTop;
      if (top + (node as HTMLElement).offsetHeight > el.scrollTop) {
        anchor.current = { node, offset: top - el.scrollTop };
        return;
      }
    }
    anchor.current = null;
  };

  useLayoutEffect(() => {
    optionsRef.current = { offset, loading, onTopScrollsToBottom };
  });

  const run = useCallback(
    (
      decide: (
        state: ScrollerState,
        metrics: ScrollMetrics,
        options: ScrollerOptions,
      ) => ScrollerResult,
    ) => {
      const el = targetRef.current;
      if (!el) return;

      const result = decide(
        stateRef.current,
        {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        },
        optionsRef.current,
      );
      stateRef.current = result.state;

      if (result.scrollTo !== undefined) {
        // measuring against a row that is still on screen survives anything
        // else that changed height while the page was in flight
        const kept = result.anchored ? anchor.current : null;
        el.scrollTop =
          kept && el.contains(kept.node)
            ? (kept.node as HTMLElement).offsetTop - kept.offset
            : result.scrollTo;
        anchor.current = null;
      }
      if (result.skipNextScroll) skipNextScroll.current = true;
      if (result.ask) {
        if (result.ask === 'top') takeAnchor(el);
        (result.ask === 'top' ? onTop : onBottom)();
      }
    },
    [onTop, onBottom],
  );

  // no dependency list: rows land on whichever commit react happens to make
  useLayoutEffect(() => run(onCommit));

  // held in a ref so the timer below can be created once. keyed on `run` it
  // was torn down and rebuilt on every render, and renders come faster than
  // its interval while pages are loading, so it never got to fire
  const runRef = useRef(run);
  runRef.current = run;

  // resting against an end produces neither a scroll event nor a render, so
  // nothing else would notice that the reader is waiting on a page
  useEffect(() => {
    const timer = setInterval(() => runRef.current(onPoll), 250);
    return () => clearInterval(timer);
  }, []);

  useImperativeHandle(handle, () => ({
    keepPlaceAfterHeightChange(heightBefore: number) {
      const el = targetRef.current;
      if (!el) return;
      const removed = heightBefore - el.scrollHeight;
      if (!removed) return;
      el.scrollTop -= removed;
      stateRef.current = { ...stateRef.current, prevScrollTop: el.scrollTop };
      skipNextScroll.current = true;
    },
  }));

  const handleElementScroll = useCallback(() => {
    if (skipNextScroll.current) {
      skipNextScroll.current = false;
      return;
    }
    run(onScroll);
  }, [run]);

  return (
    <div
      ref={targetRef}
      onScroll={handleElementScroll}
      className={className}
      style={{ overflowAnchor: 'none' }}
      {...props}
    >
      {children}
    </div>
  );
};
