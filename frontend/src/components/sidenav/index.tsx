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
  type Icon,
} from '@tabler/icons-react';
import { useStore } from '@nanostores/react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Link, useLocation } from 'wouter';
import { Permissions, type Permission } from '../../permissions';
import { $omeggaData, $resolvedScopes, $user } from '../../stores/user';

type NavItem = {
  to: string;
  label: string;
  Icon: Icon;
  color: string;
  tooltip: string;
  /** additional path prefix that should mark this entry as active */
  alsoActive?: string;
};

// Build the list of nav entries the current user is allowed to see. This is the
// single source of truth shared by both the desktop side menu and the mobile
// bottom navigation bar.
const useNavItems = (): NavItem[] => {
  const user = useStore($user);
  const resolved = useStore($resolvedScopes);
  const userless = useStore($omeggaData)?.userless;

  return useMemo(() => {
    const has = (scope?: Permission) =>
      !scope || user?.isOwner || !!resolved[scope];

    const items: NavItem[] = [];
    items.push({
      to: '/',
      label: 'Dashboard',
      Icon: IconDashboard,
      color: '#de4f43',
      tooltip: 'Chat with players, view server status. Main Dashboard',
    });
    if (has(Permissions.WorldList))
      items.push({
        to: '/worlds',
        label: 'Worlds',
        Icon: IconWorld,
        color: '#f0a500',
        tooltip: 'Manage worlds',
      });
    if (has(Permissions.ChatHistory))
      items.push({
        to: '/history',
        label: 'History',
        Icon: IconMessages,
        color: '#008bd6',
        tooltip: 'Browse chat history',
      });
    if (has(Permissions.PluginList))
      items.push({
        to: '/plugins',
        label: 'Plugins',
        Icon: IconPlug,
        color: '#00b35f',
        tooltip: 'Manage, reload, and configure plugins',
      });
    if (has(Permissions.PlayerList))
      items.push({
        to: '/players',
        label: 'Players',
        Icon: IconList,
        color: '#b3006b',
        tooltip: 'Browse player info and play time',
      });
    if (has(Permissions.ServerStatus))
      items.push({
        to: '/server',
        label: 'Server',
        Icon: IconServer,
        color: '#453d9c',
        tooltip: 'Server management',
      });
    if (has(Permissions.UserList))
      items.push({
        to: '/users',
        alsoActive: '/roles',
        label: 'Users',
        Icon: IconUser,
        color: '#7f0b8a',
        tooltip: 'Server users and roles',
      });
    else if (has(Permissions.RoleList))
      items.push({
        to: '/roles',
        label: 'Roles',
        Icon: IconShield,
        color: '#7f0b8a',
        tooltip: 'Server roles',
      });
    // no account to manage when users aren't enabled (userless mode)
    if (!userless)
      items.push({
        to: '/account',
        label: 'Account',
        Icon: IconUserCog,
        color: '#5a5a5a',
        tooltip: 'Your account settings',
      });
    return items;
  }, [user, resolved, userless]);
};

const isItemActive = (item: NavItem, location: string) =>
  item.to === '/'
    ? location === '/'
    : location === item.to ||
      location.startsWith(item.to + '/') ||
      (item.alsoActive != null && location.startsWith(item.alsoActive));

// Vertical side menu shown on desktop / tablet.
const DesktopMenu = ({ items }: { items: NavItem[] }) => {
  const [location] = useLocation();
  return (
    <div className="main-menu-buttons">
      {items.map(item => {
        const active = isItemActive(item, location);
        const { Icon } = item;
        return (
          <Link
            key={item.to}
            href={item.to}
            className={`menu-button ${active ? 'active' : ''}`}
            data-tooltip={item.tooltip}
          >
            <div className="menu-button-content">
              <Icon style={{ background: item.color }} />
              {item.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
};

// Horizontal bottom navigation bar shown on mobile. The dashboard sits in the
// middle of the entry list. When there aren't enough entries to overflow the
// bar they stay centered; otherwise the active entry animates to the center of
// the bar whenever the route changes.
const BottomNav = ({ items }: { items: NavItem[] }) => {
  const [location] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // Reorder so the dashboard ends up in the middle of the entry list.
  const ordered = useMemo(() => {
    const others = items.filter(i => i.to !== '/');
    const dash = items.find(i => i.to === '/');
    const mid = Math.ceil(others.length / 2);
    const list = others.slice(0, mid);
    if (dash) list.push(dash);
    list.push(...others.slice(mid));
    return list;
  }, [items]);

  // Scroll the active entry to the horizontal center, clamped to the scrollable
  // range. No-op when the entries fit without overflowing.
  const centerActive = useCallback((smooth: boolean) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const max = scroll.scrollWidth - scroll.clientWidth;
    if (max <= 0) return;
    const active = scroll.querySelector<HTMLElement>(
      '.bottom-nav-button.active',
    );
    if (!active) return;
    const target = Math.max(
      0,
      Math.min(
        active.offsetLeft + active.clientWidth / 2 - scroll.clientWidth / 2,
        max,
      ),
    );

    cancelAnimationFrame(rafRef.current);
    if (!smooth) {
      scroll.scrollLeft = target;
      return;
    }

    const start = scroll.scrollLeft;
    const dist = target - start;
    const duration = 300;
    let startTime = -1;
    const step = (t: number) => {
      if (startTime < 0) startTime = t;
      const p = Math.min(1, (t - startTime) / duration);
      const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
      scroll.scrollLeft = start + dist * ease;
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // center the active entry on mount / when entries or viewport size change
  useLayoutEffect(() => {
    centerActive(false);
    const onResize = () => centerActive(false);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [centerActive, ordered]);

  // animate the active entry to center whenever the route changes
  useEffect(() => {
    centerActive(true);
  }, [location, centerActive]);

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-scroll" ref={scrollRef}>
        {ordered.map(item => {
          const active = isItemActive(item, location);
          const { Icon } = item;
          return (
            <Link
              key={item.to}
              href={item.to}
              className={`bottom-nav-button ${active ? 'active' : ''}`}
              data-tooltip={item.tooltip}
            >
              <div
                className="bottom-nav-icon"
                style={{ background: item.color }}
              >
                <Icon />
              </div>
              <span className="bottom-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export const SideNav = memo(() => {
  const items = useNavItems();
  return (
    <>
      <DesktopMenu items={items} />
      <BottomNav items={items} />
    </>
  );
});
