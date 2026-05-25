import { SCOPES, ScopeName, type Domain, type Scope } from './scopes';

export enum RootLevel {
  All = 'all',
  Read = 'read',
  Off = 'off',
}

export enum DomainLevel {
  All = 'all',
  Read = 'read',
  None = 'none',
}

export interface PermissionSet {
  root: RootLevel;
  domains: Partial<Record<Domain, DomainLevel>>;
  scopes: Partial<Record<Scope, boolean>>;
}

export const EMPTY_PERMISSIONS: PermissionSet = {
  root: RootLevel.Off,
  domains: {},
  scopes: {},
};

// NeDB rejects field names containing dots, so we encode/decode
// scope keys (e.g. "server.status") for storage
const DOT_ENCODE = /\./g;
const DOT_DECODE = /:/g;

function encodeKeys<V>(obj: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(obj)) out[k.replace(DOT_ENCODE, ':')] = v;
  return out;
}

function decodeKeys<V>(obj: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(obj)) out[k.replace(DOT_DECODE, '.')] = v;
  return out;
}

export interface StoredPermissionSet {
  root: RootLevel;
  domains: Partial<Record<string, DomainLevel>>;
  scopes: Record<string, boolean>;
}

export function encodePermissions(p: PermissionSet): StoredPermissionSet {
  return { root: p.root, domains: p.domains, scopes: encodeKeys(p.scopes) };
}

export function decodePermissions(
  p: StoredPermissionSet | null | undefined,
): PermissionSet {
  if (!p) return EMPTY_PERMISSIONS;
  return {
    root: p.root ?? RootLevel.Off,
    domains: p.domains ?? {},
    scopes: decodeKeys(p.scopes ?? {}),
  };
}

const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

const ROOT_RANK: Record<RootLevel, number> = {
  [RootLevel.Off]: 0,
  [RootLevel.Read]: 1,
  [RootLevel.All]: 2,
};

const DOMAIN_RANK: Record<DomainLevel, number> = {
  [DomainLevel.None]: 0,
  [DomainLevel.Read]: 1,
  [DomainLevel.All]: 2,
};

const ROOT_BY_RANK: RootLevel[] = [RootLevel.Off, RootLevel.Read, RootLevel.All];
const DOMAIN_BY_RANK: DomainLevel[] = [
  DomainLevel.None,
  DomainLevel.Read,
  DomainLevel.All,
];

export function mergePermissionSets(...sets: PermissionSet[]): PermissionSet {
  let rootRank = 0;
  const domains: Partial<Record<Domain, DomainLevel>> = {};
  const scopes: Partial<Record<Scope, boolean>> = {};

  for (const s of sets) {
    rootRank = Math.max(rootRank, ROOT_RANK[s.root] ?? 0);
    for (const [d, level] of Object.entries(s.domains) as [Domain, DomainLevel][]) {
      const cur = domains[d];
      const curRank = cur ? DOMAIN_RANK[cur] : 0;
      const newRank = DOMAIN_RANK[level] ?? 0;
      if (newRank > curRank) domains[d] = level;
    }
    for (const [sc, val] of Object.entries(s.scopes) as [Scope, boolean][]) {
      if (val) scopes[sc] = true;
    }
  }

  return {
    root: ROOT_BY_RANK[rootRank],
    domains,
    scopes,
  };
}

export function resolveScope(
  userPerms: PermissionSet,
  rolePermissions: PermissionSet[],
  scopeName: Scope,
): boolean {
  if (scopeName === ScopeName.SessionInfo) return true;

  const scopeDef = SCOPES[scopeName];

  // 1. Root
  if (userPerms.root === RootLevel.All) return true;
  if (userPerms.root === RootLevel.Read && scopeDef.readOnly) return true;

  // 2. Domain
  const domain = userPerms.domains[scopeDef.domain as Domain];
  if (domain === DomainLevel.All) return true;
  if (domain === DomainLevel.Read && scopeDef.readOnly) return true;

  // 3. Scope (additive only - explicit true grants, false/absent falls through)
  if (userPerms.scopes[scopeName] === true) return true;

  // 4. Fall back to merged role permissions
  if (rolePermissions.length > 0) {
    const merged = mergePermissionSets(...rolePermissions);
    return resolveScope(merged, [], scopeName);
  }

  return false;
}

export function resolveAllScopes(
  userPerms: PermissionSet,
  rolePermissions: PermissionSet[],
): Record<Scope, boolean> {
  const result = {} as Record<Scope, boolean>;
  for (const scope of ALL_SCOPES) {
    result[scope] = resolveScope(userPerms, rolePermissions, scope);
  }
  return result;
}

export function userHasScope(
  user: { isOwner: boolean; permissions?: PermissionSet },
  scope: Scope,
  rolePermissions: PermissionSet[],
): boolean {
  if (user.isOwner) return true;
  return resolveScope(
    user.permissions ?? EMPTY_PERMISSIONS,
    rolePermissions,
    scope,
  );
}
