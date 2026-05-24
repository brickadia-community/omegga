import type { GetUsersRes } from '@backend/api';
import {
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
  IconX,
} from '@tabler/icons-react';
import { useHasScope } from '@hooks';
import { duration, logout } from '@utils';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Route, Switch, useLocation, useRoute } from 'wouter';
import { UserInspector } from './UserInspector';
import { DefaultPermissions } from './DefaultPermissions';
import { Domains, Permissions } from '../../permissions';
import { $omeggaData, $user, $usersRefresh } from '../../stores/user';
import { trpc } from '../../trpc';

const ACTION_CHANGE_PASSWORD = 'Change Password';
const ACTION_ENABLE_USERS = 'Enable Users';
const ACTION_ADD_USER = 'Add User';
const ACTION_DEFAULT_PERMS = 'Default Permissions';

export const UserList = () => {
  const userless = useStore($omeggaData)?.userless;
  const myUser = useStore($user);

  const canList = useHasScope(Permissions.UserList);
  const canCreate = useHasScope(Permissions.UserCreate);
  const canEditPerms = useHasScope(Permissions.UserPermissions);

  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<GetUsersRes['users']>([]);
  const [search, setSearch] = useState('');

  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCredentials, setShowCredentials] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const [_location, navigate] = useLocation();
  const [_match, params] = useRoute('/users/:id?');

  const utils = trpc.useUtils();
  const createMutation = trpc.user.create.useMutation();
  const passwdMutation = trpc.user.passwd.useMutation();

  const [showActions, setShowActions] = useState(false);

  const openCredentials = () => {
    setShowActions(false);
    setShowCredentials(true);
    setShowCreateUser(false);
    if (!userless) setUsername(myUser?.username ?? '');
    setError('');
  };

  const openCreateUser = () => {
    setShowActions(false);
    setShowCreateUser(true);
    setShowCredentials(false);
    setUsername('');
    setError('');
  };

  const openDefaultPerms = () => {
    setShowActions(false);
    navigate('/users/_defaults');
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

  // update table sort direction
  const setSort = (s: string) => {
    // flip direction if it's the same column
    if (s == sort) {
      setDirection(d => d * -1);
    } else {
      // otherwise, use the new column
      query.current.sort = s;
      // sort only name ascending on first click, all metrics are descending
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
    setShowCredentials(false);
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
      if (showCredentials && !userless) {
        err = await passwdMutation.mutateAsync({
          username: myUser?.username ?? '',
          password,
        });
      } else {
        err = await createMutation.mutateAsync({ username, password });
      }
      setModalLoading(false);
      if (!err) {
        if (showCredentials && userless) logout();
        else {
          const wasCreate = showCreateUser;
          const createdName = username;
          hideModals();
          await getUsers();
          if (wasCreate) navigate(`/users/${createdName}`);
        }
        return;
      }
    } catch (e) {
      console.error('error setting user credentials', e);
    }
    setError(err);
  };

  const ok = useMemo(() => {
    const nameOk = username.length !== 0 || !(showCredentials && !userless);
    return username.match(/^\w{0,32}$/) && nameOk && password.length !== 0;
  }, [username, password, showCredentials, userless]);

  if (!canList) {
    return (
      <>
        <NavHeader title="Account">
          <div className="widgets-container">
            <Button normal boxy onClick={() => setShowActions(!showActions)}>
              {showActions ? <IconCaretUp /> : <IconCaretDown />}
              Actions
            </Button>
            <div
              className="widgets-list"
              style={{ display: showActions ? 'block' : 'none' }}
            >
              <Button info onClick={openCredentials}>
                <IconLock />
                {ACTION_CHANGE_PASSWORD}
              </Button>
            </div>
          </div>
        </NavHeader>
        <PageContent>
          <SideNav />
          <div className="generic-container players-container">
            <UserInspector selfUser={myUser?.username} />
          </div>
          <Dimmer visible={showCredentials}>
            <Loader active={modalLoading} size="huge">
              Submitting
            </Loader>
            <Modal visible={!modalLoading}>
              <Header>Update Credentials</Header>
              <PopoutContent>
                <p>Updating credentials for user "{username}"</p>
                {error && <p style={{ color: 'red' }}>Error: {error}</p>}
              </PopoutContent>
              <div className="popout-inputs">
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
                />
              </div>
              <Footer>
                <Button
                  main
                  disabled={!password.length || confirmPassword !== password}
                  onClick={() => submit()}
                >
                  <IconLock />
                  Update
                </Button>
                <div style={{ flex: 1 }} />
                <Button normal onClick={hideModals}>
                  <IconX />
                  Cancel
                </Button>
              </Footer>
            </Modal>
          </Dimmer>
        </PageContent>
      </>
    );
  }

  return (
    <>
      <NavHeader title="Users">
        {!userless && canEditPerms && (
          <Button
            normal
            boxy
            className="default-perms-standalone"
            onClick={openDefaultPerms}
          >
            <IconShield />
            {ACTION_DEFAULT_PERMS}
          </Button>
        )}
        <div className="widgets-container">
          <Button normal boxy onClick={() => setShowActions(!showActions)}>
            {showActions ? <IconCaretUp /> : <IconCaretDown />}
            Actions
          </Button>
          <div
            className="widgets-list"
            style={{ display: showActions ? 'block' : 'none' }}
          >
            {!userless && canEditPerms && (
              <Button
                normal
                className="default-perms-dropdown hidden"
                onClick={openDefaultPerms}
              >
                <IconShield />
                {ACTION_DEFAULT_PERMS}
              </Button>
            )}
            <Button info onClick={openCredentials}>
              <IconLock />
              {userless ? ACTION_ENABLE_USERS : ACTION_CHANGE_PASSWORD}
            </Button>
            {!userless && canCreate && (
              <Button main onClick={openCreateUser}>
                <IconUserPlus />
                {ACTION_ADD_USER}
              </Button>
            )}
          </div>
        </div>
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container players-container">
          <div className="player-table-container">
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
                  onClick={() => {
                    setPage(0);
                  }}
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
                  onClick={() =>
                    setPage(p => Math.min(users.length - 1, p + 1))
                  }
                >
                  <IconArrowRight />
                </Button>
                <Button
                  icon
                  normal
                  disabled={page >= pages - 1}
                  onClick={() => setPage(users.length - 1)}
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
            <Route path="/users/_defaults" component={DefaultPermissions} />
            <Route path="/users/:id" component={UserInspector} />
            <Route>
              <div className="player-inspector-container">
                <NavBar attached>SELECT A USER</NavBar>
                <div className="player-inspector" />
              </div>
            </Route>
          </Switch>
          <Dimmer visible={showCredentials || showCreateUser}>
            <Loader active={modalLoading} size="huge">
              Submitting
            </Loader>
            <Modal visible={!modalLoading}>
              <Header>
                {showCreateUser ? 'Create New User' : 'Update Credentials'}
              </Header>
              <PopoutContent>
                {userless && (
                  <>
                    <p>
                      This will require you to enter a password when you sign
                      in.
                    </p>
                    <p>This action cannot be undone.</p>
                  </>
                )}
                {!userless && showCredentials && (
                  <p>Updating credentials for user "{username}"</p>
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
                {(userless || showCreateUser) && (
                  <Input
                    placeholder="username"
                    type="text"
                    value={username}
                    onChange={u => setUsername(u)}
                  />
                )}
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
                />
              </div>
              <Footer>
                <Button
                  main
                  disabled={!ok || confirmPassword !== password}
                  onClick={() => submit()}
                >
                  {showCreateUser && <IconUserPlus />}
                  {!showCreateUser && <IconLock />}
                  {showCreateUser ? 'Add' : 'Update'}
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
