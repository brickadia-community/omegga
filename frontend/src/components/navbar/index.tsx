import { useStore } from '@nanostores/react';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { Button } from '../button';
import { logout } from '../../utils';
import { IconLogout } from '@tabler/icons-react';
import { $showLogout, $user } from '../../stores/user';

export const NavBar = ({
  children,
  attached,
  className,
}: HTMLAttributes<HTMLDivElement> & { attached?: boolean }) => (
  <div className={`navbar ${attached ? 'attached' : ''} ${className ?? ''}`}>
    {children}
  </div>
);

export const NavHeader = ({
  title,
  children,
}: PropsWithChildren<{ title: string }>) => {
  const user = useStore($user);
  const showLogout = useStore($showLogout);

  return (
    <div className="main-nav">
      <header className="nav-header">{title}</header>
      <NavBar>
        <span style={{ flex: 1, marginLeft: 8 }}>
          Welcome, {user?.username ?? '...'}
        </span>
        {children}
        {showLogout && (
          <Button
            icon
            error
            data-tooltip="Logout of Web UI"
            onClick={() => logout()}
          >
            <IconLogout />
          </Button>
        )}
      </NavBar>
    </div>
  );
};
