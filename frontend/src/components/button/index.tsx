import type React from 'react';
import type { MouseEventHandler } from 'react';

export const Button: React.FC<
  React.PropsWithChildren<{
    warn?: boolean;
    main?: boolean;
    error?: boolean;
    info?: boolean;
    normal?: boolean;
    disabled?: boolean;
    icon?: boolean;
    boxy?: boolean;
    onClick?: MouseEventHandler;
  }>
> = ({
  children,
  warn,
  main,
  error,
  info,
  normal,
  disabled,
  icon,
  boxy,
  onClick,
}) => (
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
  >
    <div className="button-content">{children}</div>
  </div>
);
