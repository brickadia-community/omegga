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

export function checkPermissionEscalation(
  actor: IStoreUser,
  actorRolePermissions: PermissionSet[],
  proposed: PermissionSet,
): string | null {
  if (actor.isOwner) return null;
  const effective = getActorEffectivePermissions(actor, actorRolePermissions);
  const myScopes = resolveAllScopes(effective, []);
  const grantedScopes = resolveAllScopes(proposed, []);
  for (const [scope, granted] of Object.entries(grantedScopes)) {
    if (granted && !myScopes[scope as Scope])
      return `cannot grant permission you do not have: ${scope}`;
  }
  return null;
}

export function getActorEffectivePermissions(
  user: IStoreUser,
  rolePermissions: PermissionSet[],
): PermissionSet {
  return mergePermissionSets(
    user.permissions ?? EMPTY_PERMISSIONS,
    ...rolePermissions,
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

export async function checkUserHierarchy(
  actor: IStoreUser,
  target: IStoreUser,
): Promise<string | null> {
  if (actor.isOwner) return null;
  if (target.isOwner) return 'cannot modify the owner';
  const { database } = getContextDeps();
  const targetRoles = await database.getUserAssignedRoles(target);
  if (targetRoles.length === 0) return null;
  const targetMaxOrder = Math.max(...targetRoles.map(r => r.order));
  const actorRoles = await database.getUserAssignedRoles(actor);
  const actorMaxOrder = Math.max(0, ...actorRoles.map(r => r.order));
  if (actorMaxOrder <= targetMaxOrder)
    return 'cannot modify a user with equal or higher role';
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
