// Legacy type exports. These are kept for backward compatibility with frontend
// imports during the tRPC migration. Once the frontend is fully migrated to
// tRPC (where types are inferred from AppRouter), this file can be deleted.

import { type IPluginDocumentation } from '@/plugin';
import type { readBrdbMeta } from '@util/brdb';
import Database from './database';
import type { PermissionSet } from './permissions';
import type { Scope } from './scopes';
import {
  type IFrontendBanEntry,
  type IStoreBanHistory,
  type IStoreKickHistory,
  type IStoreUser,
  type IUserAgo,
  type IUserHistory,
  type IUserNote,
} from './types';

export type OmeggaSocketData = {
  roles: { type: 'role'; name: string }[];
  version: string;
  brickadiaVersion: number | null;
  canLogOut: boolean;
  now: number;
  userless: boolean;
  isSteam: boolean;
  update: {
    canCheck: boolean;
    lastCheck: boolean | null;
  };
  user: {
    username: string;
    isOwner: boolean;
    roles: string[];
    permissions: PermissionSet;
    resolvedScopes: Record<Scope, boolean>;
  };
};

export type GetPlayersRes = {
  pages: number;
  total: number;
  players: (IUserHistory & IUserAgo & { ban?: IFrontendBanEntry })[];
};

export type GetPlayerRes = Omit<IUserHistory, 'nameHistory'> & {
  banHistory: (IStoreBanHistory & {
    duration?: number;
    bannerName?: string;
  })[];
  kickHistory: (IStoreKickHistory & {
    kickerName?: string;
  })[];
  notes: IUserNote[];
  nameHistory: {
    name: string;
    displayName: string;
    date: number;
    ago?: number;
  }[];
} & IUserAgo & {
    isHost: boolean;
    isOnline: boolean;
    currentBan: IFrontendBanEntry | null;
    roles: { name: string; color: string }[];
  };

export type GetPluginsRes = {
  name: string;
  documentation: IPluginDocumentation;
  path: string;
  isLoaded: boolean;
  isEnabled: boolean;
}[];

export type GetPluginRes = {
  name: string;
  format: string;
  info: Record<string, unknown>;
  documentation: IPluginDocumentation;
  config: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  objCount: number;
  path: string;
  isLoaded: boolean;
  isEnabled: boolean;
};

export type GetUsersRes = {
  pages: number;
  total: number;
  users: (IStoreUser & IUserAgo)[];
};

export type HistoryRes = Awaited<ReturnType<Database['getChats']>>;

export type WorldRevisionsRes = {
  index: number;
  date: number;
  note: string;
}[];

// derived from the implementation so the frontend type can't drift from the
// actual router output
export type WorldMetaRes = NonNullable<ReturnType<typeof readBrdbMeta>>;
