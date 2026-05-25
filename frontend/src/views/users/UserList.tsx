import type { GetUsersRes } from '@backend/api';
import {
  AnimatedDropdown,
  Button,
  Dimmer,
  Footer,
  Header,
  Input,
  Loader,
  Modal,
  NavBar,
  NavHeader,
  PageContent,
  PopoutContent,
  Scroll,
  SideNav,
  SortIcons,
} from '@components';
import { useStore } from '@nanostores/react';
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowLeft,
  IconArrowRight,
  IconBan,
  IconCaretDown,
  IconCaretUp,
  IconLock,
  IconRotate,
  IconShield,
  IconUserPlus,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { useHasScope, useRequireScope } from '@hooks';
import { duration, logout } from '@utils';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Route, Switch, useLocation, useRoute } from 'wouter';
import { UserInspector } from './UserInspector';
import { Permissions } from '../../permissions';
import { $omeggaData, $user, $usersRefresh } from '../../stores/user';
import { trpc } from '../../trpc';

const ACTION_ENABLE_USERS = 'Enable Users';
const ACTION_ADD_USER = 'Add User';

export const UserList = () => {
  const canAccess = useRequireScope(Permissions.UserList);
  const userless = useStore($omeggaData)?.userless;
  const myUser = useStore($user);

  const canCreate = useHasScope(Permissions.UserCreate);
  const canViewRoles = useHasScope(Permissions.RoleList);

  const rolesQuery = trpc.role.list.useQuery(undefined, {
    enabled: canViewRoles,
  });
  const rolesById = useMemo(() => {
    const map: Record<string, { name: string; order: number }> = {};
    for (const r of rolesQuery.data ?? []) map[r.id] = r;
    return map;
  }, [rolesQuery.data]);

  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<GetUsersRes['users']>([]);
  const [search, setSearch] = useState('');

  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showEnableUsers, setShowEnableUsers] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const [_location, navigate] = useLocation();
  const [_match, params] = useRoute('/users/:id?');

  const utils = trpc.useUtils();
  const createMutation = trpc.user.create.useMutation();

  const [showActions, setShowActions] = useState(false);

  const openEnableUsers = () => {
    setShowActions(false);
    setShowEnableUsers(true);
    setShowCreateUser(false);
    setUsername('');
    setError('');
  };

  const openCreateUser = () => {
    setShowActions(false);
    setShowCreateUser(true);
    setShowEnableUsers(false);
    setUsername('');
    setError('');
  };


  const query = useRef({
    page: 0,
    sort: 'lastSeen',
    direction: -1,
  });
  const { page, sort, direction } = query.current;
  const setPage = (page: number | ((old: number) => number)) => {
    if (typeof page === 'function') page = page(query.current.page);
    query.current.page = page;
    getUsers();
  };
  const setDirection = (dir: number | ((old: number) => number)) => {
    if (typeof dir === 'function') dir = dir(query.current.direction);
    query.current.direction = dir;
  };

  const getUsers = async () => {
    setLoading(true);
    const { page, sort, direction } = query.current;
    const { users, total, pages } = await utils.user.list.fetch({
      page,
      search: '',
      sort,
      direction,
    });
    setPages(pages);
    setTotal(total);
    setUsers(users);
    setLoading(false);
  };
  const getUsersRef = useRef<() => Promise<void>>(getUsers);
  getUsersRef.current = getUsers;

  const usersRefresh = useStore($usersRefresh);
  useEffect(() => {
    getUsers();
  }, [usersRefresh]);

  const setSort = (s: string) => {
    if (s == sort) {
      setDirection(d => d * -1);
    } else {
      query.current.sort = s;
      setDirection(s === 'name' ? 1 : -1);
    }
    getUsers();
  };

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u => (u.username || 'Admin').toLowerCase().includes(q));
  }, [users, search]);

  const hideModals = () => {
    setShowCreateUser(false);
    setShowEnableUsers(false);
    setUsername('');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const submit = async () => {
    setError('');
    if (password !== confirmPassword) return;
    setModalLoading(true);
    let err = '';
    try {
      err = await createMutation.mutateAsync({ username, password });
      setModalLoading(false);
      if (!err) {
        if (showEnableUsers) logout();
        else {
          const createdName = username;
          hideModals();
          await getUsers();
          navigate(`/users/${createdName}`);
        }
        return;
      }
    } catch (e) {
      console.error('error setting user credentials', e);
    }
    setError(err);
  };

  const ok = useMemo(() => {
    return (
      username.match(/^\w{0,32}$/) &&
      username.length !== 0 &&
      password.length !== 0
    );
  }, [username, password]);

  if (!canAccess) return null;

  const hasDropdownActions = userless || (!userless && canCreate);

  return (
    <>
      <NavHeader title="Users">
        {hasDropdownActions && (
          <div className="widgets-container">
            <Button normal boxy onClick={() => setShowActions(!showActions)}>
              {showActions ? <IconCaretUp /> : <IconCaretDown />}
              Actions
            </Button>
            <AnimatedDropdown visible={showActions}>
              {userless && (
                <Button info onClick={openEnableUsers}>
                  <IconLock />
                  {ACTION_ENABLE_USERS}
                </Button>
              )}
              {!userless && canCreate && (
                <Button main onClick={openCreateUser}>
                  <IconUserPlus />
                  {ACTION_ADD_USER}
                </Button>
              )}
            </AnimatedDropdown>
          </div>
        )}
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container players-container">
          <div className="player-table-container">
            {canViewRoles && (
              <NavBar attached>
                <Button main boxy className="tab-button active">
                  <IconUsers />
                  Users
                </Button>
                <Button
                  normal
                  boxy
                  className="tab-button"
                  onClick={() => navigate('/roles')}
                >
                  <IconShield />
                  Roles
                </Button>
                <span style={{ flex: 1 }} />
              </NavBar>
            )}
            <NavBar attached>
              <Input
                type="text"
                placeholder="Search Users..."
                value={search}
                onChange={s => setSearch(s)}
              />
              <span style={{ flex: 1 }} />
              <Button
                icon
                normal
                data-tooltip="Refresh user list"
                onClick={getUsers}
              >
                <IconRotate />
              </Button>
            </NavBar>
            <div className="players-list">
              <Scroll>
                <table className="br-table">
                  <thead>
                    <tr>
                      <th
                        style={{ textAlign: 'left', width: '100%' }}
                        onClick={() => setSort('username')}
                      >
                        <span>
                          Username
                          <SortIcons
                            name="username"
                            sort={sort}
                            direction={direction}
                          />
                        </span>
                      </th>
                      <th
                        onClick={() => setSort('lastOnline')}
                        data-tooltip="When the user was last active"
                      >
                        <span>
                          Active
                          <SortIcons
                            name="lastOnline"
                            sort={sort}
                            direction={direction}
                          />
                        </span>
                      </th>
                      <th
                        onClick={() => setSort('created')}
                        data-tooltip="When the user joined"
                      >
                        <span>
                          Joined
                          <SortIcons
                            name="created"
                            sort={sort}
                            direction={direction}
                          />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr
                        onClick={() => navigate(`/users/${u.username}`)}
                        className={u.username === params?.id ? 'active' : ''}
                        key={u.username}
                      >
                        <td>
                          <div>
                            {u.isBanned && (
                              <span className="ban">
                                <IconBan size={14} />{' '}
                              </span>
                            )}
                            {u.username || 'Admin'}{' '}
                            {(u.username || 'Admin') ===
                              (myUser?.username || 'Admin') && (
                              <span style={{ fontSize: 12 }}>(You)</span>
                            )}
                          </div>
                          {(u as any).roles?.length > 0 && (
                            <div className="muted-text" style={{ fontSize: 12 }}>
                              {((u as any).roles as string[])
                                .map(id => rolesById[id])
                                .filter(Boolean)
                                .sort((a, b) => a.order - b.order)
                                .map(r => r.name)
                                .join(', ')}
                            </div>
                          )}
                        </td>
                        <td
                          style={{ textAlign: 'right' }}
                          data-tooltip={
                            u.lastOnline ? new Date(u.lastOnline) : 'Never'
                          }
                        >
                          {u.lastOnline ? duration(u.seenAgo) : 'Never'}
                        </td>
                        <td
                          style={{ textAlign: 'right' }}
                          data-tooltip={new Date(u.created)}
                        >
                          {duration(u.createdAgo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroll>
              <Footer className="pagination-footer" attached>
                <Button
                  icon
                  normal
                  disabled={page === 0}
                  onClick={() => setPage(0)}
                >
                  <IconArrowBarToLeft />
                </Button>
                <Button
                  icon
                  normal
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                  <IconArrowLeft />
                </Button>
                <div className="current-page">
                  <div>
                    Page {page + 1} of {pages}
                  </div>
                  <div>
                    Showing {filteredUsers.length} of {total}
                  </div>
                </div>
                <Button
                  icon
                  normal
                  disabled={page >= pages - 1}
                  onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
                >
                  <IconArrowRight />
                </Button>
                <Button
                  icon
                  normal
                  disabled={page >= pages - 1}
                  onClick={() => setPage(pages - 1)}
                >
                  <IconArrowBarToRight />
                </Button>
              </Footer>
              <Loader active={loading} size="huge">
                Loading Users
              </Loader>
            </div>
          </div>
          <Switch>
            <Route path="/users/:id" component={UserInspector} />
            <Route>
              <div className="player-inspector-container">
                <NavBar attached>SELECT A USER</NavBar>
                <div className="player-inspector" />
              </div>
            </Route>
          </Switch>
          <Dimmer visible={showCreateUser || showEnableUsers}>
            <Loader active={modalLoading} size="huge">
              Submitting
            </Loader>
            <Modal visible={!modalLoading}>
              <Header>
                {showEnableUsers ? 'Enable Users' : 'Create New User'}
              </Header>
              <PopoutContent>
                {showEnableUsers && (
                  <>
                    <p>
                      This will require you to enter a password when you sign
                      in.
                    </p>
                    <p>This action cannot be undone.</p>
                  </>
                )}
                {showCreateUser && (
                  <p>
                    Creating a new user. It's recommended to create a temporary
                    password.
                  </p>
                )}
                {error && <p style={{ color: 'red' }}>Error: {error}</p>}
              </PopoutContent>
              <div className="popout-inputs">
                <Input
                  placeholder="username"
                  type="text"
                  value={username}
                  onChange={u => setUsername(u)}
                />
                <Input
                  placeholder="password"
                  type="password"
                  value={password}
                  onChange={p => setPassword(p)}
                />
                <Input
                  placeholder="confirm password"
                  type="password"
                  value={confirmPassword}
                  onChange={p => setConfirmPassword(p)}
                  onSubmit={
                    ok && confirmPassword === password ? submit : undefined
                  }
                />
              </div>
              <Footer>
                <Button
                  main
                  disabled={!ok || confirmPassword !== password}
                  onClick={() => submit()}
                >
                  <IconUserPlus />
                  {showEnableUsers ? 'Enable' : 'Add'}
                </Button>
                <div style={{ flex: 1 }} />
                <Button normal onClick={hideModals}>
                  <IconX />
                  Cancel
                </Button>
              </Footer>
            </Modal>
          </Dimmer>
        </div>
      </PageContent>
    </>
  );
};
