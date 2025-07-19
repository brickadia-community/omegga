import React, { type HTMLAttributes } from 'react';

export const Scroll = ({
  children,
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) => (
  <div className={`scroll-container ${className ?? ''}`} {...props}>
    <div className="scroll-scroller" ref={ref}>
      {children}
    </div>
  </div>
);
