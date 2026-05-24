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
