import { describe, expect, it } from 'vitest';
import {
  DomainLevel,
  EMPTY_PERMISSIONS,
  RootLevel,
  encodePermissions,
  type PermissionSet,
} from './permissions';
import {
  actorHasAllPermissions,
  canManageRole,
  getActorEffectivePermissions,
  getActorHighestOrder,
  validateHierarchy,
} from './roleHierarchy';
import { ScopeName } from './scopes';
import type { IStoreRole, IStoreUser } from './types';

function makeRole(
  order: number,
  scopes: Partial<Record<string, boolean>> = {},
  root: RootLevel = RootLevel.Off,
): IStoreRole & { _id: string } {
  return {
    _id: `role-${order}`,
    type: 'webRole',
    name: `Role ${order}`,
    description: '',
    order,
    permissions: encodePermissions({
      root,
      domains: {},
      scopes,
    } as PermissionSet),
  };
}

function makeUser(
  isOwner = false,
  perms: PermissionSet = EMPTY_PERMISSIONS,
): IStoreUser {
  return {
    type: 'user',
    created: 0,
    lastOnline: 0,
    username: 'testuser',
    hash: '',
    isOwner,
    roles: [],
    playerId: '',
    permissions: perms,
  };
}

describe('getActorHighestOrder', () => {
  it('returns -1 when no roles or user perms grant the scope', () => {
    const user = makeUser();
    const roles = [makeRole(3, { [ScopeName.ChatSend]: true })];
    expect(getActorHighestOrder(user, roles, ScopeName.RoleEdit, [])).toBe(-1);
  });

  it('returns the highest order among roles granting the scope', () => {
    const user = makeUser();
    const roles = [
      makeRole(2, { [ScopeName.RoleEdit]: true }),
      makeRole(5, { [ScopeName.RoleEdit]: true }),
      makeRole(3, { [ScopeName.ChatSend]: true }),
    ];
    expect(getActorHighestOrder(user, roles, ScopeName.RoleEdit)).toBe(5);
  });

  it('handles root All granting all scopes', () => {
    const user = makeUser();
    const roles = [makeRole(7, {}, RootLevel.All)];
    expect(getActorHighestOrder(user, roles, ScopeName.RoleEdit)).toBe(7);
  });

  it('returns Infinity when user has scope from direct perms but no roles', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.RoleEdit]: true },
    });
    expect(getActorHighestOrder(user, [], ScopeName.RoleEdit)).toBe(Infinity);
  });
});

describe('canManageRole', () => {
  it('allows managing roles with lower order', () => {
    const target = makeRole(3);
    expect(canManageRole(5, target)).toBe(true);
  });

  it('rejects managing roles with equal order', () => {
    const target = makeRole(5);
    expect(canManageRole(5, target)).toBe(false);
  });

  it('rejects managing roles with higher order', () => {
    const target = makeRole(8);
    expect(canManageRole(5, target)).toBe(false);
  });
});

describe('actorHasAllPermissions', () => {
  it('returns true when actor has all granted permissions', () => {
    const actor: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true, [ScopeName.PlayerList]: true },
    };
    const granting: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    };
    expect(actorHasAllPermissions(actor, granting)).toBe(true);
  });

  it('returns false when actor is missing a granted permission', () => {
    const actor: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    };
    const granting: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true, [ScopeName.ServerStart]: true },
    };
    expect(actorHasAllPermissions(actor, granting)).toBe(false);
  });

  it('actor with root All has all permissions', () => {
    const actor: PermissionSet = {
      root: RootLevel.All,
      domains: {},
      scopes: {},
    };
    const granting: PermissionSet = {
      root: RootLevel.Off,
      domains: { server: DomainLevel.All },
      scopes: { [ScopeName.ChatSend]: true },
    };
    expect(actorHasAllPermissions(actor, granting)).toBe(true);
  });
});

describe('getActorEffectivePermissions', () => {
  it('merges user permissions with role permissions', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    });
    const roles = [makeRole(3, { [ScopeName.PlayerList]: true })];
    const effective = getActorEffectivePermissions(user, roles);
    expect(effective.scopes[ScopeName.ChatSend]).toBe(true);
    expect(effective.scopes[ScopeName.PlayerList]).toBe(true);
  });
});

describe('validateHierarchy', () => {
  it('owner bypasses all hierarchy checks', () => {
    const owner = makeUser(true);
    const target = makeRole(999);
    expect(validateHierarchy(owner, [], target, ScopeName.RoleEdit)).toBeNull();
  });

  it('returns error when actor has no roles granting required scope', () => {
    const user = makeUser(false);
    const target = makeRole(1);
    const err = validateHierarchy(user, [], target, ScopeName.RoleEdit);
    expect(err).toContain('missing permission');
  });

  it('returns error when target role order >= actor order', () => {
    const user = makeUser(false);
    const actorRoles = [makeRole(5, { [ScopeName.RoleEdit]: true })];
    const target = makeRole(5);
    const err = validateHierarchy(user, actorRoles, target, ScopeName.RoleEdit);
    expect(err).toContain('cannot manage role');
  });

  it('allows when target role order < actor order', () => {
    const user = makeUser(false);
    const actorRoles = [makeRole(5, { [ScopeName.RoleEdit]: true })];
    const target = makeRole(4);
    expect(
      validateHierarchy(user, actorRoles, target, ScopeName.RoleEdit),
    ).toBeNull();
  });

  it('user with grantRole at order 5 cannot assign role at order 5', () => {
    const user = makeUser(false);
    const actorRoles = [makeRole(5, { [ScopeName.UserGrantRole]: true })];
    const target = makeRole(5);
    const err = validateHierarchy(
      user,
      actorRoles,
      target,
      ScopeName.UserGrantRole,
    );
    expect(err).toContain('cannot manage role');
  });

  it('user with grantRole at order 5 can assign role at order 4', () => {
    const user = makeUser(false);
    const actorRoles = [makeRole(5, { [ScopeName.UserGrantRole]: true })];
    const target = makeRole(4);
    expect(
      validateHierarchy(user, actorRoles, target, ScopeName.UserGrantRole),
    ).toBeNull();
  });
});
