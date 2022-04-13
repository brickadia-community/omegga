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
  index: string;
  name: string;
  numMembers: string;
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

export interface PluginStore {
  get<T>(key: string): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  wipe(): Promise<void>;
  count(): Promise<number>;
  keys(): Promise<string[]>;
}

export class OmeggaPlugin {
  constructor(
    _omegga: Omegga,
    _config: Record<string, unknown>,
    _store: PluginStore
  ) {}

  async init(): Promise<void | { registeredCommands: string[] }> {}
  async stop(): Promise<void> {}
  async pluginEvent?(
    event: string,
    from: string,
    ...args: any[]
  ): Promise<unknown>;
}
