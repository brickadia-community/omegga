import type { HTMLAttributes } from 'react';

export const Footer = ({
  children,
  className,
  attached,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  attached?: boolean;
}) => (
  <div
    className={`footer ${attached ? 'attached' : ''} ${className ?? ''}`}
    {...props}
  >
    {children}
  </div>
);
