import { ReadSaveObject, WriteSaveObject } from 'brs-js';
import EventEmitter from 'events';
import express from 'express';
import expressSession from 'express-session';
import Datastore from 'nedb-promises';
import { Server as SocketIo } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';

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
  savedPlayerRoles: Record<
    string,
    {
      roles: string[];
    }
  >;
}
export interface BRPlayerNameCache {
  savedPlayerNames: Record<string, string>;
}
export interface IServerConfig {
  webui?: boolean;
  port?: number;
  https?: boolean;
}
export interface IBrickadiaConfig {
  port: number;
  map?: string;
  branch?: string;
  name?: string;
  description?: string;
  password?: string;
  players?: number;
  publiclyListed?: boolean;
  welcomeMessage?: string;
  __LOCAL?: boolean;
  __LEGACY?: string;
}
export interface IConfig {
  omegga?: IServerConfig;
  server: IBrickadiaConfig;
  credentials?: {
    email: string;
    password: string;
  };
}
declare class Calendar {
  years: Record<number, Record<number, Record<number, boolean>>>;
  constructor();
  addDate(d: string | number | Date): void;
}
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}
export declare type OmeggaSocketIo = SocketIo<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  {
    user: IStoreUser & {
      _id: string;
    };
  }
>;
export interface IPlayer {
  id?: string;
  name?: string;
}
export interface IStoreChat {
  type: 'chat';
  created: number;
  instanceId: string;
  action: 'msg' | 'server' | 'leave' | 'join';
  user: Partial<IPlayer>;
  message?: string;
}
export interface IStoreBanHistory {
  type: 'banHistory';
  banned: string;
  bannerId: string | null;
  created: any;
  expires: any;
  reason: string;
}
export interface IStoreKickHistory {
  type: 'kickHistory';
  kicked: string;
  kickerId: string | null;
  created: any;
  reason: string;
}
export interface IUserHistory {
  type: 'userHistory';
  id: string;
  name: string;
  nameHistory: {
    name: string;
    date: number;
  }[];
  ips: string[];
  created: number;
  lastSeen: number;
  lastInstanceId: string;
  heartbeats: number;
  sessions: number;
  instances: number;
}
export interface IUserNote {
  type: 'note';
  id: string;
  note: string;
}
export interface IStoreUser {
  type: 'user';
  created: number;
  lastOnline: number;
  username: string;
  hash: string;
  isOwner: boolean;
  roles: string[];
  playerId: string;
  isBanned?: boolean;
}
declare class Database extends EventEmitter {
  options: IServerConfig;
  omegga: Omegga;
  stores: {
    users: Datastore;
    chat: Datastore;
    players: Datastore;
    status: Datastore;
    server: Datastore;
  };
  calendar: Calendar;
  constructor(options: IServerConfig, omegga: Omegga);
  doMigrations(): Promise<void>;
  getInstanceId(): Promise<string>;
  syncBanList(): void;
  isFirstUser(): Promise<boolean>;
  hash(password: string): Promise<string>;
  createAdminUser(
    username: string,
    password: string
  ): Promise<
    {
      type: string;
      created: number;
      lastOnline: number;
      username: string;
      hash: string;
      isOwner: boolean;
      roles: any[];
      playerId: string;
    } & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    }
  >;
  userExists(username: string): Promise<boolean>;
  createUser(
    username: string,
    password: string
  ): Promise<
    IStoreUser & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    }
  >;
  userPasswd(username: string, password: string): Promise<void>;
  authUser(
    username: string,
    password: string
  ): Promise<
    IStoreUser & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    }
  >;
  findUserById(id: string): Promise<
    IStoreUser & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    }
  >;
  getRoles(): Promise<
    {
      type: 'role';
      name: 'string';
    }[]
  >;
  addChatLog(
    action: 'msg' | 'server' | 'leave' | 'join',
    user: IPlayer,
    message?: string
  ): Promise<
    IStoreChat & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    }
  >;
  getChats({
    count,
    sameServer,
    before,
    after,
  }?: {
    count?: number;
    sameServer?: boolean;
    before?: number;
    after?: number;
  }): Promise<
    (IStoreChat & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    })[]
  >;
  getPlayers({
    count,
    search,
    page,
    sort,
    direction,
    limitId,
  }?: {
    count?: number;
    search?: string;
    page?: number;
    sort?: string;
    direction?: string;
    limitId?: string[];
  }): Promise<{
    pages: number;
    total: number;
    players: (IUserHistory & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    })[];
  }>;
  getUsers({
    count,
    search,
    page,
    sort,
    direction,
  }?: {
    count?: number;
    search?: string;
    page?: number;
    sort?: string;
    direction?: string;
  }): Promise<{
    pages: number;
    total: number;
    users: (IStoreUser & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    })[];
  }>;
  getPlayer(id: string): Promise<{
    banHistory: (IStoreBanHistory & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    })[];
    kickHistory: (IStoreKickHistory & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    })[];
    notes: (IUserNote & {
      _id: string;
      createdAt?: Date;
      updatedAt?: Date;
    })[];
    type: 'userHistory';
    id: string;
    name: string;
    nameHistory: {
      name: string;
      date: number;
    }[];
    ips: string[];
    created: number;
    lastSeen: number;
    lastInstanceId: string;
    heartbeats: number;
    sessions: number;
    instances: number;
    _id: string;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
  addVisit(user: IPlayer): Promise<boolean>;
  addHeartbeat(data: {
    bricks: number;
    players: string[];
    ips: Record<string, string>;
  }): Promise<void>;
  updatePlayerPunchcard(numNewPlayers: number): Promise<void>;
}
export interface IPluginJSON {
  formatVersion: number;
  omeggaVersion: string;
  emitConfig?: string;
}
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
declare class Plugin {
  static canLoad(_pluginPath: string): boolean;
  static getFormat(): void;
  static readJSON(file: string): any;
  path: string;
  omegga: Omegga;
  shortPath: string;
  storage: PluginStorage;
  documentation: IPluginDocumentation;
  pluginConfig: IPluginJSON;
  pluginFile: string;
  commands: string[];
  loadedPlugin: OmeggaPlugin;
  constructor(pluginPath: string, omegga: Omegga);
  setStorage(storage: PluginStorage): void;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  emitStatus(): void;
  emitPlugin(_ev: string, _from: string, _args: any[]): Promise<any>;
  getName(): string;
  getDocumentation(): IPluginDocumentation;
  isLoaded(): boolean;
  isCommand(_cmd: string): boolean;
  load(): Promise<boolean>;
  unload(): Promise<boolean>;
  getInfo(): {};
}
declare class PluginStorage {
  store: Datastore;
  plugin: Plugin;
  name: string;
  constructor(store: Datastore, plugin: Plugin);
  getDefaultConfig(): Record<string, unknown>;
  setConfig(value: unknown): Promise<void>;
  getConfig(): Promise<Record<string, unknown>>;
  init(): Promise<void>;
  get<T>(key: string): Promise<T>;
  delete(key: string): Promise<void>;
  wipe(): Promise<void>;
  count(): Promise<number>;
  keys(): Promise<string[]>;
  set<T = unknown>(key: string, value: T): Promise<void>;
}
declare class PluginLoader {
  path: string;
  omegga: Omegga;
  store: Datastore;
  formats: typeof Plugin[];
  plugins: Plugin[];
  commands: Record<
    string,
    IPluginCommand & {
      _plugin: Plugin;
    }
  >;
  documentation: Record<
    string,
    IPluginDocumentation & {
      _plugin: Plugin;
    }
  >;
  constructor(pluginsPath: string, omegga: Omegga);
  addFormat(format: typeof Plugin): void;
  isCommand(cmd: string): boolean;
  loadFormats(dir: string): void;
  reload(): Promise<boolean>;
  unload(): Promise<boolean>;
  scan(): Promise<boolean>;
  showHelp(player: string | Player, ...args: string[]): void;
  buildDocumentation(): void;
}
export declare type WatcherPattern<T> = (
  line: string,
  match: RegExpMatchArray
) => T | RegExpMatchArray | '[OMEGGA_WATCHER_DONE]';
export declare type IMatcher<T> =
  | {
      pattern: RegExp;
      callback: (match: RegExpMatchArray) => boolean;
    }
  | {
      pattern: (line: string, match: RegExpMatchArray) => T;
      callback: (match: RegExpMatchArray) => T;
    };
export declare type IWatcher<T> = {
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
declare class LogWrangler {
  #private;
  exec: (cmd: string) => void;
  getPlayer: Omegga['getPlayer'];
  getVersion: () => number;
  omegga: Omegga;
  callback: LogWrangler['handleLog'];
  constructor(omegga: Omegga);
  addMatcher<T>(
    pattern: IMatcher<T>['pattern'],
    callback: IMatcher<T>['callback']
  ): () => void;
  addWatcher<T = RegExpMatchArray>(
    pattern: IWatcher<T>['pattern'],
    {
      timeoutDelay,
      bundle,
      debounce,
      afterMatchDelay,
      last,
      exec,
    }?: {
      timeoutDelay?: number;
      bundle?: boolean;
      debounce?: boolean;
      afterMatchDelay?: number;
      last?: IWatcher<T>['last'];
      exec?: () => void;
    }
  ): Promise<IWatcher<T>['matches']>;
  watchLogChunk<T = string>(
    cmd: string,
    pattern: IWatcher<T>['pattern'],
    {
      first,
      last,
      afterMatchDelay,
      timeoutDelay,
    }: {
      first?: 'index' | ((match: T) => boolean);
      last?: IWatcher<T>['last'];
      afterMatchDelay?: number;
      timeoutDelay?: number;
    }
  ): Promise<IWatcher<T>['matches']>;
  watchLogArray<
    Item extends Record<string, string> = Record<string, string>,
    Member extends Record<string, string> = Record<string, string>
  >(
    cmd: string,
    itemPattern: RegExp,
    memberPattern: RegExp
  ): Promise<
    {
      item: Item;
      members: Member[];
    }[]
  >;
  handleLog(line: string): void;
}
declare class OmeggaWrapper extends EventEmitter {
  #private;
  dataPath: string;
  path: string;
  logWrangler: LogWrangler;
  addMatcher: LogWrangler['addMatcher'];
  addWatcher: LogWrangler['addWatcher'];
  watchLogArray: LogWrangler['watchLogArray'];
  watchLogChunk: LogWrangler['watchLogChunk'];
  config: IConfig;
  constructor(serverPath: string, cfg: IConfig);
  write(str: string): void;
  writeln(str: string): void;
  start(): void;
  stop(): void;
  emit(type: string, ...args: any[]): boolean;
}
declare class Omegga extends OmeggaWrapper {
  /** The save counter prevents omegga from saving over the same file */
  _tempSaveCounter: number;
  /** The save prefix is prepended to all temporary saves */
  _tempSavePrefix: string;
  static VERBOSE: boolean;
  /**
   * send a console log to the readline terminal or stdout
   */
  static log(...args: unknown[]): void;
  /**
   * send a console error to the readline terminal or stderr
   */
  static error(...args: unknown[]): void;
  /**
   * send a console warn to the readline terminal or stdout
   */
  static warn(...args: unknown[]): void;
  /**
   * send a console log when omegga is launched when --verbose
   */
  static verbose(...args: unknown[]): void;
  pluginLoader: PluginLoader;
  verbose: boolean;
  savePath: string;
  presetPath: string;
  configPath: string;
  options: IOmeggaOptions;
  version: number;
  host?: {
    id: string;
    name: string;
  };
  players: Player[];
  started: boolean;
  starting: boolean;
  stopping: boolean;
  currentMap: string;
  getServerStatus: () => Promise<IServerStatus>;
  listMinigames: () => Promise<IMinigameList>;
  getAllPlayerPositions: () => Promise<IPlayerPositions>;
  getMinigames: () => Promise<ILogMinigame[]>;
  /**
   * Omegga instance
   */
  constructor(serverPath: string, cfg: IConfig, options?: IOmeggaOptions);
  /**
   * start webserver, load plugins, start the brickadia server
   * this should not be called by a plugin
   */
  start(): Promise<any>;
  /**
   * unload plugins and stop the server
   * this should not be called by a plugin
   */
  stop(): Promise<void>;
  /**
   * Copies auth files from home config dir
   * this should never be called by a plugin
   */
  copyAuthFiles(): void;
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
  whisper(target: string | Player, ...messages: string[]): void;
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
   * @return {object}
   */
  getNameCache(): BRPlayerNameCache;
  /**
   * find a player by name, id, controller, or state
   * @param target - name, id, controller, or state
   */
  getPlayer(target: string): Player;
  /**
   * find a player by rough name, prioritize exact matches and get fuzzier
   * @param name player name, fuzzy
   */
  findPlayerByName(name: string): Player;
  /**
   * get the host's ID
   * @return Host Id
   */
  getHostId(): string;
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
   * get all presets in the minigame folder and child folders
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
   * get all presets in the environment folder and child folders
   */
  getEnvironmentPresets(): string[];
  /**
   * clear a user's bricks (by uuid, name, controller, or player object)
   * @param target player or player identifier
   * @param quiet quietly clear bricks
   */
  clearBricks(
    target:
      | string
      | {
          id: string;
        },
    quiet?: boolean
  ): void;
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
    {
      offX,
      offY,
      offZ,
      quiet,
    }?: {
      offX?: number;
      offY?: number;
      offZ?: number;
      quiet?: boolean;
    }
  ): void;
  /**
   * get all saves in the save folder and child folders
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
   * @param saveName {String} - save file name
   * @param saveData {SaveData} - BRS JS Save data
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
   * @param  saveData - BRS JS Save data
   */
  loadSaveData(
    saveData: WriteSaveObject,
    {
      offX,
      offY,
      offZ,
      quiet,
    }?: {
      offX?: number;
      offY?: number;
      offZ?: number;
      quiet?: boolean;
    }
  ): Promise<void>;
  /**
   * get current bricks as save data
   */
  getSaveData(): Promise<ReadSaveObject>;
  /**
   * Change server map
   * @param  map Map name
   */
  changeMap(map: string): Promise<boolean>;
}
export interface IBrickBounds {
  minBound: [number, number, number];
  maxBound: [number, number, number];
  center: [number, number, number];
}
declare class Player {
  #private;
  name: string;
  id: string;
  controller: string;
  state: string;
  /**
   * players are not to be constructed
   * @constructor
   * @param  omegga Omegga Instance
   * @param  name Player Name
   * @param  id Player Id
   * @param  controller Player Controller
   * @param  state Player State
   */
  constructor(
    omegga: Omegga,
    name: string,
    id: string,
    controller: string,
    state: string
  );
  /**
   * Returns omegga
   */
  getOmegga(): Omegga;
  /**
   * Clone a player
   */
  clone(): Player;
  /**
   * Get raw player info (to feed into a constructor)
   */
  raw(): [string, string, string, string];
  /**
   * true if the player is the host
   */
  isHost(): boolean;
  /**
   * clear this player's bricks
   */
  clearBricks(quiet?: boolean): void;
  /**
   * get a player's roles, if any
   * @param omegga omegga instance
   * @param id player uuid
   * @return list of roles
   */
  static getRoles(omegga: Omegga, id: string): readonly string[];
  /**
   * get a player's roles, if any
   */
  getRoles(): readonly string[];
  /**
   * get a player's permissions in a map like `{"Bricks.ClearOwn": true, ...}`
   * @param omegga Omegga instance
   * @param id player uuid
   * @return permissions map
   */
  static getPermissions(omegga: Omegga, id: string): Record<string, boolean>;
  /**
   * get a player's permissions in a map like `{"Bricks.ClearOwn": true, ...}`
   * @return {Object} - permissions map
   */
  getPermissions(): Record<string, boolean>;
  /**
   * get player's name color
   * @return 6 character hex string
   */
  getNameColor(): string;
  /**
   * get player's position
   * @return {Promise<List<Number>>} - [x, y, z] coordinates
   */
  getPosition(): Promise<number[]>;
  /**
   * gets a user's ghost brick info (by uuid, name, controller, or player object)
   * @return {Promise<Object>} - ghost brick data
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
   * @return {Promise<Object>} - template bounds
   */
  getTemplateBounds(): Promise<IBrickBounds>;
  /**
   * get bricks inside template bounds
   * @return {Promise<SaveData>} - BRS JS Save Data
   */
  getTemplateBoundsData(): Promise<import('brs-js').ReadSaveObject>;
  /**
   * load bricks at ghost brick location
   * @param saveData player or player identifier
   */
  loadDataAtGhostBrick(
    saveData: WriteSaveObject,
    {
      rotate,
      offX,
      offY,
      offZ,
      quiet,
    }?: {
      rotate?: boolean;
      offX?: number;
      offY?: number;
      offZ?: number;
      quiet?: boolean;
    }
  ): Promise<void>;
}
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
export declare type IMinigameList = {
  index: string;
  name: string;
  numMembers: string;
  owner: {
    name: string;
    id: string;
  };
}[];
export declare type IPlayerPositions = {
  player: Player;
  pawn: string;
  pos: number[];
  isDead: boolean;
}[];
export declare type ILogMinigame = {
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
export declare type PluginConfig<
  T extends Record<string, unknown> = Record<string, unknown>
> = T;
export declare class OmeggaPlugin<
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
  );
  init(): Promise<void | {
    registeredCommands: string[];
  }>;
  stop(): Promise<void>;
  pluginEvent?(event: string, from: string, ...args: any[]): Promise<unknown>;
}

export {};
