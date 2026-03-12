import React, {
  useCallback,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
} from 'react';

export const InfiniteScroll = ({
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
} & HTMLAttributes<HTMLDivElement>) => {
  const targetRef = useRef<HTMLDivElement>(null);
  const prevScrollTopRef = useRef(0);
  const lastDirectionRef = useRef('');
  const loadingRef = useRef(loading);
  // Snapshot of scrollHeight taken when loading starts, before DOM changes
  const scrollHeightBeforeLoad = useRef(0);
  // Skip the next scroll event (caused by programmatic scrollTop assignment)
  const skipNextScroll = useRef(false);

  // Capture scroll height and current scroll position when loading starts
  if (loading && !loadingRef.current && targetRef.current) {
    scrollHeightBeforeLoad.current = targetRef.current.scrollHeight;
    prevScrollTopRef.current = targetRef.current.scrollTop;
  }
  loadingRef.current = loading;

  // Runs synchronously after DOM update but before browser paint
  useLayoutEffect(() => {
    if (loading || !targetRef.current) return;
    const el = targetRef.current;
    const dir = lastDirectionRef.current;
    lastDirectionRef.current = '';

    if (dir === 'top') {
      if (onTopScrollsToBottom) {
        el.scrollTop = el.scrollHeight - el.offsetHeight - offset - 2;
      } else {
        // New content was prepended — adjust scrollTop by the height of added content.
        // Use live el.scrollTop (not the stale ref) so we account for any
        // position changes since loading started.
        const heightDelta = el.scrollHeight - scrollHeightBeforeLoad.current;
        if (heightDelta > 0) {
          el.scrollTop += heightDelta;
        }
      }
      // The scrollTop assignment above will fire a scroll event — ignore it
      prevScrollTopRef.current = el.scrollTop;
      skipNextScroll.current = true;
    }
  }, [loading, onTopScrollsToBottom, offset]);

  const handleElementScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (skipNextScroll.current) {
        skipNextScroll.current = false;
        return;
      }
      if (loadingRef.current) return;

      const target = e.currentTarget;
      const scrollTop = target.scrollTop;
      const prevScrollTop = prevScrollTopRef.current;

      // Scrolling down and near bottom
      if (
        scrollTop > prevScrollTop &&
        scrollTop + target.offsetHeight >= target.scrollHeight - offset
      ) {
        lastDirectionRef.current = 'bottom';
        prevScrollTopRef.current = scrollTop;
        onBottom();
        return;
      }

      // Scrolling up (or already at top) and near top
      if (scrollTop <= offset && scrollTop <= prevScrollTop) {
        lastDirectionRef.current = 'top';
        prevScrollTopRef.current = scrollTop;
        onTop();
        return;
      }

      prevScrollTopRef.current = scrollTop;
    },
    [offset, onBottom, onTop],
  );

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
