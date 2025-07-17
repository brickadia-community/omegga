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
import type { GetUsersRes } from '@omegga/webserver/backend/api';
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowLeft,
  IconArrowRight,
  IconCirclePlus,
  IconLock,
  IconRotate,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react';
import { debounce, duration, logout } from '@utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { $omeggaData, $user } from '../../stores/user';
import { useLocation, useRoute } from 'wouter';
import { rpcReq } from '../../socket';

export const UserList = () => {
  const userless = useStore($omeggaData)?.userless;
  const myUser = useStore($user);

  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<GetUsersRes['users']>([]);

  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCredentials, setShowCredentials] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const [userLookup, setUserLookup] = useState<
    Record<string, GetUsersRes['users'][number]>
  >({});

  const [_location, navigate] = useLocation();
  const [_match, params] = useRoute('/users/:id?');

  const query = useRef({
    page: 0,
    search: '',
    sort: 'lastSeen',
    direction: -1,
  });
  const { page, search, sort, direction } = query.current;
  const [_searchKey, setSearchKey] = useState(0);
  const setSearch = (search: string) => {
    query.current.search = search;
    doSearch();
    setSearchKey(k => k + 1);
  };
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
    const { page, search, sort, direction } = query.current;
    const { users, total, pages }: GetUsersRes = await rpcReq('users.list', {
      page,
      search,
      sort,
      direction,
    });
    setPages(pages);
    setTotal(total);
    setUsers(users);
    setUserLookup(prev => ({
      ...prev,
      ...Object.fromEntries(users.map(u => [u.username, u])),
    }));
    setLoading(false);
  };
  const getUsersRef = useRef<() => Promise<void>>(getUsers);
  getUsersRef.current = getUsers;

  useEffect(() => {
    getUsers();
  }, []);

  const doSearch = useMemo(
    () =>
      debounce(() => {
        query.current.page = 0;
        getUsersRef.current?.();
      }, 500),
    [],
  );

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

  const selectedUser = useMemo(() => {
    if (!params?.id) return null;
    const user =
      userLookup[params.id] ?? users.find(u => u.username === params.id);
    return user ?? null;
  }, [params?.id, userLookup, users]);

  const _selectedUserName = selectedUser?.username ?? 'SELECT A USER';

  const toggleAddUser = () => {
    setShowCreateUser(!showCreateUser);
    setShowCredentials(false);
    setUsername('');
    setError('');
  };

  const toggleCredentials = () => {
    setShowCredentials(!showCredentials);
    setShowCreateUser(false);
    if (!userless) setUsername(myUser?.username ?? '');
    setError('');
  };

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
        err = await rpcReq('users.passwd', myUser?.username, password);
      } else {
        err = await rpcReq('users.create', username, password);
      }
      setModalLoading(false);
      if (!err) {
        if (showCredentials && userless) logout();
        else hideModals();
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

  return (
    <>
      <NavHeader title="Users">
        <span style={{ flex: 1 }} />
        <Button
          normal
          data-tooltip={userless ? 'Enable user sign-in' : 'Change password'}
          onClick={toggleCredentials}
        >
          {userless ? (
            <>
              <IconCirclePlus />
              Enable Users
            </>
          ) : (
            <>
              <IconLock />
              Change Password
            </>
          )}
        </Button>
        {!userless && selectedUser?.isOwner && (
          <Button normal onClick={toggleAddUser} data-tooltip="Add a new user">
            <IconUserPlus />
            Add User
          </Button>
        )}
      </NavHeader>
      <PageContent>
        <SideNav />
        <div className="generic-container players-container">
          <div className="player-table-container">
            <NavBar>
              <Input
                type="text"
                placeholder="Search Users..."
                value={search}
                onChange={setSearch}
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
                    {users.map(u => (
                      <tr
                        onClick={() => navigate(`/users/${u.username}`)}
                        className={u.username === params?.id ? 'active' : ''}
                        key={u.username}
                      >
                        <td>
                          {u.username || 'Admin'}
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
              <Footer className="pagination-footer">
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
                    Showing {users.length} of {total}
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
          {/* <div className="player-inspector-container">
            <NavBar>{selectedUserName}</NavBar>
            <div className="player-inspector"></div>
          </div> */}
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
                  <p>Updating credentials for user "{username}""</p>
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
