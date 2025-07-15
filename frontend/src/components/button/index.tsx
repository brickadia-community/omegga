import type React from 'react';
import type { HTMLAttributes, MouseEventHandler } from 'react';

export const Button = ({
  children,
  warn,
  main,
  error,
  info,
  normal,
  disabled = false,
  icon,
  boxy,
  onClick,
  ...props
}: React.PropsWithChildren<{
  warn?: boolean;
  main?: boolean;
  error?: boolean;
  info?: boolean;
  normal?: boolean;
  disabled?: boolean;
  icon?: boolean;
  boxy?: boolean;
  onClick?: MouseEventHandler;
}> &
  HTMLAttributes<HTMLDivElement>) => (
  <div
    className={[
      'button',
      warn && 'warn',
      main && 'main',
      error && 'error',
      info && 'info',
      normal && 'normal',
      disabled && 'disabled',
      boxy && 'boxy',
      icon && 'icon',
    ]
      .filter(Boolean)
      .join(' ')}
    onClick={onClick}
    {...props}
  >
    <div className="button-content">{children}</div>
  </div>
);
