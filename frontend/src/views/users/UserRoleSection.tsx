import { Button } from '@components';
import { useHasScope } from '@hooks';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Permissions } from '../../permissions';
import { trpc } from '../../trpc';

export const UserRoleSection = ({
  username,
  isSelf,
  roleIds,
}: {
  username: string;
  isSelf: boolean;
  roleIds: string[];
}) => {
  const canGrantRole = useHasScope(Permissions.UserGrantRole);
  const canViewRoles = useHasScope(Permissions.RoleList);

  const rolesQuery = trpc.role.list.useQuery(undefined, {
    enabled: canViewRoles,
  });

  const grantMutation = trpc.user.grantRole.useMutation();
  const revokeMutation = trpc.user.revokeRole.useMutation();
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allRoles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);

  const assignedRoles = useMemo(
    () =>
      allRoles
        .filter(r => roleIds.includes(r.id))
        .sort((a, b) => a.order - b.order),
    [allRoles, roleIds],
  );

  const availableRoles = useMemo(
    () => allRoles.filter(r => !roleIds.includes(r.id)),
    [allRoles, roleIds],
  );

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (e.target && !ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const handleGrant = async (roleId: string) => {
    await grantMutation.mutateAsync({ username, roleId });
    if (isSelf) utils.user.self.invalidate();
    else utils.user.list.invalidate();
    setOpen(false);
  };

  const handleRevoke = async (roleId: string) => {
    await revokeMutation.mutateAsync({ username, roleId });
    if (isSelf) utils.user.self.invalidate();
    else utils.user.list.invalidate();
  };

  if (!canViewRoles) return null;

  return (
    <>
      <div className="section-header">Roles</div>
      <div
        className="br-player-list"
        style={{
          padding: 12,
          position: 'relative',
          maxWidth: 'calc(100% - 32px)',
          marginRight: 16,
          alignItems: 'stretch',
        }}
      >
        {assignedRoles.map(role => (
          <div className="br-player-item" key={role.id}>
            <Link href={`/roles/${role.id}`} className="selected">
              {role.name}
            </Link>
            {canGrantRole && !isSelf && (
              <Button
                icon
                warn
                data-tooltip="Revoke role"
                onClick={() => handleRevoke(role.id)}
              >
                <IconMinus />
              </Button>
            )}
          </div>
        ))}
        {assignedRoles.length === 0 && (
          <div
            className="br-player-item muted-text"
            style={{ fontWeight: 'bold' }}
          >
            No roles assigned
          </div>
        )}
        {canGrantRole && !isSelf && availableRoles.length > 0 && (
          <div className="player-search" ref={ref}>
            <Button normal boxy onClick={() => setOpen(!open)}>
              <IconPlus size={16} />
              Add Role
            </Button>
            {open && (
              <div className="options">
                {availableRoles.map(role => (
                  <div
                    key={role.id}
                    className="option"
                    onClick={() => handleGrant(role.id)}
                  >
                    {role.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
