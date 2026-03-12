// Legacy type exports — these are kept for backward compatibility with frontend
// imports during the tRPC migration. Once the frontend is fully migrated to
// tRPC (where types are inferred from AppRouter), this file can be deleted.

import { IPluginDocumentation } from '@/plugin';
import Database from './database';
import {
  IFrontendBanEntry,
  IStoreBanHistory,
  IStoreKickHistory,
  IStoreUser,
  IUserAgo,
  IUserHistory,
  IUserNote,
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

export type WorldMetaRes = {
  meta: {
    world: {
      environment: string;
    };
    bundle: {
      type: 'World';
      iD: string;
      name: string;
      version: string;
      tags: string[];
      authors: string[];
      createdAt: string;
      updatedAt: string;
      description: string;
      dependencies: string[];
    };
  };
  owners: {
    id: string;
    name: string;
    display_name: string;
    entity_count: number;
    brick_count: number;
    component_count: number;
    wire_count: number;
  }[];
};
