import type { GetUsersRes } from '@backend/api';
import {
  Button,
  Footer,
  Loader,
  NavBar,
  Scroll,
  useConfirm,
} from '@components';
import { useHasScope } from '@hooks';
import { useStore } from '@nanostores/react';
import { IconBan, IconDeviceFloppy, IconTrash } from '@tabler/icons-react';
import { duration } from '@utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Permissions } from '../../permissions';
import { $user, $usersRefresh } from '../../stores/user';
import { trpc } from '../../trpc';
import { PermissionEditor, type PermissionSet } from './PermissionEditor';

export const UserInspector = ({ selfUser }: { selfUser?: string }) => {
  const [_match, params] = useRoute('/users/:id');
  const [_loc, navigate] = useLocation();
  const myUser = useStore($user);

  const canEditPerms = useHasScope(Permissions.UserPermissions);
  const canBan = useHasScope(Permissions.UserBan);
  const canDelete = useHasScope(Permissions.UserDelete);

  const isSelfMode = !!selfUser;
  const selectedUsername = selfUser ?? params?.id ?? '';

  const users = trpc.user.list.useQuery(undefined, {
    enabled: !isSelfMode,
  });
  const selfQuery = trpc.user.self.useQuery(undefined, {
    enabled: isSelfMode,
  });

  const user = useMemo(() => {
    if (isSelfMode) {
      return selfQuery.data ?? null;
    }
    if (!users.data) return null;
    return (
      users.data.users.find(
        (u: GetUsersRes['users'][number]) => u.username === selectedUsername,
      ) ?? null
    );
  }, [isSelfMode, selfQuery.data, users.data, selectedUsername]);

  const loading = isSelfMode ? selfQuery.isLoading : users.isLoading;

  const defaultPermsQuery = trpc.user.defaultPermissions.get.useQuery(
    undefined,
    { enabled: canEditPerms },
  );
  const permsMutation = trpc.user.permissions.useMutation();
  const banMutation = trpc.user.ban.useMutation();
  const deleteMutation = trpc.user.delete.useMutation();
  const banConfirm = useConfirm();
  const deleteConfirm = useConfirm();

  const [editPerms, setEditPerms] = useState<PermissionSet | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      const root = user.permissions?.root;
      setEditPerms({
        root: root === 'all' || root === 'read' ? root : 'off',
        domains: (user.permissions?.domains as PermissionSet['domains']) ?? {},
        scopes: (user.permissions?.scopes as PermissionSet['scopes']) ?? {},
      });
    } else {
      setEditPerms(null);
    }
  }, [user?.username, user?.permissions]);

  useEffect(() => {
    if (!isSelfMode && !loading && !user && selectedUsername) {
      navigate('/users');
    }
  }, [isSelfMode, loading, user, selectedUsername]);

  const savePerms = useCallback(async () => {
    if (!editPerms || !selectedUsername) return;
    setSaving(true);
    try {
      const err = await permsMutation.mutateAsync({
        username: selectedUsername,
        permissions: editPerms,
      });
      if (err) console.error('Failed to save permissions:', err);
      else if (isSelfMode) selfQuery.refetch();
      else users.refetch();
    } catch (e) {
      console.error('Failed to save permissions:', e);
    }
    setSaving(false);
  }, [editPerms, selectedUsername]);

  const dirty = useMemo(() => {
    if (!editPerms || !user?.permissions) return false;
    return JSON.stringify(editPerms) !== JSON.stringify(user.permissions);
  }, [editPerms, user?.permissions]);

  const handleBan = async (banned: boolean) => {
    const action = banned ? 'Disable' : 'Re-enable';
    if (
      !(await banConfirm.prompt(
        <>
          <p>
            {action} user <b>{selectedUsername}</b>?
          </p>
          <p>
            {banned
              ? 'Disabled users cannot sign in to the web UI.'
              : 'This will allow the user to sign in again.'}
          </p>
        </>,
      ))
    )
      return;
    const err = await banMutation.mutateAsync({
      username: selectedUsername,
      banned,
    });
    if (err) console.error('Failed to ban user:', err);
    else users.refetch();
  };

  const handleDelete = async () => {
    if (
      !(await deleteConfirm.prompt(
        <>
          <p>
            Permanently delete user <b>{selectedUsername}</b>?
          </p>
          <p>
            This will remove the account and all of its permissions. This action
            cannot be undone.
          </p>
        </>,
      ))
    )
      return;
    const err = await deleteMutation.mutateAsync({
      username: selectedUsername,
    });
    if (err) console.error('Failed to delete user:', err);
    else {
      navigate('/users');
      users.refetch();
      $usersRefresh.set($usersRefresh.get() + 1);
    }
  };

  const isSelf =
    (myUser?.username || 'Admin') === (selectedUsername || 'Admin');
  const showActions = user && !user.isOwner && !isSelf && (canBan || canDelete);

  const defaultPerms = defaultPermsQuery.data
    ? ({
        root: defaultPermsQuery.data.root,
        domains: defaultPermsQuery.data.domains,
        scopes: defaultPermsQuery.data.scopes,
      } as PermissionSet)
    : null;

  const now = Date.now();

  return (
    <>
      <div className="player-inspector-container">
        <NavBar attached>
          {user?.username || (isSelfMode ? 'Account' : 'SELECT A USER')}
          <span style={{ flex: 1 }} />
          {user && canEditPerms && !user.isOwner && (
            <Button
              normal
              disabled={saving || !dirty}
              onClick={savePerms}
              data-tooltip="Save Permissions"
            >
              <IconDeviceFloppy />
              Save
            </Button>
          )}
        </NavBar>
        <div className={`player-inspector ${showActions ? 'has-footer' : ''}`}>
          <div className="player-view">
            <Loader active={loading} size="huge">
              Loading User
            </Loader>
            <div className="player-info">
              {!loading && user && (
                <Scroll>
                  <div className="stats">
                    <div className="stat">
                      <b>Username:</b> {user.username || 'Admin'}
                    </div>
                    <div className="stat">
                      <b>Owner:</b> {user.isOwner ? 'Yes' : 'No'}
                    </div>
                    <div className="stat">
                      <b>Disabled:</b> {user.isBanned ? 'Yes' : 'No'}
                    </div>
                    <div className="stat">
                      <b>Last Active:</b>{' '}
                      {user.lastOnline
                        ? duration(now - user.lastOnline) + ' ago'
                        : 'Never'}
                    </div>
                    <div className="stat">
                      <b>Created:</b> {duration(now - user.created)} ago
                    </div>
                  </div>
                  {canEditPerms && !user.isOwner && editPerms && (
                    <>
                      <div className="section-header">Permissions</div>
                      <PermissionEditor
                        perms={editPerms}
                        onChange={setEditPerms}
                        defaultPerms={defaultPerms}
                      />
                    </>
                  )}
                  {user.isOwner && (
                    <>
                      <div className="section-header">Permissions</div>
                      <div className="stats">
                        <div className="stat">Owner has all permissions.</div>
                      </div>
                    </>
                  )}
                </Scroll>
              )}
            </div>
          </div>
        </div>
        {showActions && (
          <Footer attached>
            {canBan && (
              <Button
                boxy
                normal={!user.isBanned}
                warn={!!user.isBanned}
                onClick={() => handleBan(!user.isBanned)}
              >
                <IconBan />
                {user.isBanned ? 'Re-enable' : 'Disable'}
              </Button>
            )}
            <span style={{ flex: 1 }} />
            {canDelete && (
              <Button boxy error onClick={handleDelete}>
                <IconTrash />
                Delete
              </Button>
            )}
          </Footer>
        )}
      </div>
      {banConfirm.children}
      {deleteConfirm.children}
    </>
  );
};
