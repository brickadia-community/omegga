import { EnvironmentPreset } from '@brickadia/presets';
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
import util from '@util';
import brs, { ReadSaveObject, WriteSaveObject } from 'brs-js';

export const _OMEGGA_UTILS_IMPORT = util;
declare global {
  export var Omegga: OmeggaLike;
  export var Player: StaticPlayer;
  export var OMEGGA_UTIL: typeof _OMEGGA_UTILS_IMPORT;
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

/** Created when a player clicks on a brick with an interact component */
export interface BrickInteraction {
  /** Brick name from catalog (Turkey Body, 4x Cube) */
  brick_name: string;
  /** Brick asset name */
  brick_asset: string;
  /** Brick size */
  brick_size: [number, number, number];
  /** Player information, id, name, controller, and pawn */
  player: { id: string; name: string; controller: string; pawn: string };
  /** Brick center position */
  position: [number, number, number];

  /** message sent from a brick click interaction */
  message: string;
  /** data parsed from the line (if it starts with json:) */
  data: null | number | string | boolean | Record<string, unknown>;
  /** True when there was a json payload */
  json: boolean;
  /** True when there was a parse error */
  error: boolean;
}

/** AutoRestart options */
export type AutoRestartConfig = {
  players: boolean;
  bricks: boolean;
  minigames: boolean;
  environment: boolean;
  announcement: boolean;
};

export interface OmeggaPlayer {
  /** player name */
  name: string;

  /** player display name */
  displayName: string;

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
  raw(): [string, string, string, string, string];

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
   * Get the player's pawn
   * @return pawn
   */
  getPawn(): Promise<string>;

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
   * gets whether or not the player is crouching
   */
  isCrouched(pawn?: string): Promise<boolean>;

  /**
   * gets whether or not the player is dead
   */
  isDead(pawn?: string): Promise<boolean>;

  /**
   * Gets the bounds of the template in the user's clipboard (bounds of original selection box)
   * @return template bounds
   */
  getTemplateBounds(): Promise<BrickBounds>;

  /**
   * Get bricks inside template bounds
   * @return BRS JS Save Data
   */
  getTemplateBoundsData(): Promise<ReadSaveObject>;

  /**
   * Load bricks at ghost brick location
   * @param saveData save data to load
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

  /**
   * Load bricks on this player's clipboard
   * @param saveName Save to load
   */
  loadBricks(saveName: string): void;

  /**
   * Load bricks on this player's clipboard passing save data
   * @param saveData save data to load
   */
  loadSaveData(
    saveData: WriteSaveObject,
    options?: {
      rotate?: boolean;
      offX?: number;
      offY?: number;
      offZ?: number;
      quiet?: boolean;
    }
  ): Promise<void>;

  /**
   * Kills this player
   */
  kill(): void;

  /**
   * Damages a player
   * @param amount Amount to damage
   */
  damage(amount: number): void;

  /**
   * Heal this player
   * @param amount to heal
   */
  heal(amount: number): void;

  /**
   * Gives a player an item
   * @param item Item name (Weapon_Bow)
   */
  giveItem(item: WeaponClass): void;

  /**
   * Removes an item from a player's inventory
   * @param item Item name (Weapon_Bow)
   */
  takeItem(item: WeaponClass): void;

  /**
   * Changes a player's team
   * @param teamIndex Team index
   */
  setTeam(teamIndex: number): void;

  /**
   * Changes a player's minigame
   * @param index Minigame index
   */
  setMinigame(index: number): void;

  /**
   * Changes a player's score
   * @param minigameIndex minigame index
   * @param score Score
   */
  setScore(minigameIndex: number, score: number): void;

  /**
   * Fetch a player's score
   * @param minigameIndex minigame index
   */
  getScore(minigameIndex: number): Promise<number>;
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

  /**
   * Kills a player
   * @param omegga Omegga instance
   * @param target Player or player name/id
   */
  kill(omegga: OmeggaLike, target: string | OmeggaPlayer): void;

  /**
   * Damages a player
   * @param omegga Omegga instance
   * @param target Player or player name/id
   * @param amount Damage amount
   */
  damage(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    amount: number
  ): void;

  /**
   * Heal a player
   * @param omegga Omegga instance
   * @param target Player or player name/id
   * @param amount Heal amount
   */
  heal(omegga: OmeggaLike, target: string | OmeggaPlayer, amount: number): void;

  /**
   * Gives a player an item
   * @param omegga Omegga instance
   * @param target Player or player name/id
   * @param item Item name (Weapon_Bow)
   */
  giveItem(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    item: WeaponClass
  ): void;

  /**
   * Removes an item from a player's inventory
   * @param omegga Omegga instance
   * @param target Player or player name/id
   * @param item Item name (Weapon_Bow)
   */
  takeItem(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    item: WeaponClass
  ): void;

  /**
   * Changes a player's team
   * @param omegga Omegga instance
   * @param target Player or player name/id
   * @param teamIndex Team name? index?
   */
  setTeam(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    teamIndex: number
  ): void;

  /**
   * Changes a player's minigame
   * @param omegga Omegga instance
   * @param target Player or player name/id
   * @param index Minigame index
   */
  setMinigame(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    index: number
  ): void;

  /**
   * Changes a player's score
   * @param omegga Omegga instance
   * @param target Player or player name/id
   * @param minigameIndex minigame index
   * @param score Score
   */
  setScore(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    minigameIndex: number,
    score: number
  ): void;

  /**
   * Fetches a player's score
   * @param omegga Omegga instance
   * @param target Player or player name/id
   * @param minigameIndex minigame index
   */
  getScore(
    omegga: OmeggaLike,
    target: string | OmeggaPlayer,
    minigameIndex: number
  ): Promise<number>;
}

export interface InjectedCommands {
  /** Get server status */
  getServerStatus(this: OmeggaLike): Promise<IServerStatus>;
  /** Get a list of minigames and their indices */
  listMinigames(this: OmeggaLike): Promise<IMinigameList>;
  // /** Get all pawn data */
  // getAllPawnData(this: OmeggaLike, fields: PawnDataField[]): void;
  /** Get all player positions and pawns */
  getAllPlayerPositions(this: OmeggaLike): Promise<IPlayerPositions>;
  /** Get minigames and members */
  getMinigames(this: OmeggaLike): Promise<ILogMinigame[]>;
}

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
  on(event: 'autorestart', listener: (config: AutoRestartConfig) => void): this;
  on(
    event: 'interact',
    listener: (interaction: BrickInteraction) => void
  ): this;
  on(
    event: 'minigamejoin',
    listener: (info: {
      player: { name: string; id: string };
      minigameName: string;
    }) => void
  ): this;
}

export interface OmeggaLike
  extends OmeggaCore,
    LogWrangling,
    InjectedCommands,
    MockEventEmitter {
  writeln(line: string): void;

  /** game CL version*/
  version: number;

  /** verbose logging is enabled*/
  verbose: boolean;

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
  /** path to worlds */
  worldPath: string;
  /** path to presets */
  presetPath: string;

  /** get a plugin's name, documentation, and loaded status
   * If run in an unsafe plugin, the emitPlugin method sends events from
   * an "unsafe" plugin
   */
  getPlugin(name: string): Promise<PluginInterop>;
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
  getPlayer(target: string): OmeggaPlayer | null;

  /**
   * find a player by rough name, prioritize exact matches and get fuzzier
   * @param name player name, fuzzy
   */
  findPlayerByName(name: string): OmeggaPlayer | null;

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
  saveEnvironment(presetName: string): Promise<void>;

  /** Save a temporary environment preset and return its contents */
  getEnvironmentData(): Promise<EnvironmentPreset>;

  /**
   * Read environment data as json
   * @param presetName preset name
   */
  readEnvironmentData(presetName: string): void;

  /**
   * Load an environment preset
   * @param presetName preset name
   */
  loadEnvironment(presetName: string): void;

  /**
   * Load some environment preset data
   * @param preset preset data
   */
  loadEnvironmentData(
    preset: EnvironmentPreset | EnvironmentPreset['data']['groups']
  ): void;

  /**
   * Get all presets in the environment folder and child folders
   */
  getEnvironmentPresets(): string[];

  /**
   * Clear a user's bricks (by uuid, name, controller, or player object)
   * @param target player or player identifier
   * @param quiet quietly clear bricks
   */
  clearBricks(target: string | { id: string }, quiet?: boolean): void;

  /**
   * Clear a region of bricks
   * @param region region to clear
   * @param options optional settings
   */
  clearRegion(
    region: {
      center: [number, number, number];
      extent: [number, number, number];
    },
    options?: {
      target?: string | OmeggaPlayer;
    }
  ): void;

  /**
   * Clear all bricks on the server
   * @param quiet quietly clear bricks
   */
  clearAllBricks(quiet?: boolean): void;

  /**
   * Save bricks under a filename
   * @param saveName save file name
   * @param region region of bricks to save
   */
  saveBricks(
    saveName: string,
    region?: {
      center: [number, number, number];
      extent: [number, number, number];
    }
  ): void;

  /**
   * Save bricks under a filename, with a promise
   * @param saveName save file name
   * @param region region of bricks to save
   */
  saveBricksAsync(
    saveName: string,
    region?: {
      center: [number, number, number];
      extent: [number, number, number];
    }
  ): Promise<void>;

  /**
   * Load bricks on the server
   */
  loadBricks(
    saveName: string,
    options?: {
      offX?: number;
      offY?: number;
      offZ?: number;
      quiet?: boolean;
      correctPalette?: boolean;
      correctCustom?: boolean;
    }
  ): void;

  /**
   * Load bricks on the server into a player's clipbaord
   */
  loadBricksOnPlayer(
    saveName: string,
    player: string | OmeggaPlayer,
    options?: {
      offX?: number;
      offY?: number;
      offZ?: number;
      correctPalette?: boolean;
      correctCustom?: boolean;
    }
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
   * Get all worlds in the worlds folder and child folders
   */
  getWorlds(): string[];

  /**
   * Checks if a world exists and returns an absolute path
   * @param worldName World name
   * @return Path to string
   */
  getWorldPath(worldName: string): string;

  /**
   * Get a list of revisions for a world
   * @param worldName World name
   */
  getWorldRevisions(
    worldName: string
  ): Promise<{ index: number; date: Date; note: string }[]>;

  /**
   * Load a world by its name
   * @param worldName World name
   */
  loadWorld(worldName: string): void;

  /**
   * Load a world at a specific revision
   * @param worldName World name
   */
  loadWorldRevision(worldName: string, revision: number): void;

  /**
   * Save a world as a new name
   * @param worldName World name
   */
  saveWorldAs(worldName: string): void;

  /**
   * Save the current world
   */
  saveWorld(): void;

  /**
   * Create an empty world with the given name
   */
  createEmptyWorld(worldName: string): void;

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
    options?: {
      offX?: number;
      offY?: number;
      offZ?: number;
      quiet?: boolean;
      correctPalette?: boolean;
      correctCustom?: boolean;
    }
  ): Promise<void>;

  /**
   * load bricks from save data and resolve when game finishes loading
   * @param saveData BRS JS Save data
   * @param player Player name/id or player object
   */
  loadSaveDataOnPlayer(
    saveData: WriteSaveObject,
    player: string | OmeggaPlayer,
    options?: {
      offX?: number;
      offY?: number;
      offZ?: number;
      correctPalette?: boolean;
      correctCustom?: boolean;
    }
  ): Promise<void>;

  /**
   * get current bricks as save data
   */
  getSaveData(region?: {
    center: [number, number, number];
    extent: [number, number, number];
  }): Promise<ReadSaveObject>;

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

/** A simple document store for plugins */
export interface PluginStore<
  Storage extends Record<string, unknown> = Record<string, unknown>
> {
  /** Get a value from plugin storage */
  get<T extends keyof Storage>(key: T): Promise<Storage[T]>;
  /** Set a value to plugin storage */
  set<T extends keyof Storage>(key: T, value: Storage[T]): Promise<void>;
  /** Delete a value from plugin storage */
  delete(key: string): Promise<void>;
  /** Wipe all values in plugin storage */
  wipe(): Promise<void>;
  /** Count entries in plugin storage */
  count(): Promise<number>;
  /** Get a list of keys in plugin storage */
  keys(): Promise<(keyof Storage)[]>;
}

/** A config representative of the config outlined in doc.json */
export type PluginConfig<
  T extends Record<string, unknown> = Record<string, unknown>
> = T;

/** An omegga plugin */
export default abstract class OmeggaPlugin<
  Config extends Record<string, unknown> = Record<string, unknown>,
  Storage extends Record<string, unknown> = Record<string, unknown>
> {
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

  /** Run when plugin starts, returns /commands it uses */
  abstract init(): Promise<void | { registeredCommands?: string[] }>;

  /** Run when plugin is stopped */
  abstract stop(): Promise<void>;

  /** Run when another plugin tries to interact with this plugin
   * @param event Event name
   * @param from Name of origin plugin
   * @return value other plugin expects
   */
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

export declare type IPluginConfigDefinition = {
  description: string;
} & (
  | {
      type: 'string' | 'password' | 'role';
      default: string;
    }
  | {
      type: 'boolean';
      default: boolean;
    }
  | {
      type: 'number';
      default: number;
    }
  | {
      type: 'enum';
      options: (string | number)[];
      default: string | number;
    }
  | {
      type: 'players';
      default: {
        id: string;
        name: string;
      };
    }
  | ({
      type: 'list';
    } & (
      | {
          itemType: 'string';
          default: string[];
        }
      | {
          itemType: 'number';
          default: number[];
        }
      | {
          itemType: 'enum';
          options: (string | number)[];
          default: string | number;
        }
    ))
);
export interface IPluginCommandArgument {
  name: string;
  description: string;
  required?: boolean;
}
export interface IPluginCommand {
  name: string;
  description: string;
  example?: string;
  args: IPluginCommandArgument[];
}
export interface IPluginDocumentation {
  name: string;
  description: string;
  author: string;
  config: Record<string, IPluginConfigDefinition>;
  commands: IPluginCommand[];
}

export interface PluginInterop {
  name: string;
  documentation: IPluginDocumentation;
  loaded: boolean;
  emitPlugin?(event: string, args: any[]): Promise<any>;
}

export type WeaponClass =
  | 'Weapon_AntiMaterielRifle'
  | 'Weapon_ArmingSword'
  | 'Weapon_AssaultRifle'
  | 'Weapon_AutoShotgun'
  | 'Weapon_Battleaxe'
  | 'Weapon_Bazooka'
  | 'Weapon_Bow'
  | 'Weapon_BullpupRifle'
  | 'Weapon_BullpupSMG'
  | 'Weapon_ChargedLongsword'
  | 'Weapon_CrystalKalis'
  | 'Weapon_Derringer'
  | 'Weapon_FlintlockPistol'
  | 'Weapon_GrenadeLauncher'
  | 'Weapon_Handaxe'
  | 'Weapon_HealthPotion'
  | 'Weapon_HeavyAssaultRifle'
  | 'Weapon_HeavySMG'
  | 'Weapon_HeroSword'
  | 'Weapon_HighPowerPistol'
  | 'Weapon_HoloBlade'
  | 'Weapon_HuntingShotgun'
  | 'Weapon_Ikakalaka'
  | 'Weapon_ImpactGrenade'
  | 'Weapon_ImpactGrenadeLauncher'
  | 'Weapon_ImpulseGrenade'
  | 'Weapon_Khopesh'
  | 'Weapon_Knife'
  | 'Weapon_LeverActionRifle'
  | 'Weapon_LightMachineGun'
  | 'Weapon_LongSword'
  | 'Weapon_MagnumPistol'
  | 'Weapon_MicroSMG'
  | 'Weapon_Minigun'
  | 'Weapon_Pistol'
  | 'Weapon_PulseCarbine'
  | 'Weapon_QuadLauncher'
  | 'Weapon_Revolver'
  | 'Weapon_RocketJumper'
  | 'Weapon_RocketLauncher'
  | 'Weapon_Sabre'
  | 'Weapon_SemiAutoRifle'
  | 'Weapon_ServiceRifle'
  | 'Weapon_Shotgun'
  | 'Weapon_SlugShotgun'
  | 'Weapon_Sniper'
  | 'Weapon_Spatha'
  | 'Weapon_StandardSubmachineGun'
  | 'Weapon_StickGrenade'
  | 'Weapon_SubmachineGun'
  | 'Weapon_SuperShotgun'
  | 'Weapon_SuppressedAssaultRifle'
  | 'Weapon_SuppressedBullpupSMG'
  | 'Weapon_SuppressedPistol'
  | 'Weapon_SuppressedServiceRifle'
  | 'Weapon_TacticalShotgun'
  | 'Weapon_TacticalSMG'
  | 'Weapon_Tomahawk'
  | 'Weapon_TwinCannon'
  | 'Weapon_TypewriterSMG'
  | 'Weapon_Zweihander';
