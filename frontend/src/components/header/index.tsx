import type { HTMLAttributes } from 'react';
import type React from 'react';

export const Header = ({
  children,
  className,
  attached,
  ...props
}: React.PropsWithChildren &
  HTMLAttributes<HTMLDivElement> & { attached?: boolean }) => (
  <div
    className={`header ${attached ? 'attached' : ''} ${className ?? ''}`}
    {...props}
  >
    {children}
  </div>
);
