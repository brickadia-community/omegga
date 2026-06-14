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
  TextArea,
  Toggle,
} from '@components';
import { useHasScope, useMobileInspector, useRequireScope } from '@hooks';
import { useStore } from '@nanostores/react';
import {
  IconGripVertical,
  IconPlus,
  IconRotate,
  IconShield,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { AnimatePresence, Reorder } from 'motion/react';
import { useMemo, useState } from 'react';
import { Route, Switch, useLocation, useRoute } from 'wouter';
import { Permissions } from '../../permissions';
import { $user } from '../../stores/user';
import { trpc } from '../../trpc';
import { DefaultPermissions } from '../users/DefaultPermissions';
import { RoleInspector } from './RoleInspector';

export const RoleList = () => {
  const canAccess = useRequireScope(Permissions.RoleList);
  const canEdit = useHasScope(Permissions.RoleEdit);
  const canViewUsers = useHasScope(Permissions.UserList);
  const myUser = useStore($user);

  const [_location, navigate] = useLocation();
  const [_match, params] = useRoute('/roles/:id?');
  const { onBack, swipeHandlers, inspectorOpen } = useMobileInspector(
    !!params?.id,
    '/roles',
  );

  const rolesQuery = trpc.role.list.useQuery();
  const createMutation = trpc.role.create.useMutation();
  const reorderMutation = trpc.role.reorder.useMutation();
  const utils = trpc.useUtils();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [reorderMode, setReorderMode] = useState(false);

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);

  const myMaxOrder = useMemo(() => {
    if (myUser?.isOwner) return Infinity;
    const myRoleIds = myUser?.roles ?? [];
    let max = -1;
    for (const r of roles) {
      if (myRoleIds.includes(r.id)) {
        const perms = r.permissions as any;
        const hasEdit =
          perms?.root === 'all' ||
          perms?.domains?.role === 'all' ||
          perms?.scopes?.['role.edit'] === true;
        if (hasEdit) max = Math.max(max, r.order);
      }
    }
    return max;
  }, [myUser, roles]);

  const canReorder = canEdit && myMaxOrder > 0;
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const displayRoles = useMemo(() => {
    let list = roles;
    if (orderedIds.length > 0) {
      list = orderedIds
        .map(id => roles.find(r => r.id === id))
        .filter(Boolean) as typeof roles;
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        r =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [roles, orderedIds, search]);

  const canDrag = canReorder && reorderMode && !search;

  const handleReorder = (newOrder: string[]) => {
    setOrderedIds(newOrder);
  };

  const commitReorder = async () => {
    if (orderedIds.length === 0) return;
    const manageable = orderedIds.filter(id => {
      const r = roles.find(r => r.id === id);
      return r && r.order < myMaxOrder;
    });
    if (manageable.length === 0) return;
    await reorderMutation.mutateAsync({ orderedIds: manageable });
    setOrderedIds([]);
    utils.role.invalidate();
  };

  const openCreate = () => {
    setShowCreate(true);
    setName('');
    setDescription('');
    setError('');
  };

  const hideModals = () => {
    setShowCreate(false);
    setName('');
    setDescription('');
    setError('');
  };

  const submitCreate = async () => {
    setError('');
    if (!name.trim()) return;
    setModalLoading(true);
    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim(),
      });
      setModalLoading(false);
      if (typeof result === 'string') {
        setError(result);
        return;
      }
      hideModals();
      rolesQuery.refetch();
      if (result?.id) navigate(`/roles/${result.id}`);
    } catch (e) {
      setModalLoading(false);
      setError('Failed to create role');
    }
  };

  if (!canAccess) return null;

  return (
    <>
      <NavHeader title="Roles" onBack={onBack}>
        {canEdit && (
          <Button main boxy onClick={openCreate}>
            <IconPlus />
            Create Role
          </Button>
        )}
      </NavHeader>
      <PageContent>
        <SideNav />
        <div
          className={`generic-container players-container ${inspectorOpen ? 'inspector-open' : ''}`}
          {...swipeHandlers}
        >
          <div className="player-table-container">
            {canViewUsers && (
              <NavBar attached>
                <Button
                  normal
                  boxy
                  className="tab-button"
                  onClick={() => navigate('/users')}
                >
                  <IconUsers />
                  Users
                </Button>
                <Button main boxy className="tab-button active">
                  <IconShield />
                  Roles
                </Button>
                <span style={{ flex: 1 }} />
              </NavBar>
            )}
            <NavBar attached>
              <Input
                type="text"
                placeholder="Search Roles..."
                value={search}
                onChange={s => setSearch(s)}
              />
              <span style={{ flex: 1 }} />
              {canReorder && (
                <Toggle
                  value={reorderMode}
                  onChange={setReorderMode}
                  disabled={!!search}
                  tooltip={reorderMode ? 'Exit reorder mode' : 'Reorder roles'}
                  icon={<IconGripVertical size={16} color="white" />}
                />
              )}
              <Button
                icon
                normal
                style={{ marginLeft: 8 }}
                data-tooltip="Refresh role list"
                onClick={() => rolesQuery.refetch()}
              >
                <IconRotate />
              </Button>
            </NavBar>
            <div className="players-list">
              <Scroll>
                <Reorder.Group
                  axis="y"
                  values={displayRoles.map(r => r.id)}
                  onReorder={handleReorder}
                  as="table"
                  className="br-table"
                >
                  <thead>
                    <tr>
                      {canDrag && (
                        <th className="no-sort" style={{ width: 32 }}>
                          <IconGripVertical size={16} />
                        </th>
                      )}
                      <th
                        className="no-sort"
                        style={{ textAlign: 'left', width: '40%' }}
                      >
                        Name
                      </th>
                      <th className="no-sort" style={{ textAlign: 'left' }}>
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRoles.map(role => {
                      const aboveMe = role.order >= myMaxOrder;
                      const draggable = canDrag && !aboveMe;
                      return (
                        <Reorder.Item
                          key={role.id}
                          value={role.id}
                          as="tr"
                          className={role.id === params?.id ? 'active' : ''}
                          onClick={() => navigate(`/roles/${role.id}`)}
                          onDragEnd={commitReorder}
                          dragListener={draggable}
                          whileDrag={{ zIndex: 10, position: 'relative' }}
                        >
                          {canDrag && (
                            <td
                              style={{
                                cursor: draggable ? 'grab' : 'default',
                                width: 32,
                              }}
                            >
                              <IconGripVertical
                                size={16}
                                style={{ opacity: aboveMe ? 0.25 : 1 }}
                              />
                            </td>
                          )}
                          <td style={{ fontWeight: 'bold' }}>{role.name}</td>
                          <td className="muted-text">{role.description}</td>
                        </Reorder.Item>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr
                      className={params?.id === 'default' ? 'active' : ''}
                      onClick={() => navigate('/roles/default')}
                    >
                      {canDrag && <td style={{ width: 32 }} />}
                      <td style={{ fontWeight: 'bold' }}>Everyone</td>
                      <td className="muted-text">
                        Base permissions for all users
                      </td>
                    </tr>
                  </tfoot>
                </Reorder.Group>
              </Scroll>
              <Loader active={rolesQuery.isLoading} size="huge">
                Loading Roles
              </Loader>
            </div>
          </div>
          <Switch>
            <Route path="/roles/default" component={DefaultPermissions} />
            <Route path="/roles/:id" component={RoleInspector} />
            <Route>
              <div className="player-inspector-container">
                <NavBar attached>SELECT A ROLE</NavBar>
                <div className="player-inspector" />
              </div>
            </Route>
          </Switch>
          <AnimatePresence>
            {showCreate && (
              <Dimmer visible>
                <Loader active={modalLoading} size="huge">
                  Creating
                </Loader>
                <Modal visible={!modalLoading}>
                  <Header>Create New Role</Header>
                  <PopoutContent>
                    <p>
                      Create a new role with a name and optional description.
                    </p>
                    {error && <p style={{ color: 'red' }}>Error: {error}</p>}
                  </PopoutContent>
                  <div className="popout-inputs">
                    <Input
                      placeholder="Role name"
                      type="text"
                      value={name}
                      onChange={n => setName(n.slice(0, 64))}
                    />
                    <TextArea
                      placeholder="Description (optional)"
                      value={description}
                      onChange={d => setDescription(d.slice(0, 512))}
                      rows={3}
                    />
                    {name.length >= 64 && (
                      <p style={{ color: 'orange', fontSize: 13 }}>
                        Name is at the 64 character limit
                      </p>
                    )}
                    {description.length >= 512 && (
                      <p style={{ color: 'orange', fontSize: 13 }}>
                        Description is at the 512 character limit
                      </p>
                    )}
                  </div>
                  <Footer>
                    <Button
                      main
                      disabled={
                        !name.trim() ||
                        name.trim().length > 64 ||
                        description.length > 512
                      }
                      onClick={submitCreate}
                    >
                      <IconPlus />
                      Create
                    </Button>
                    <div style={{ flex: 1 }} />
                    <Button normal onClick={hideModals}>
                      <IconX />
                      Cancel
                    </Button>
                  </Footer>
                </Modal>
              </Dimmer>
            )}
          </AnimatePresence>
        </div>
      </PageContent>
    </>
  );
};
