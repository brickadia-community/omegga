export interface BRColor {
  r: number;
  b: number;
  g: number;
  a: number;
}

export interface BRBanListEntry {
  bannerId: string;
  created: string;
  expires: string;
  reason: string;
}

export interface BRBanList {
  banList: Record<string, BRBanListEntry>;
}

export interface BRRolePermission {
  name: string;
  state: 'Allowed' | 'Unchanged' | 'Forbidden';
}

export interface BRRoleSetupEntry {
  name: string;
  permissions: BRRolePermission[];
  color: BRColor;
  bHasColor: boolean;
}

export interface BRRoleSetup {
  roles: BRRoleSetupEntry[];
  defaultRole: BRRoleSetupEntry;
  ownerRoleColor: BRColor;
  bOwnerRoleHasColor: boolean;
  version: string;
}

export interface BRRoleAssignments {
  savedPlayerRoles: Record<string, { roles: string[] }>;
}

export interface BRPlayerNameCache {
  savedPlayerNames: Record<string, string>;
}
