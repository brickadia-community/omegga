import { useStore } from '@nanostores/react';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { useState } from 'react';
import { Link } from 'wouter';
import { AnimatedDropdown } from '../animated-dropdown';
import { Button } from '../button';
import { logout } from '../../utils';
import {
  IconCaretDown,
  IconCaretUp,
  IconLogout,
  IconUser,
  IconUserCog,
} from '@tabler/icons-react';
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
  className,
  children,
}: PropsWithChildren<{ title: string; className?: string }>) => {
  const user = useStore($user);
  const showLogout = useStore($showLogout);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={`main-nav ${className ?? ''}`}>
      <header className="nav-header">{title}</header>
      <NavBar>
        <span style={{ flex: 1 }} />
        {children}
        {showLogout && (
          <div className="widgets-container user-menu">
            <Button normal boxy onClick={() => setMenuOpen(!menuOpen)}>
              <IconUser />
              <span className="user-menu-name">
                {user?.username || 'Admin'}
              </span>
              {menuOpen ? <IconCaretUp /> : <IconCaretDown />}
            </Button>
            <AnimatedDropdown visible={menuOpen}>
              <Link
                href="/account"
                className="button normal"
                onClick={() => setMenuOpen(false)}
              >
                <div className="button-content">
                  <IconUserCog />
                  Account
                </div>
              </Link>
              <Button error onClick={() => logout()}>
                <IconLogout />
                Logout
              </Button>
            </AnimatedDropdown>
          </div>
        )}
      </NavBar>
    </div>
  );
};
