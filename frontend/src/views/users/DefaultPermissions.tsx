import { Button, Loader, NavBar, Scroll } from '@components';
import { useHasScope } from '@hooks';
import { useStore } from '@nanostores/react';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Permissions } from '../../permissions';
import { $user } from '../../stores/user';
import { trpc } from '../../trpc';
import {
  mergePermissionSets,
  PermissionEditor,
  resolveEffective,
  type PermissionSet,
} from './PermissionEditor';

export const DefaultPermissions = () => {
  const canView = useHasScope(Permissions.RoleList);
  const canEdit = useHasScope(Permissions.RoleDefaultPermissions);
  const myUser = useStore($user);

  const defaultPermsQuery = trpc.role.defaultPermissions.get.useQuery(
    undefined,
    { enabled: canView },
  );
  const rolesQuery = trpc.role.list.useQuery(undefined, {
    enabled: canEdit && !myUser?.isOwner,
  });
  const setDefaultPermsMutation =
    trpc.role.defaultPermissions.set.useMutation();

  const grantableScopes = useMemo(() => {
    if (myUser?.isOwner) return undefined;
    if (!rolesQuery.data)
      return resolveEffective({ root: 'off', domains: {}, scopes: {} });
    const myRoleIds = myUser?.roles ?? [];
    const myRolePerms = rolesQuery.data
      .filter(r => myRoleIds.includes(r.id))
      .map(r => r.permissions as PermissionSet);
    if (myRolePerms.length === 0)
      return resolveEffective({ root: 'off', domains: {}, scopes: {} });
    return resolveEffective(mergePermissionSets(...myRolePerms));
  }, [myUser, rolesQuery.data]);

  const [editPerms, setEditPerms] = useState<PermissionSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (defaultPermsQuery.data) {
      setEditPerms({
        root: (defaultPermsQuery.data.root as PermissionSet['root']) ?? 'off',
        domains:
          (defaultPermsQuery.data.domains as PermissionSet['domains']) ?? {},
        scopes:
          (defaultPermsQuery.data.scopes as PermissionSet['scopes']) ?? {},
      });
    }
  }, [defaultPermsQuery.data]);

  const dirty = useMemo(() => {
    if (!editPerms || !defaultPermsQuery.data) return false;
    return JSON.stringify(editPerms) !== JSON.stringify(defaultPermsQuery.data);
  }, [editPerms, defaultPermsQuery.data]);

  const save = useCallback(async () => {
    if (!editPerms) return;
    setSaving(true);
    setError('');
    try {
      const err = await setDefaultPermsMutation.mutateAsync(editPerms);
      if (err) setError(err);
      else defaultPermsQuery.refetch();
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    }
    setSaving(false);
  }, [editPerms]);

  return (
    <div className="player-inspector-container">
      <NavBar attached>
        Default Permissions
        <span style={{ flex: 1 }} />
        {canEdit && (
          <Button normal disabled={saving || !dirty} onClick={save}>
            <IconDeviceFloppy />
            Save
          </Button>
        )}
      </NavBar>
      <div className="player-inspector">
        <div className="player-view">
          <Loader active={defaultPermsQuery.isLoading} size="huge">
            Loading Defaults
          </Loader>
          <div className="player-info">
            {editPerms && (
              <Scroll>
                <div className="stats">
                  <div className="stat">
                    These permissions apply to all users who don't have an
                    explicit override set.
                  </div>
                </div>
                {error && <div className="perm-error">{error}</div>}
                <div className="section-header">Permissions</div>
                <PermissionEditor
                  perms={editPerms}
                  onChange={canEdit ? setEditPerms : undefined}
                  actorScopes={grantableScopes}
                />
              </Scroll>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
