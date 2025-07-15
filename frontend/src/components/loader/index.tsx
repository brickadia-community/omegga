import { IconLoader } from '@tabler/icons-react';
import type React from 'react';
import type { MouseEventHandler } from 'react';

const sizes = {
  small: '24',
  normal: '30',
  huge: '60',
  massive: '120',
};

export const Loader = ({
  children,
  onClick,
  blur,
  active = true,
  inline = false,
  size = 'normal',
}: React.PropsWithChildren<{
  active?: boolean;
  inline?: boolean;
  blur?: boolean;
  size?: 'small' | 'normal' | 'huge' | 'massive';
  onClick?: MouseEventHandler;
}>) => {
  return (
    <div
      className={`loader ${active ? 'active' : ''} ${inline ? 'inline' : ''}`}
      onClick={onClick}
    >
      <div className={`loader-container ${blur ? 'blur' : ''}`}>
        <IconLoader className="loader-icon" size={sizes[size]} />
        <div>{children}</div>
      </div>
    </div>
  );
};
