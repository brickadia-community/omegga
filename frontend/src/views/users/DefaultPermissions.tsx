import { Button, Loader, NavBar, Scroll } from '@components';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { trpc } from '../../trpc';
import { PermissionEditor, type PermissionSet } from './PermissionEditor';

export const DefaultPermissions = () => {
  const defaultPermsQuery = trpc.user.defaultPermissions.get.useQuery();
  const setDefaultPermsMutation =
    trpc.user.defaultPermissions.set.useMutation();

  const [editPerms, setEditPerms] = useState<PermissionSet | null>(null);
  const [saving, setSaving] = useState(false);

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
    try {
      const err = await setDefaultPermsMutation.mutateAsync(editPerms);
      if (err) console.error('Failed to save default permissions:', err);
      else defaultPermsQuery.refetch();
    } catch (e) {
      console.error('Failed to save default permissions:', e);
    }
    setSaving(false);
  }, [editPerms]);

  return (
    <div className="player-inspector-container">
      <NavBar attached>
        Default Permissions
        <span style={{ flex: 1 }} />
        <Button
          normal
          boxy
          disabled={saving || !dirty}
          onClick={save}
        >
          <IconDeviceFloppy />
          Save
        </Button>
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
                <div className="section-header">Permissions</div>
                <PermissionEditor perms={editPerms} onChange={setEditPerms} />
              </Scroll>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
