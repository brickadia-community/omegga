import type { HTMLAttributes } from 'react';
import type React from 'react';

export const Header = ({
  children,
  ...props
}: React.PropsWithChildren & HTMLAttributes<HTMLDivElement>) => (
  <div className="header" {...props}>
    {children}
  </div>
);
