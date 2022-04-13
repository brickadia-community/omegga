import type Player from './player';
import type Omegga from './server';

export interface IOmeggaOptions {
  noauth?: boolean;
  noplugin?: boolean;
  noweb?: boolean;
  debug?: boolean;
}

export interface IServerStatus {
  serverName: string;
  description: string;
  bricks: number;
  components: number;
  time: number;
  players: {
    name: string;
    ping: number;
    time: number;
    roles: string[];
    address: string;
    id: string;
  }[];
}

export type IMinigameList = {
  index: number;
  name: string;
  numMembers: number;
  owner: {
    name: string;
    id: string;
  };
}[];

export type IPlayerPositions = {
  player: Player;
  pawn: string;
  pos: number[];
  isDead: boolean;
}[];

export type ILogMinigame = {
  name: string;
  ruleset: string;
  members: Player[];
  teams: {
    name: string;
    team: string;
    color: number[];
    members: Player[];
  }[];
};

export interface PluginStore<
  Storage extends Record<string, unknown> = Record<string, unknown>
> {
  get<T extends keyof Storage>(key: T): Promise<Storage[T]>;
  set<T extends keyof Storage>(key: T, value: Storage[T]): Promise<void>;
  delete(key: string): Promise<void>;
  wipe(): Promise<void>;
  count(): Promise<number>;
  keys(): Promise<(keyof Storage)[]>;
}

export type PluginConfig<
  T extends Record<string, unknown> = Record<string, unknown>
> = T;

export interface OmeggaPluginClass<
  Config extends Record<string, unknown> = Record<string, unknown>,
  Storage extends Record<string, unknown> = Record<string, unknown>
> {
  new (
    omegga: Omegga,
    config: PluginConfig<Config>,
    store: PluginStore<Storage>
  ): OmeggaPlugin<Config>;
}

export class OmeggaPlugin<
  Config extends Record<string, unknown> = Record<string, unknown>,
  Storage extends Record<string, unknown> = Record<string, unknown>
> {
  omegga: Omegga;
  config: PluginConfig<Config>;
  store: PluginStore<Storage>;

  constructor(
    omegga: Omegga,
    config: PluginConfig<Config>,
    store: PluginStore<Storage>
  ) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  }

  async init(): Promise<void | { registeredCommands: string[] }> {}
  async stop(): Promise<void> {}
  pluginEvent?(event: string, from: string, ...args: any[]): Promise<unknown>;
}
