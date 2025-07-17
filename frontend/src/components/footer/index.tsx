import type { HTMLAttributes } from 'react';

export const Footer = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={`footer ${className ?? ''}`} {...props}>
    {children}
  </div>
);
