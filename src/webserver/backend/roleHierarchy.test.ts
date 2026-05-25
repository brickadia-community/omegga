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
  checkPermissionEscalation,
  getActorEffectivePermissions,
  getActorHighestOrder,
  validateHierarchy,
} from './roleHierarchy';
import { ScopeName } from './scopes';
import type { IStoreRole, IStoreUser } from './types';

let roleIdCounter = 0;
function makeRole(
  order: number,
  scopes: Partial<Record<string, boolean>> = {},
  root: RootLevel = RootLevel.Off,
): IStoreRole & { _id: string } {
  return {
    _id: `role-${++roleIdCounter}`,
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

// --- getActorHighestOrder ---

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

  it('returns Infinity when scope comes from default perms (via allRolePermissions)', () => {
    const user = makeUser(false);
    const defaultPerms: PermissionSet[] = [
      { root: RootLevel.Off, domains: {}, scopes: { [ScopeName.RoleEdit]: true } },
    ];
    expect(getActorHighestOrder(user, [], ScopeName.RoleEdit, defaultPerms)).toBe(Infinity);
  });

  it('role-based order takes precedence over Infinity fallback', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.RoleEdit]: true },
    });
    const roles = [makeRole(3, { [ScopeName.RoleEdit]: true })];
    expect(getActorHighestOrder(user, roles, ScopeName.RoleEdit)).toBe(3);
  });

  it('without allRolePermissions and no direct perms, returns -1', () => {
    const user = makeUser(false);
    expect(getActorHighestOrder(user, [], ScopeName.RoleEdit)).toBe(-1);
  });
});

// --- canManageRole ---

describe('canManageRole', () => {
  it('allows managing roles with strictly lower order', () => {
    expect(canManageRole(5, makeRole(3))).toBe(true);
    expect(canManageRole(5, makeRole(4))).toBe(true);
    expect(canManageRole(2, makeRole(1))).toBe(true);
  });

  it('rejects managing roles with equal order', () => {
    expect(canManageRole(5, makeRole(5))).toBe(false);
    expect(canManageRole(1, makeRole(1))).toBe(false);
  });

  it('rejects managing roles with higher order', () => {
    expect(canManageRole(5, makeRole(8))).toBe(false);
    expect(canManageRole(1, makeRole(2))).toBe(false);
  });
});

// --- actorHasAllPermissions ---

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

  it('actor with root All covers all permissions', () => {
    const actor: PermissionSet = { root: RootLevel.All, domains: {}, scopes: {} };
    const granting: PermissionSet = {
      root: RootLevel.Off,
      domains: { server: DomainLevel.All },
      scopes: { [ScopeName.ChatSend]: true },
    };
    expect(actorHasAllPermissions(actor, granting)).toBe(true);
  });

  it('actor with domain All covers scopes in that domain', () => {
    const actor: PermissionSet = {
      root: RootLevel.Off,
      domains: { server: DomainLevel.All },
      scopes: {},
    };
    const granting: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ServerStart]: true },
    };
    expect(actorHasAllPermissions(actor, granting)).toBe(true);
  });

  it('actor with domain Read does not cover write scopes', () => {
    const actor: PermissionSet = {
      root: RootLevel.Off,
      domains: { server: DomainLevel.Read },
      scopes: {},
    };
    const granting: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ServerStart]: true },
    };
    expect(actorHasAllPermissions(actor, granting)).toBe(false);
  });
});

// --- getActorEffectivePermissions ---

describe('getActorEffectivePermissions', () => {
  it('merges user permissions with role permissions', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    });
    const rolePerms: PermissionSet[] = [
      { root: RootLevel.Off, domains: {}, scopes: { [ScopeName.PlayerList]: true } },
    ];
    const effective = getActorEffectivePermissions(user, rolePerms);
    expect(effective.scopes[ScopeName.ChatSend]).toBe(true);
    expect(effective.scopes[ScopeName.PlayerList]).toBe(true);
  });

  it('takes the highest root level from all sources', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: {},
    });
    const rolePerms: PermissionSet[] = [
      { root: RootLevel.Read, domains: {}, scopes: {} },
    ];
    const effective = getActorEffectivePermissions(user, rolePerms);
    expect(effective.root).toBe(RootLevel.Read);
  });

  it('merges multiple role permission sets', () => {
    const user = makeUser(false);
    const rolePerms: PermissionSet[] = [
      { root: RootLevel.Off, domains: {}, scopes: { [ScopeName.ChatSend]: true } },
      { root: RootLevel.Off, domains: {}, scopes: { [ScopeName.PlayerList]: true } },
      { root: RootLevel.Read, domains: {}, scopes: {} },
    ];
    const effective = getActorEffectivePermissions(user, rolePerms);
    expect(effective.scopes[ScopeName.ChatSend]).toBe(true);
    expect(effective.scopes[ScopeName.PlayerList]).toBe(true);
    expect(effective.root).toBe(RootLevel.Read);
  });
});

// --- validateHierarchy ---

describe('validateHierarchy', () => {
  it('owner bypasses all hierarchy checks', () => {
    const owner = makeUser(true);
    const target = makeRole(999);
    expect(validateHierarchy(owner, [], target, ScopeName.RoleEdit)).toBeNull();
  });

  it('returns error when actor has no roles granting required scope', () => {
    const user = makeUser(false);
    const target = makeRole(1);
    expect(validateHierarchy(user, [], target, ScopeName.RoleEdit)).toContain('missing permission');
  });

  it('rejects when target order >= actor order', () => {
    const user = makeUser(false);
    const actorRoles = [makeRole(5, { [ScopeName.RoleEdit]: true })];
    expect(validateHierarchy(user, actorRoles, makeRole(5), ScopeName.RoleEdit)).toContain('cannot manage');
    expect(validateHierarchy(user, actorRoles, makeRole(6), ScopeName.RoleEdit)).toContain('cannot manage');
  });

  it('allows when target order < actor order', () => {
    const user = makeUser(false);
    const actorRoles = [makeRole(5, { [ScopeName.RoleEdit]: true })];
    expect(validateHierarchy(user, actorRoles, makeRole(4), ScopeName.RoleEdit)).toBeNull();
    expect(validateHierarchy(user, actorRoles, makeRole(1), ScopeName.RoleEdit)).toBeNull();
  });

  it('user cannot edit the role that grants them the scope', () => {
    const user = makeUser(false);
    const myRole = makeRole(3, { [ScopeName.RoleEdit]: true });
    expect(validateHierarchy(user, [myRole], myRole, ScopeName.RoleEdit)).toContain('cannot manage');
  });

  it('uses the correct scope for hierarchy check (grantRole vs roleEdit)', () => {
    const user = makeUser(false);
    const editRole = makeRole(5, { [ScopeName.RoleEdit]: true });
    const grantRole = makeRole(3, { [ScopeName.UserGrantRole]: true });
    const target = makeRole(4);
    expect(validateHierarchy(user, [editRole], target, ScopeName.RoleEdit)).toBeNull();
    expect(validateHierarchy(user, [grantRole], target, ScopeName.UserGrantRole)).toContain('cannot manage');
  });
});

// --- checkPermissionEscalation ---

describe('checkPermissionEscalation', () => {
  it('owner bypasses all escalation checks', () => {
    const owner = makeUser(true);
    const proposed: PermissionSet = { root: RootLevel.All, domains: {}, scopes: {} };
    expect(checkPermissionEscalation(owner, [], proposed)).toBeNull();
  });

  it('allows granting permissions the actor has', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true, [ScopeName.PlayerList]: true },
    });
    const proposed: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    };
    expect(checkPermissionEscalation(user, [], proposed)).toBeNull();
  });

  it('blocks granting permissions the actor lacks', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    });
    const proposed: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ServerStart]: true },
    };
    const err = checkPermissionEscalation(user, [], proposed);
    expect(err).toContain('cannot grant permission');
    expect(err).toContain('server.start');
  });

  it('actor can grant permissions they have from roles', () => {
    const user = makeUser(false);
    const rolePerms: PermissionSet[] = [
      { root: RootLevel.Off, domains: {}, scopes: { [ScopeName.ServerStart]: true } },
    ];
    const proposed: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ServerStart]: true },
    };
    expect(checkPermissionEscalation(user, rolePerms, proposed)).toBeNull();
  });

  it('proposed permissions are evaluated standalone (no role fallback)', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    });
    const rolePerms: PermissionSet[] = [
      { root: RootLevel.Off, domains: {}, scopes: { [ScopeName.ServerStart]: true } },
    ];
    const proposed: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    };
    // proposed only grants chat.send — should pass even though rolePerms has server.start
    // (proving proposed is not merged with rolePerms for evaluation)
    expect(checkPermissionEscalation(user, rolePerms, proposed)).toBeNull();
  });

  it('blocks root:all when actor only has specific scopes', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    });
    const proposed: PermissionSet = { root: RootLevel.All, domains: {}, scopes: {} };
    expect(checkPermissionEscalation(user, [], proposed)).not.toBeNull();
  });

  it('blocks domain:all when actor only has some scopes in domain', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ServerStatus]: true },
    });
    const proposed: PermissionSet = {
      root: RootLevel.Off,
      domains: { server: DomainLevel.All },
      scopes: {},
    };
    expect(checkPermissionEscalation(user, [], proposed)).not.toBeNull();
  });

  it('allows domain:all when actor has domain:all', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: { server: DomainLevel.All },
      scopes: {},
    });
    const proposed: PermissionSet = {
      root: RootLevel.Off,
      domains: { server: DomainLevel.All },
      scopes: {},
    };
    expect(checkPermissionEscalation(user, [], proposed)).toBeNull();
  });

  it('allows empty proposed permissions', () => {
    const user = makeUser(false);
    expect(checkPermissionEscalation(user, [], EMPTY_PERMISSIONS)).toBeNull();
  });
});

// --- regression tests for specific escalation vectors ---

describe('regression: privilege escalation vectors', () => {
  it('cannot grant a role containing permissions the actor lacks', () => {
    const actor: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true, [ScopeName.UserGrantRole]: true },
    };
    const rolePerms: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ServerStart]: true, [ScopeName.ServerStop]: true },
    };
    expect(actorHasAllPermissions(actor, rolePerms)).toBe(false);
  });

  it('can grant a role when actor has superset of permissions', () => {
    const actor: PermissionSet = {
      root: RootLevel.Off,
      domains: { server: DomainLevel.All },
      scopes: { [ScopeName.ChatSend]: true },
    };
    const rolePerms: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ServerStart]: true },
    };
    expect(actorHasAllPermissions(actor, rolePerms)).toBe(true);
  });

  it('escalation check uses effective perms (direct + roles + defaults)', () => {
    // actor has chat.send directly, server.start from a role
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    });
    const rolePerms: PermissionSet[] = [
      { root: RootLevel.Off, domains: {}, scopes: { [ScopeName.ServerStart]: true } },
    ];
    // granting both should succeed
    const proposed: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true, [ScopeName.ServerStart]: true },
    };
    expect(checkPermissionEscalation(user, rolePerms, proposed)).toBeNull();

    // granting something neither source has should fail
    const bad: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.UserDelete]: true },
    };
    expect(checkPermissionEscalation(user, rolePerms, bad)).not.toBeNull();
  });

  it('domain:read actor cannot escalate to domain:all via proposed permissions', () => {
    const user = makeUser(false, {
      root: RootLevel.Off,
      domains: { server: DomainLevel.Read },
      scopes: {},
    });
    const proposed: PermissionSet = {
      root: RootLevel.Off,
      domains: { server: DomainLevel.All },
      scopes: {},
    };
    expect(checkPermissionEscalation(user, [], proposed)).not.toBeNull();
  });

  it('root:read actor cannot escalate to root:all', () => {
    const user = makeUser(false, {
      root: RootLevel.Read,
      domains: {},
      scopes: {},
    });
    const proposed: PermissionSet = { root: RootLevel.All, domains: {}, scopes: {} };
    expect(checkPermissionEscalation(user, [], proposed)).not.toBeNull();
  });
});
