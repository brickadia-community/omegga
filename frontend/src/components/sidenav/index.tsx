import {
  IconDashboard,
  IconList,
  IconMessages,
  IconPlug,
  IconServer,
  IconShield,
  IconUser,
  IconUserCog,
  IconWorld,
} from '@tabler/icons-react';
import type React from 'react';
import { memo, type AnchorHTMLAttributes } from 'react';
import { Link, useLocation } from 'wouter';
import { useHasScope } from '@hooks';
import { Permissions, type Permission } from '../../permissions';

export const MenuButton = ({
  children,
  disabled,
  to,
  scope,
  alsoActive,
  ...props
}: React.PropsWithChildren<{
  disabled?: boolean;
  to: string;
  scope?: Permission;
  alsoActive?: string;
}> &
  AnchorHTMLAttributes<HTMLAnchorElement>) => {
  const hasScope = useHasScope(...(scope ? [scope] : []));
  const [location] = useLocation();
  if (scope && !hasScope) return null;
  const isActive =
    to === '/'
      ? location === '/'
      : location === to ||
        location.startsWith(to + '/') ||
        (alsoActive != null && location.startsWith(alsoActive));
  return (
    <Link
      href={to}
      className={() =>
        `menu-button ${disabled ? 'disabled' : ''} ${isActive ? 'active' : ''}`
      }
      {...props}
    >
      <div className="menu-button-content">{children}</div>
    </Link>
  );
};

export const SideNav = memo(() => {
  const hasUserList = useHasScope(Permissions.UserList);
  const hasRoleList = useHasScope(Permissions.RoleList);

  return (
    <div className="main-menu-buttons">
      <MenuButton
        to="/"
        data-tooltip="Chat with players, view server status. Main Dashboard"
      >
        <IconDashboard style={{ background: '#de4f43' }} />
        Dashboard
      </MenuButton>
      <MenuButton
        to="/worlds"
        scope={Permissions.WorldList}
        data-tooltip="Manage worlds"
      >
        <IconWorld style={{ background: '#f0a500' }} />
        Worlds
      </MenuButton>
      <MenuButton
        to="/history"
        scope={Permissions.ChatHistory}
        data-tooltip="Browse chat history"
      >
        <IconMessages style={{ background: '#008bd6' }} />
        History
      </MenuButton>
      <MenuButton
        to="/plugins"
        scope={Permissions.PluginList}
        data-tooltip="Manage, reload, and configure plugins"
      >
        <IconPlug style={{ background: '#00b35f' }} />
        Plugins
      </MenuButton>
      <MenuButton
        to="/players"
        scope={Permissions.PlayerList}
        data-tooltip="Browse player info and play time"
      >
        <IconList style={{ background: '#b3006b' }} />
        Players
      </MenuButton>
      <MenuButton
        to="/server"
        scope={Permissions.ServerStatus}
        data-tooltip="Server management"
      >
        <IconServer style={{ background: '#453d9c' }} />
        Server
      </MenuButton>
      {hasUserList ? (
        <MenuButton
          to="/users"
          alsoActive="/roles"
          data-tooltip="Server users and roles"
        >
          <IconUser style={{ background: '#7f0b8a' }} />
          Users
        </MenuButton>
      ) : hasRoleList ? (
        <MenuButton to="/roles" data-tooltip="Server roles">
          <IconShield style={{ background: '#7f0b8a' }} />
          Roles
        </MenuButton>
      ) : null}
      <MenuButton to="/account" data-tooltip="Your account settings">
        <IconUserCog style={{ background: '#5a5a5a' }} />
        Account
      </MenuButton>
    </div>
  );
});
