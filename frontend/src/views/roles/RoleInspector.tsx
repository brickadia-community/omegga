import {
  AnimatedDropdown,
  Button,
  Footer,
  Input,
  Loader,
  NavBar,
  Scroll,
  TextArea,
  useConfirm,
} from '@components';
import { useHasScope } from '@hooks';
import { useStore } from '@nanostores/react';
import {
  IconCaretDown,
  IconCaretUp,
  IconDeviceFloppy,
  IconTrash,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Permissions } from '../../permissions';
import { $user } from '../../stores/user';
import { trpc } from '../../trpc';
import {
  PermissionEditor,
  type PermissionSet,
} from '../users/PermissionEditor';

export const RoleInspector = () => {
  const [_match, params] = useRoute('/roles/:id');
  const [_loc, navigate] = useLocation();
  const roleId = params?.id ?? '';

  const hasEdit = useHasScope(Permissions.RoleEdit);
  const hasGrantPerm = useHasScope(Permissions.RoleGrantPermission);
  const myUser = useStore($user);

  const rolesQuery = trpc.role.list.useQuery();

  const myMaxOrder = useMemo(() => {
    if (myUser?.isOwner) return Infinity;
    const myRoleIds = myUser?.roles ?? [];
    let max = -1;
    for (const r of rolesQuery.data ?? []) {
      if (myRoleIds.includes(r.id)) {
        const perms = r.permissions as any;
        const hasRoleEdit =
          perms?.root === 'all' ||
          perms?.domains?.role === 'all' ||
          perms?.scopes?.['role.edit'] === true;
        if (hasRoleEdit) max = Math.max(max, r.order);
      }
    }
    return max;
  }, [myUser, rolesQuery.data]);

  const roleQuery = trpc.role.get.useQuery(
    { id: roleId },
    { enabled: !!roleId },
  );
  const updateMutation = trpc.role.update.useMutation();
  const deleteMutation = trpc.role.delete.useMutation();
  const utils = trpc.useUtils();

  const role = roleQuery.data;
  const canManage = role ? myUser?.isOwner || role.order < myMaxOrder : false;
  const canEdit = hasEdit && canManage;
  const canGrantPerm = hasGrantPerm && canManage;

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPerms, setEditPerms] = useState<PermissionSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    if (role) {
      setEditName(role.name);
      setEditDescription(role.description);
      setEditPerms(role.permissions as unknown as PermissionSet);
      setError('');
    }
  }, [role]);

  const dirty = useMemo(() => {
    if (!role) return false;
    if (editName !== role.name) return true;
    if (editDescription !== role.description) return true;
    if (
      editPerms &&
      JSON.stringify(editPerms) !== JSON.stringify(role.permissions)
    )
      return true;
    return false;
  }, [role, editName, editDescription, editPerms]);

  const save = useCallback(async () => {
    if (!role || !editPerms) return;
    setSaving(true);
    setError('');
    try {
      const updates: any = { id: roleId };
      if (editName !== role.name) updates.name = editName;
      if (editDescription !== role.description)
        updates.description = editDescription;
      if (JSON.stringify(editPerms) !== JSON.stringify(role.permissions))
        updates.permissions = editPerms;

      const err = await updateMutation.mutateAsync(updates);
      if (err) {
        setError(err);
      } else {
        roleQuery.refetch();
        utils.role.list.invalidate();
      }
    } catch (e) {
      setError('Failed to save');
    }
    setSaving(false);
  }, [role, editName, editDescription, editPerms, roleId]);

  const confirm = useConfirm({ title: 'Delete Role' });

  const handleDelete = async () => {
    setShowActions(false);
    const ok = await confirm.prompt(
      <>
        <p>
          Delete role <b>{role?.name}</b>?
        </p>
        <p>This will unassign it from all users.</p>
      </>,
    );
    if (!ok) return;
    const err = await deleteMutation.mutateAsync({ id: roleId });
    if (err) {
      setError(err);
    } else {
      utils.role.list.invalidate();
      navigate('/roles');
    }
  };

  if (!roleId) return null;

  return (
    <div className="player-inspector-container">
      <NavBar attached>
        {role?.name ?? 'Role'}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <Button normal disabled={saving || !dirty} onClick={save}>
            <IconDeviceFloppy />
            Save
          </Button>
        )}
      </NavBar>
      <div className={`player-inspector ${canEdit ? 'has-footer' : ''}`}>
        <div className="player-view">
          <Loader active={roleQuery.isLoading} size="huge">
            Loading Role
          </Loader>
          {role && (
            <Scroll>
              <div className="player-info">
                {error && <div className="perm-error">{error}</div>}
                {canEdit ? (
                  <div className="role-inspector-stats">
                    <label>Name</label>
                    <Input
                      type="text"
                      value={editName}
                      onChange={n => setEditName(n.slice(0, 64))}
                    />
                    <label>Description</label>
                    <TextArea
                      value={editDescription}
                      onChange={d => setEditDescription(d.slice(0, 512))}
                      placeholder="No description"
                      rows={3}
                    />
                    <label>Order</label>
                    <span>{role.order}</span>
                  </div>
                ) : (
                  <div className="stats">
                    <div className="stat">
                      <b>Name:</b> {role.name}
                    </div>
                    <div className="stat">
                      <b>Description:</b> {role.description || 'No description'}
                    </div>
                    <div className="stat">
                      <b>Order:</b> {role.order}
                    </div>
                  </div>
                )}
                <div className="section-header">Permissions</div>
                {editPerms && (
                  <PermissionEditor
                    perms={editPerms}
                    onChange={canGrantPerm ? setEditPerms : undefined}
                  />
                )}
              </div>
            </Scroll>
          )}
        </div>
      </div>
      {canEdit && role && (
        <Footer attached>
          <span style={{ flex: 1 }} />
          <div className="widgets-container">
            <Button normal boxy onClick={() => setShowActions(!showActions)}>
              {showActions ? <IconCaretDown /> : <IconCaretUp />}
              Actions
            </Button>
            <AnimatedDropdown
              visible={showActions}
              direction="up"
              className="widgets-list widgets-list-up"
            >
              <Button error onClick={handleDelete}>
                <IconTrash />
                Delete Role
              </Button>
            </AnimatedDropdown>
          </div>
        </Footer>
      )}
      {confirm.children}
    </div>
  );
};
