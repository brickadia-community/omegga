import React, { useEffect, useRef, useState, type HTMLAttributes } from 'react';

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
  const [scrollPosition, setScrollPosition] = useState(0);
  const [lastDirection, setLastDirection] = useState('');
  const targetRef = useRef<HTMLDivElement>(null);

  const emitEvents = (name: 'bottom' | 'top') => {
    if (!loading) {
      setLastDirection(name);
      name === 'bottom' ? onBottom() : onTop();
    }
  };

  const handleElementScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const currentScrollPosition = target.scrollTop;

    if (
      currentScrollPosition > scrollPosition &&
      currentScrollPosition + target.offsetHeight >=
        target.scrollHeight - offset
    ) {
      emitEvents('bottom');
    } else if (
      currentScrollPosition < scrollPosition &&
      currentScrollPosition <= offset
    ) {
      emitEvents('top');
    }

    setScrollPosition(currentScrollPosition);
  };

  useEffect(() => {
    if (
      onTopScrollsToBottom &&
      !loading &&
      lastDirection === 'top' &&
      targetRef.current
    ) {
      targetRef.current.scrollTo({
        top:
          targetRef.current.scrollHeight -
          targetRef.current.offsetHeight -
          offset -
          2,
        behavior: 'instant',
      });
    }
  }, [loading, lastDirection, onTopScrollsToBottom, offset]);

  return (
    <div
      ref={targetRef}
      onScroll={handleElementScroll}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
};
