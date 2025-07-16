import type { HTMLAttributes } from 'react';

export const Scroll = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={`scroll-container ${className ?? ''}`} {...props}>
    <div className="scroll-scroller">{children}</div>
  </div>
);
