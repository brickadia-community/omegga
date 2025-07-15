import type { HTMLAttributes } from 'react';
import type React from 'react';

export const Scroll = ({
  children,
  ...props
}: React.PropsWithChildren & HTMLAttributes<HTMLDivElement>) => (
  <div className="scroll-container" {...props}>
    <div className="scroll-scroller">{children}</div>
  </div>
);
