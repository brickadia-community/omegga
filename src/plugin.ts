import {
  BRBanList,
  BRPlayerNameCache,
  BRRoleAssignments,
  BRRoleSetup,
} from '@brickadia/types';
import {
  ILogMinigame,
  IMinigameList,
  IPlayerPositions,
  IServerStatus,
} from '@omegga/types';
import type { ReadSaveObject, WriteSaveObject } from 'brs-js';
import type util from '@util';

declare global {
  export var Omegga: OmeggaLike;
  export var Player: StaticPlayer;
  export var OMEGGA_UTIL: typeof util;
}

export * from '@brickadia/types';
export * from '@omegga/types';
export { OmeggaPlugin };

export type OL = OmeggaLike;
export type OP = OmeggaPlugin;
export type PC<T extends Record<string, unknown> = Record<string, unknown>> =
  PluginConfig<T>;
export type PS<T extends Record<string, unknown> = Record<string, unknown>> =
  PluginStore<T>;

export interface BrickBounds {
  minBound: [number, number, number];
  maxBound: [number, number, number];
  center: [number, number, number];
}

export type BrickInteraction = {
  brick_name: string;
  player: { id: string; name: string; controller: string; pawn: string };
  position: [number, number, number];
};

export interface OmeggaPlayer {
  /** player name */
  name: string;

  /** player uuid */
  id: string;

  /** player controller id */
  controller: string;

  /** player state id */
  state: string;

  /**
   * Returns omegga
   */
  getOmegga(): OmeggaLike;

  /**
   * Clone a player
   */
  clone(): OmeggaPlayer;

  /**
   * Get raw player info (to feed into a constructor)
   */
  raw(): [string, string, string, string];

  /**
   * True if the player is the host
   */
  isHost(): boolean;

  /**
   * Clear player's bricks
   * @param quiet clear bricks quietly
   */
  clearBricks(quiet?: boolean): void;

  /**
   * Get player's roles, if any
   */
  getRoles(): readonly string[];

  /**
   * Get player's permissions in a map like `{"Bricks.ClearOwn": true, ...}`
   * @return permissions map
   */
  getPermissions(): Record<string, boolean>;

  /**
   * Get player's name color
   * @return 6 character hex string
   */
  getNameColor(): string;

  /**
   * Get player's position
   * @return [x, y, z] coordinates
   */
  getPosition(): Promise<[number, number, number]>;

  /**
   * Gets a user's ghost brick info (by uuid, name, controller, or player object)
   * @return ghost brick data
   */
  getGhostBrick(): Promise<{
    targetGrid: string;
    location: number[];
    orientation: string;
  }>;

  /**
   * gets a user's paint tool properties
   */
  getPaint(): Promise<{
    materialIndex: string;
    materialAlpha: string;
    material: string;
    color: number[];
  }>;

  /**
   * gets the bounds of the template in the user's clipboard (bounds of original selection box)
   * @return template bounds
   */
  getTemplateBounds(): Promise<BrickBounds>;

  /**
   * get bricks inside template bounds
   * @return BRS JS Save Data
   */
  getTemplateBoundsData(): Promise<ReadSaveObject>;

  /**
   * load bricks at ghost brick location
   * @param saveData player or player identifier
   */
  loadDataAtGhostBrick(
    saveData: WriteSaveObject,
    options?: {
      rotate?: boolean;
      offX?: number;
      offY?: number;
      offZ?: number;
      quiet?: boolean;
    }
  ): Promise<void>;
}

export interface StaticPlayer {
  /**
   * get a player's roles, if any
   * @param omegga omegga instance
   * @param id player uuid
   * @return list of roles
   */
  getRoles(omegga: OmeggaLike, id: string): readonly string[];

  /**
   * get a player's permissions in a map like `{"Bricks.ClearOwn": true, ...}`
   * @param omegga Omegga instance
   * @param id player uuid
   * @return permissions map
   */
  getPermissions(omegga: OmeggaLike, id: string): Record<string, boolean>;
}

export interface InjectedCommands {
  /** Get server status */
  getServerStatus(this: OmeggaLike): Promise<IServerStatus>;
  /** Get a list of minigames and their indices */
  listMinigames(this: OmeggaLike): Promise<IMinigameList>;
  /** Get all player positions and pawns */
  getAllPlayerPositions(this: OmeggaLike): Promise<IPlayerPositions>;
  /** Get minigames and members */
  getMinigames(this: OmeggaLike): Promise<ILogMinigame[]>;
}

export type OmeggaWrapperEvents = {
  line: (line: string) => void;
  closed: () => void;
  '*': (event: string, ...args: any) => void;
};

export interface MockEventEmitter {
  addListener(event: string, listener: Function): this;
  emit(event: string, ...args: any[]): boolean;
  eventNames(): (string | symbol)[];
  getMaxListeners(): number;
  listenerCount(event: string): number;
  listeners(event: string): Function[];
  off(event: string, listener: Function): this;
  on(event: string, listener: Function): this;
  once(event: string, listener: Function): this;
  prependListener(event: string, listener: Function): this;
  prependOnceListener(event: string, listener: Function): this;
  rawListeners(event: string): Function[];
  removeAllListeners(event?: string): this;
  removeListener(event: string, listener: Function): this;
  setMaxListeners(maxListeners: number): this;

  on(event: 'close', listener: () => void): this;
  on(event: 'line', listener: (line: string) => void): this;
  on(event: 'start', listener: (info: { map: string }) => void): this;
  on(event: 'version', listener: (version: number) => void): this;
  on(event: 'unauthorized', listener: () => void): this;
  on(event: 'join', listener: (player: OmeggaPlayer) => void): this;
  on(event: 'leave', listener: (player: OmeggaPlayer) => void): this;
  on(event: 'chat', listener: (name: string, message: string) => void): this;
  on(event: 'mapchange', listener: (info: { map: string }) => void): this;
  on(
    event: 'interact',
    listener: (interaction: BrickInteraction) => void
  ): this;
}

export interface OmeggaLike
  extends OmeggaCore,
    LogWrangling,
    InjectedCommands,
    MockEventEmitter {
  writeln(line: string): void;

  /** game CL verison*/
  version: number;

  /** list of players */
  players: OmeggaPlayer[];

  /** server host */
  host?: { id: string; name: string };

  /** server is started */
  started: boolean;
  /** server is starting */
  starting: boolean;
  /** server is stopping */
  stopping: boolean;
  /** current map */
  currentMap: string;

  /** path to config files */
  configPath: string;
  /** path to saves */
  savePath: string;
  /** path to presets */
  presetPath: string;
}

export interface OmeggaCore {
  /**
   * get a list of players
   * @return list of players {id: uuid, name: name} objects
   */
  getPlayers(): {
    id: string;
    name: string;
    controller: string;
    state: string;
  }[];

  /**
   * find a player by name, id, controller, or state
   * @param target - name, id, controller, or state
   */
  getPlayer(target: string): OmeggaPlayer;

  /**
   * find a player by rough name, prioritize exact matches and get fuzzier
   * @param name player name, fuzzy
   */
  findPlayerByName(name: string): OmeggaPlayer;

  /**
   * get the host's ID
   * @return Host Id
   */
  getHostId(): string;

  /**
   * broadcast messages to chat
   * messages are broken by new line
   * multiple arguments are additional lines
   * all messages longer than 512 characters are deleted automatically, though omegga wouldn't have sent them anyway
   * @param messages unescaped chat messages to send. may need to wrap messages with quotes
   */
  broadcast(...messages: string[]): void;

  /**
   * whisper messages to a player's chat
   * messages are broken by new line
   * multiple arguments are additional lines
   * all messages longer than 512 characters are deleted automatically, though omegga wouldn't have sent them anyway
   * @param target - player identifier or player object
   * @param messages - unescaped chat messages to send. may need to wrap messages with quotes
   */
  whisper(target: string | OmeggaPlayer, ...messages: string[]): void;

  /**
   * prints text to the middle of a player's screen
   * all messages longer than 512 characters are deleted automatically
   * @param target - player identifier or player object
   * @param message - unescaped chat messages to send. may need to wrap messages with quotes
   */
  middlePrint(target: string | OmeggaPlayer, message: string): void;

  /**
   * Save a minigame preset based on a minigame index
   * @param index minigame index
   * @param name preset name
   */
  saveMinigame(index: number, name: string): void;

  /**
   * Delete a minigame
   * @param index minigame index
   */
  deleteMinigame(index: number): void;

  /**
   * Reset a minigame
   * @param index minigame index
   */
  resetMinigame(index: number): void;

  /**
   * Force the next round in a minigame
   * @param index minigame index
   */
  nextRoundMinigame(index: number): void;

  /**
   * Load an Minigame preset
   * @param presetName preset name
   * @param owner owner id/name
   */
  loadMinigame(presetName: string, owner?: string): void;

  /**
   * Get all presets in the minigame folder and child folders
   */
  getMinigamePresets(): string[];

  /**
   * Reset the environment settings
   */
  resetEnvironment(): void;

  /**
   * Save an environment preset
   * @param presetName preset name
   */
  saveEnvironment(presetName: string): void;

  /**
   * Load an environment preset
   * @param presetName preset name
   */
  loadEnvironment(presetName: string): void;

  /**
   * G+et all presets in the environment folder and child folders
   */
  getEnvironmentPresets(): string[];

  /**
   * Clear a user's bricks (by uuid, name, controller, or player object)
   * @param target player or player identifier
   * @param quiet quietly clear bricks
   */
  clearBricks(target: string | { id: string }, quiet?: boolean): void;

  /**
   * Clear all bricks on the server
   * @param quiet quietly clear bricks
   */
  clearAllBricks(quiet?: boolean): void;

  /**
   * Save bricks under a name
   * @param saveName save file name
   */
  saveBricks(saveName: string): void;

  /**
   * Load bricks on the server
   */
  loadBricks(
    saveName: string,
    options?: { offX?: number; offY?: number; offZ?: number; quiet?: boolean }
  ): void;

  /**
   * Load bricks on the server into a player's clipbaord
   */
  loadBricksOnPlayer(
    saveName: string,
    player: string | OmeggaPlayer,
    options?: { offX?: number; offY?: number; offZ?: number }
  ): void;

  /**
   * Get all saves in the save folder and child folders
   */
  getSaves(): string[];

  /**
   * Checks if a save exists and returns an absolute path
   * @param saveName Save filename
   * @return Path to string
   */
  getSavePath(saveName: string): string;

  /**
   * unsafely load save data (wrap in try/catch)
   * @param saveName save file name
   * @param saveData BRS JS Save data
   */
  writeSaveData(saveName: string, saveData: WriteSaveObject): void;

  /**
   * unsafely read save data (wrap in try/catch)
   * @param saveName save file name
   * @param nobricks only read save header data
   * @return BRS JS Save Data
   */
  readSaveData(saveName: string, nobricks?: boolean): ReadSaveObject;

  /**
   * load bricks from save data and resolve when game finishes loading
   * @param saveData BRS JS Save data
   */
  loadSaveData(
    saveData: WriteSaveObject,
    options?: { offX?: number; offY?: number; offZ?: number; quiet?: boolean }
  ): Promise<void>;

  /**
   * load bricks from save data and resolve when game finishes loading
   * @param saveData BRS JS Save data
   * @param player Player name/id or player object
   */
  loadSaveDataOnPlayer(
    saveData: WriteSaveObject,
    player: string | OmeggaPlayer,
    options?: { offX?: number; offY?: number; offZ?: number }
  ): Promise<void>;

  /**
   * get current bricks as save data
   */
  getSaveData(): Promise<ReadSaveObject>;

  /**
   * Change server map
   * @param map Map name
   */
  changeMap(map: string): Promise<boolean>;

  /**
   * Get up-to-date role setup from RoleSetup.json
   */
  getRoleSetup(): BRRoleSetup;

  /**
   * Get up-to-date role assignments from RoleAssignment.json
   */
  getRoleAssignments(): BRRoleAssignments;

  /**
   * Get up-to-date ban list from BanList.json
   */
  getBanList(): BRBanList;

  /**
   * Get up-to-date name cache from PlayerNameCache.json
   */
  getNameCache(): BRPlayerNameCache;
}

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

export default abstract class OmeggaPlugin<
  Config extends Record<string, unknown> = Record<string, unknown>,
  Storage extends Record<string, unknown> = Record<string, unknown>
> {
  /*   omegga: OmeggaLike;
  config: PluginConfig<Config>;
  store: PluginStore<Storage>;

  constructor(
    omegga: OmeggaLike,
    config: PluginConfig<Config>,
    store: PluginStore<Storage>
  ) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  } */
  omegga: OmeggaLike;
  config: PluginConfig<Config>;
  store: PluginStore<Storage>;

  constructor(
    omegga: OmeggaLike,
    config: PluginConfig<Config>,
    store: PluginStore<Storage>
  ) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  }

  abstract init(): Promise<void | { registeredCommands?: string[] }>;
  abstract stop(): Promise<void>;
  abstract pluginEvent?(
    event: string,
    from: string,
    ...args: any[]
  ): Promise<unknown>;
}

export interface LogWrangling {
  /** Add a passive pattern on console output that invokes callback on match */
  addMatcher<T>(
    pattern: IMatcher<T>['pattern'],
    callback: IMatcher<T>['callback']
  ): void;

  /** Run an active pattern on console output that resolves a match */
  addWatcher<T = RegExpMatchArray>(
    pattern: IWatcher<T>['pattern'],
    options?: {
      timeoutDelay?: number;
      bundle?: boolean;
      debounce?: boolean;
      afterMatchDelay?: number;
      last?: IWatcher<T>['last'];
      exec?: () => void;
    }
  ): Promise<IWatcher<T>['matches']>;

  /** Run a command and capture bundled output */
  watchLogChunk<T = string>(
    cmd: string,
    pattern: IWatcher<T>['pattern'],
    options?: {
      first?: 'index' | ((match: T) => boolean);
      last?: IWatcher<T>['last'];
      afterMatchDelay?: number;
      timeoutDelay?: number;
    }
  ): Promise<IWatcher<T>['matches']>;

  /** Run a command and capture bundled output for array functions */
  watchLogArray<
    Item extends Record<string, string> = Record<string, string>,
    Member extends Record<string, string> = Record<string, string>
  >(
    cmd: string,
    itemPattern: RegExp,
    memberPattern: RegExp
  ): Promise<{ item: Item; members: Member[] }[]>;
}

export type WatcherPattern<T> = (
  line: string,
  match: RegExpMatchArray
) => T | RegExpMatchArray | '[OMEGGA_WATCHER_DONE]';

export type IMatcher<T> =
  | {
      pattern: RegExp;
      callback: (match: RegExpMatchArray) => boolean;
    }
  | {
      pattern: (line: string, match: RegExpMatchArray) => T;
      callback: (match: RegExpMatchArray) => T;
    };

export type IWatcher<T> = {
  bundle: boolean;
  debounce: boolean;
  timeoutDelay: number;
  afterMatchDelay: number;
  last: (match: T) => boolean;
  callback: () => void;
  resolve: (...args: any[]) => void;
  remove: () => void;
  done: () => void;
  timeout: ReturnType<typeof setTimeout>;
} & (
  | {
      pattern: WatcherPattern<T>;
      matches: T[];
    }
  | {
      pattern: RegExp;
      matches: RegExpMatchArray[];
    }
);
