import type React from 'react';

export const Header = ({ children }: React.PropsWithChildren) => (
  <div className="header">{children}</div>
);
