import { describe, expect, it } from 'vitest';
import {
  DomainLevel,
  EMPTY_PERMISSIONS,
  mergePermissionSets,
  resolveAllScopes,
  resolveScope,
  RootLevel,
  type PermissionSet,
} from './permissions';
import { ScopeName } from './scopes';

describe('mergePermissionSets', () => {
  it('returns empty permissions for no inputs', () => {
    const result = mergePermissionSets();
    expect(result.root).toBe(RootLevel.Off);
    expect(result.domains).toEqual({});
    expect(result.scopes).toEqual({});
  });

  it('picks the highest root level', () => {
    const a: PermissionSet = { root: RootLevel.Read, domains: {}, scopes: {} };
    const b: PermissionSet = { root: RootLevel.All, domains: {}, scopes: {} };
    const c: PermissionSet = { root: RootLevel.Off, domains: {}, scopes: {} };
    expect(mergePermissionSets(a, b, c).root).toBe(RootLevel.All);
    expect(mergePermissionSets(a, c).root).toBe(RootLevel.Read);
    expect(mergePermissionSets(c).root).toBe(RootLevel.Off);
  });

  it('picks the highest domain level per domain', () => {
    const a: PermissionSet = {
      root: RootLevel.Off,
      domains: { chat: DomainLevel.Read, player: DomainLevel.None },
      scopes: {},
    };
    const b: PermissionSet = {
      root: RootLevel.Off,
      domains: { chat: DomainLevel.All, server: DomainLevel.Read },
      scopes: {},
    };
    const result = mergePermissionSets(a, b);
    expect(result.domains.chat).toBe(DomainLevel.All);
    expect(result.domains.player).toBeUndefined(); // None is implicit (absent)
    expect(result.domains.server).toBe(DomainLevel.Read);
  });

  it('ORs scope values (any true wins)', () => {
    const a: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true, [ScopeName.PlayerList]: false },
    };
    const b: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.PlayerList]: true, [ScopeName.ServerStart]: true },
    };
    const result = mergePermissionSets(a, b);
    expect(result.scopes[ScopeName.ChatSend]).toBe(true);
    expect(result.scopes[ScopeName.PlayerList]).toBe(true);
    expect(result.scopes[ScopeName.ServerStart]).toBe(true);
  });
});

describe('resolveScope', () => {
  it('always grants SessionInfo', () => {
    expect(resolveScope(EMPTY_PERMISSIONS, [], ScopeName.SessionInfo)).toBe(
      true,
    );
  });

  it('grants all scopes with root All', () => {
    const perms: PermissionSet = {
      root: RootLevel.All,
      domains: {},
      scopes: {},
    };
    expect(resolveScope(perms, [], ScopeName.ServerStart)).toBe(true);
    expect(resolveScope(perms, [], ScopeName.ChatSend)).toBe(true);
  });

  it('grants only readOnly scopes with root Read', () => {
    const perms: PermissionSet = {
      root: RootLevel.Read,
      domains: {},
      scopes: {},
    };
    expect(resolveScope(perms, [], ScopeName.ChatRecent)).toBe(true);
    expect(resolveScope(perms, [], ScopeName.ChatSend)).toBe(false);
  });

  it('grants via domain level', () => {
    const perms: PermissionSet = {
      root: RootLevel.Off,
      domains: { chat: DomainLevel.All },
      scopes: {},
    };
    expect(resolveScope(perms, [], ScopeName.ChatSend)).toBe(true);
    expect(resolveScope(perms, [], ScopeName.ChatRecent)).toBe(true);
    expect(resolveScope(perms, [], ScopeName.PlayerList)).toBe(false);
  });

  it('grants via explicit scope', () => {
    const perms: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ServerStart]: true },
    };
    expect(resolveScope(perms, [], ScopeName.ServerStart)).toBe(true);
    expect(resolveScope(perms, [], ScopeName.ServerStop)).toBe(false);
  });

  it('falls back to role permissions', () => {
    const userPerms = EMPTY_PERMISSIONS;
    const rolePerms: PermissionSet[] = [
      {
        root: RootLevel.Off,
        domains: {},
        scopes: { [ScopeName.ChatSend]: true },
      },
    ];
    expect(resolveScope(userPerms, rolePerms, ScopeName.ChatSend)).toBe(true);
    expect(resolveScope(userPerms, rolePerms, ScopeName.ServerStart)).toBe(
      false,
    );
  });

  it('merges multiple role permission sets for fallback', () => {
    const userPerms = EMPTY_PERMISSIONS;
    const rolePerms: PermissionSet[] = [
      {
        root: RootLevel.Off,
        domains: {},
        scopes: { [ScopeName.ChatSend]: true },
      },
      { root: RootLevel.Off, domains: { server: DomainLevel.All }, scopes: {} },
    ];
    expect(resolveScope(userPerms, rolePerms, ScopeName.ChatSend)).toBe(true);
    expect(resolveScope(userPerms, rolePerms, ScopeName.ServerStart)).toBe(
      true,
    );
    expect(resolveScope(userPerms, rolePerms, ScopeName.PlayerList)).toBe(
      false,
    );
  });

  it('user permissions take priority over role permissions', () => {
    const userPerms: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    };
    expect(resolveScope(userPerms, [], ScopeName.ChatSend)).toBe(true);
  });
});

describe('resolveAllScopes', () => {
  it('resolves all scopes into a boolean record', () => {
    const perms: PermissionSet = {
      root: RootLevel.Off,
      domains: {},
      scopes: { [ScopeName.ChatSend]: true },
    };
    const result = resolveAllScopes(perms, []);
    expect(result[ScopeName.ChatSend]).toBe(true);
    expect(result[ScopeName.ServerStart]).toBe(false);
    expect(result[ScopeName.SessionInfo]).toBe(true);
  });
});
