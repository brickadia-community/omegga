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

export function resolveScope(
  userPerms: PermissionSet,
  defaultPerms: PermissionSet | null,
  scopeName: Scope,
): boolean {
  if (scopeName === ScopeName.SessionInfo) return true;

  const scopeDef = SCOPES[scopeName];

  // 1. Root
  if (userPerms.root === RootLevel.All) return true;
  if (userPerms.root === RootLevel.Read) return scopeDef.readOnly;

  // 2. Domain
  const domain = userPerms.domains[scopeDef.domain as Domain];
  if (domain === DomainLevel.All) return true;
  if (domain === DomainLevel.Read) return scopeDef.readOnly;

  // 3. Scope
  const scopeVal = userPerms.scopes[scopeName];
  if (scopeVal === true) return true;
  if (scopeVal === false) return false;

  // 4. Fall back to defaults
  if (defaultPerms) return resolveScope(defaultPerms, null, scopeName);

  return false;
}

export function resolveAllScopes(
  userPerms: PermissionSet,
  defaultPerms: PermissionSet | null,
): Record<Scope, boolean> {
  const result = {} as Record<Scope, boolean>;
  for (const scope of ALL_SCOPES) {
    result[scope] = resolveScope(userPerms, defaultPerms, scope);
  }
  return result;
}

export function userHasScope(
  user: { isOwner: boolean; permissions?: PermissionSet },
  scope: Scope,
  defaultPerms: PermissionSet | null,
): boolean {
  if (user.isOwner) return true;
  return resolveScope(
    user.permissions ?? EMPTY_PERMISSIONS,
    defaultPerms,
    scope,
  );
}
