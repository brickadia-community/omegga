import type { HTMLAttributes } from 'react';
import type React from 'react';

export const Header = ({
  children,
  className,
  ...props
}: React.PropsWithChildren & HTMLAttributes<HTMLDivElement>) => (
  <div className={`header ${className ?? ''}`} {...props}>
    {children}
  </div>
);
