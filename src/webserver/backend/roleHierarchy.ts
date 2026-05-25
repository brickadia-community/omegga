import {
  decodePermissions,
  EMPTY_PERMISSIONS,
  mergePermissionSets,
  resolveAllScopes,
  resolveScope,
  type PermissionSet,
} from './permissions';
import { type Scope } from './scopes';
import { getContextDeps } from './trpc';
import type { IStoreRole, IStoreUser } from './types';

export function getActorHighestOrder(
  actor: IStoreUser,
  actorRoles: IStoreRole[],
  scope: Scope,
  allRolePermissions?: PermissionSet[],
): number {
  let highest = -1;
  for (const role of actorRoles) {
    const perms = decodePermissions(role.permissions);
    const resolved = resolveAllScopes(perms, []);
    if (resolved[scope]) {
      highest = Math.max(highest, role.order);
    }
  }
  if (highest < 0) {
    const userPerms = actor.permissions ?? EMPTY_PERMISSIONS;
    if (resolveScope(userPerms, allRolePermissions ?? [], scope))
      return Infinity;
  }
  return highest;
}

export function canManageRole(
  actorOrder: number,
  targetRole: IStoreRole,
): boolean {
  return actorOrder > targetRole.order;
}

export function actorHasAllPermissions(
  actorEffective: PermissionSet,
  granting: PermissionSet,
): boolean {
  const actorScopes = resolveAllScopes(actorEffective, []);
  const grantingScopes = resolveAllScopes(granting, []);
  for (const [scope, granted] of Object.entries(grantingScopes)) {
    if (granted && !actorScopes[scope as Scope]) return false;
  }
  return true;
}

export function getActorEffectivePermissions(
  user: IStoreUser,
  userRoles: IStoreRole[],
): PermissionSet {
  const rolePerms = userRoles.map(r => decodePermissions(r.permissions));
  return mergePermissionSets(
    user.permissions ?? EMPTY_PERMISSIONS,
    ...rolePerms,
  );
}

export function validateHierarchy(
  actor: IStoreUser,
  actorRoles: IStoreRole[],
  targetRole: IStoreRole,
  requiredScope: Scope,
  allRolePermissions?: PermissionSet[],
): string | null {
  if (actor.isOwner) return null;
  const order = getActorHighestOrder(
    actor,
    actorRoles,
    requiredScope,
    allRolePermissions,
  );
  if (order < 0) return `missing permission: ${requiredScope}`;
  if (!canManageRole(order, targetRole))
    return `cannot manage role "${targetRole.name}" (order ${targetRole.order}) from order ${order}`;
  return null;
}

export async function checkRoleHierarchy(
  user: IStoreUser,
  role: IStoreRole & { _id: string },
  scope: Scope,
): Promise<string | null> {
  if (user.isOwner) return null;
  const { database } = getContextDeps();
  const actorRoles = await database.getUserAssignedRoles(user);
  const rolePerms = await database.getUserRolePermissions(user);
  return validateHierarchy(user, actorRoles, role, scope, rolePerms);
}
