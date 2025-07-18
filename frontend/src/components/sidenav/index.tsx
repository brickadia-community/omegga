import {
  IconDashboard,
  IconList,
  IconMessages,
  IconPlug,
  IconServer,
  IconUser,
  IconWorld,
} from '@tabler/icons-react';
import type React from 'react';
import { memo, type AnchorHTMLAttributes } from 'react';
import { Link } from 'wouter';

export const MenuButton = ({
  children,
  disabled,
  to,
  ...props
}: React.PropsWithChildren<{
  disabled?: boolean;
  to: string;
}> &
  AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <Link
    href={to}
    className={active =>
      `menu-button ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`
    }
    {...props}
  >
    <div className="menu-button-content">{children}</div>
  </Link>
);

export const SideNav = memo(() => (
  <div className="main-menu-buttons">
    <MenuButton
      to="/"
      data-tooltip="Chat with players, view server status. Main Dashboard"
    >
      <IconDashboard style={{ background: '#de4f43' }} />
      Dashboard
    </MenuButton>
    <MenuButton to="/worlds" data-tooltip="Manage worlds">
      <IconWorld style={{ background: '#f0a500' }} />
      Worlds
    </MenuButton>
    <MenuButton to="/history" data-tooltip="Browse chat history">
      <IconMessages style={{ background: '#008bd6' }} />
      History
    </MenuButton>
    <MenuButton
      to="/plugins"
      data-tooltip="Manage, reload, and configure plugins"
    >
      <IconPlug style={{ background: '#00b35f' }} />
      Plugins
    </MenuButton>
    <MenuButton to="/players" data-tooltip="Browse player info and play time">
      <IconList style={{ background: '#b3006b' }} />
      Players
    </MenuButton>
    <MenuButton to="/server" data-tooltip="Server management">
      <IconServer style={{ background: '#453d9c' }} />
      Server
    </MenuButton>
    <MenuButton to="/users" data-tooltip="Server users">
      <IconUser style={{ background: '#7f0b8a' }} />
      Users
    </MenuButton>
  </div>
));
