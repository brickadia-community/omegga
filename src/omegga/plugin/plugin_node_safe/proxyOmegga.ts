import {
  type OmeggaCore,
  type OmeggaLike,
  type OmeggaPlayer,
  type PluginInterop,
  type WatcherPattern,
} from '@/plugin';
import { type EnvironmentPreset } from '@brickadia/presets';
import {
  type BRBanList,
  type BRPlayerNameCache,
  type BRRoleAssignments,
  type BRRoleSetup,
} from '@brickadia/types';
import commandInjector from '@omegga/commandInjector';
import { type ConsoleCommands, resolveConsoleCommands } from '@omegga/commands';
import LogWrangler from '@omegga/logWrangler';
import Player from '@omegga/player';
import Omegga from '@omegga/server';
import {
  type IGamemode,
  type ILogMinigame,
  type IMinigameList,
  type IPlayerPositions,
  type IServerStatus,
} from '@omegga/types';
import { type ReadSaveObject, type WriteSaveObject } from 'brs-js';
import EventEmitter from 'events';

// bootstrap the proxy with initial omegga data
export const bootstrap = (omegga: Omegga): Record<string, unknown[]> => ({
  'plugin:players:raw': [omegga.players.map(p => p.raw())],
  bootstrap: [
    {
      host: Object.freeze({ ...omegga.host }),
      version: omegga.version,
      verbose: omegga.verbose,
      savePath: omegga.savePath,
      worldPath: omegga.worldPath,
      prefabPath: omegga.prefabPath,
      path: omegga.path,
      configPath: omegga.configPath,
      presetPath: omegga.presetPath,
      starting: omegga.starting,
      started: omegga.started,
      stopping: omegga.stopping,
      config: omegga.config,
      currentMap: omegga.currentMap,
    },
  ],
});

// prototypes that can be directly stolen from omegga
const STEAL_PROTOTYPES: Record<keyof Required<OmeggaCore>, true> = {
  broadcast: true,
  whisper: true,
  middlePrint: true,
  getPlayer: true,
  getPlayers: true,
  findPlayerByName: true,
  getHostId: true,
  clearBricks: true,
  clearRegion: true,
  clearAllBricks: true,
  loadBricks: true,
  loadBricksOnPlayer: true,
  saveBricks: true,
  saveBricksAsync: true,
  getSavePath: true,
  getSaves: true,
  getWorldPath: true,
  getWorlds: true,
  getPrefabs: true,
  getPrefabPath: true,
  loadPrefab: true,
  loadPrefabOnPlayer: true,
  savePrefab: true,
  savePrefabAsync: true,
  givePrefabToPlayer: true,
  getWorldRevisions: true,
  loadWorld: true,
  loadWorldRevision: true,
  saveWorldAs: true,
  saveWorld: true,
  createEmptyWorld: true,
  writeSaveData: true,
  readSaveData: true,
  loadSaveData: true,
  loadSaveDataOnPlayer: true,
  getSaveData: true,
  getRoleSetup: true,
  getRoleAssignments: true,
  getBanList: true,
  getNameCache: true,
  changeMap: true,
  saveMinigame: true,
  deleteMinigame: true,
  resetMinigame: true,
  nextRoundMinigame: true,
  loadMinigame: true,
  getMinigamePresets: true,
  resetEnvironment: true,
  saveEnvironment: true,
  readEnvironmentData: true,
  getEnvironmentData: true,
  loadEnvironment: true,
  loadEnvironmentData: true,
  getEnvironmentPresets: true,
};

const badBorrow = (name: string) =>
  new Error(`Method "${name}" not properly borrowed.`);

// this is a "soft" omegga
// it is built to mimic the core omegga
// it does not provide direct write access to
export class ProxyOmegga extends EventEmitter implements OmeggaLike {
  _tempCounter = { save: 0, environment: 0 };
  _tempSavePrefix = 'omegga_plugin_temp_';

  writeln: (line: string) => void;
  version: number;
  players: Player[];

  /** memoized version-resolved console commands ({@link Console}) */
  #console: { version: number; commands: ConsoleCommands } | undefined;

  /** version-resolved Brickadia console command names, nested by namespace */
  get Console(): ConsoleCommands {
    let memo = this.#console;
    if (memo?.version !== this.version) {
      memo = {
        version: this.version,
        commands: resolveConsoleCommands(this.version),
      };
      this.#console = memo;
    }
    return memo.commands;
  }

  // these fields are assigned by the 'bootstrap' event, which the plugin
  // loader always sends before plugin code runs (see bootstrap() above)
  host!: { id: string; name: string };

  verbose!: boolean;

  started!: boolean;
  starting!: boolean;
  stopping!: boolean;
  currentMap!: string;

  path!: string;
  configPath!: string;
  savePath!: string;
  worldPath!: string;
  prefabPath!: string;
  presetPath!: string;

  logWrangler: LogWrangler;

  constructor(exec: (line: string) => void) {
    super();
    this.setMaxListeners(Infinity);

    this.writeln = exec;

    this.version = -1;

    this.players = [];

    // log wrangler wrangles logs... it reads brickadia logs and clumps them together
    this.logWrangler = new LogWrangler(this as unknown as Omegga);
    this.on('line', this.logWrangler.callback);
    this.addMatcher = this.logWrangler.addMatcher;
    this.addWatcher = this.logWrangler.addWatcher;
    this.watchLogArray = this.logWrangler.watchLogArray;
    this.watchLogChunk = this.logWrangler.watchLogChunk;

    // inject commands
    commandInjector(this, this.logWrangler);

    // blanket apply fields
    this.once('bootstrap', data => {
      for (const key in data) {
        (this as any)[key] = data[key];
      }
    });

    // data synchronization
    this.on('host', host => (this.host = host));
    this.on('version', version => (this.version = version));

    // create players from raw constructor data
    this.on(
      'plugin:players:raw',
      (players: [string, string, string, string, string][]) =>
        (this.players = players.map(p => new Player(this as OmeggaLike, ...p))),
    );

    this.on('start', ({ map }) => {
      this.started = true;
      this.starting = false;
      this.currentMap = map;
    });
    this.on('exit', () => {
      this.started = false;
      this.starting = false;
    });
    this.on('mapchange', ({ map }) => {
      this.currentMap = map;
    });
  }
  addMatcher<T>(
    _pattern: RegExp | ((line: string, match: RegExpMatchArray | null) => T),
    _callback:
      | ((match: RegExpMatchArray) => boolean)
      | ((match: RegExpMatchArray) => T),
  ): void {
    throw badBorrow('addMatcher');
  }
  addWatcher<T = RegExpMatchArray>(
    _pattern: RegExp | WatcherPattern<T>,
    _options?: {
      timeoutDelay?: number;
      bundle?: boolean;
      debounce?: boolean;
      afterMatchDelay?: number;
      last?: (match: T) => boolean;
      exec?: () => void;
    },
  ): Promise<T[]> {
    throw badBorrow('addWatcher');
  }
  watchLogChunk<T = RegExpMatchArray>(
    _cmd: string,
    _pattern: RegExp | WatcherPattern<T>,
    _options?: {
      first?: 'index' | ((match: T) => boolean);
      last?: (match: T) => boolean;
      afterMatchDelay?: number;
      timeoutDelay?: number;
    },
  ): Promise<T[]> {
    throw badBorrow('watchLogChunk');
  }
  watchLogArray<
    Item extends Record<string, string> = Record<string, string>,
    Member extends Record<string, string> = Record<string, string>,
  >(
    _cmd: string,
    _itemPattern: RegExp,
    _memberPattern: RegExp,
  ): Promise<{ item: Item; members: Member[] }[]> {
    throw badBorrow('watchLogArray');
  }
  getServerStatus(): Promise<IServerStatus> {
    throw badBorrow('getServerStatus');
  }
  listMinigames(): Promise<IMinigameList> {
    throw badBorrow('listMinigames');
  }
  getAllPlayerPositions(): Promise<IPlayerPositions> {
    throw badBorrow('getAllPlayerPositions');
  }
  getMinigames(): Promise<ILogMinigame[]> {
    throw badBorrow('getMinigames');
  }
  getGamemode(): Promise<IGamemode | null> {
    throw badBorrow('getGamemode');
  }
  getPlayers(): {
    id: string;
    name: string;
    displayName: string;
    controller: string;
    state: string;
  }[] {
    throw badBorrow('getPlayers');
  }
  getPlayer(_target: string): OmeggaPlayer | null {
    throw badBorrow('getPlayer');
  }
  findPlayerByName(_name: string): OmeggaPlayer | null {
    throw badBorrow('findPlayerByName');
  }
  getHostId(): string {
    throw badBorrow('getHostId');
  }
  broadcast(..._messages: string[]): void {
    throw badBorrow('broadcast');
  }
  whisper(_target: string | OmeggaPlayer, ..._messages: string[]): void {
    throw badBorrow('whisper');
  }
  middlePrint(_target: string | OmeggaPlayer, _message: string): void {
    throw badBorrow('middlePrint');
  }
  saveMinigame(_index: number, _name: string): void {
    throw badBorrow('saveMinigame');
  }
  deleteMinigame(_index: number): void {
    throw badBorrow('deleteMinigame');
  }
  resetMinigame(_index: number): void {
    throw badBorrow('resetMinigame');
  }
  nextRoundMinigame(_index: number): void {
    throw badBorrow('nextRoundMinigame');
  }
  loadMinigame(_presetName: string, _owner?: string): void {
    throw badBorrow('loadMinigame');
  }
  getMinigamePresets(): string[] {
    throw badBorrow('getMinigamePresets');
  }
  resetEnvironment(): void {
    throw badBorrow('resetEnvironment');
  }
  saveEnvironment(_presetName: string): Promise<void> {
    throw badBorrow('saveEnvironment');
  }
  getEnvironmentData(): Promise<EnvironmentPreset | null> {
    throw badBorrow('getEnvironmentData');
  }
  loadEnvironment(_presetName: string): void {
    throw badBorrow('loadEnvironment');
  }
  readEnvironmentData(_presetName: string): EnvironmentPreset | null {
    throw badBorrow('readEnvironmentData');
  }
  loadEnvironmentData(_preset: EnvironmentPreset): void {
    throw badBorrow('loadEnvironmentData');
  }
  getEnvironmentPresets(): string[] {
    throw badBorrow('getEnvironmentPresets');
  }
  clearBricks(_target: string | { id: string }, _quiet?: boolean): void {
    throw badBorrow('clearBricks');
  }
  clearRegion(
    _region: {
      center: [number, number, number];
      extent: [number, number, number];
    },
    _options?: {
      target?: string | OmeggaPlayer;
      bricks?: boolean;
      entities?: boolean;
    },
  ): void {
    throw badBorrow('clearRegion');
  }
  clearAllBricks(
    _options?:
      | boolean
      | { quiet?: boolean; bricks?: boolean; entities?: boolean },
  ): void {
    throw badBorrow('clearAllBricks');
  }
  saveBricks(_saveName: string, _region?: {}): void {
    throw badBorrow('saveBricks');
  }
  saveBricksAsync(_saveName: string, _region?: {}): Promise<void> {
    throw badBorrow('saveBricksAsync');
  }
  loadBricks(
    _saveName: string,
    _options?: { offX?: number; offY?: number; offZ?: number; quiet?: boolean },
  ): void {
    throw badBorrow('loadBricks');
  }
  loadBricksOnPlayer(
    _saveName: string,
    _player: string | OmeggaPlayer,
    _options?: { offX?: number; offY?: number; offZ?: number },
  ): void {
    throw badBorrow('loadBricksOnPlayer');
  }
  getSaves(): string[] {
    throw badBorrow('getSaves');
  }
  getWorlds(): string[] {
    throw badBorrow('getWorlds');
  }
  getPrefabs(): string[] {
    throw badBorrow('getPrefabs');
  }
  getPrefabPath(_prefabName: string): string | undefined {
    throw badBorrow('getPrefabPath');
  }
  loadPrefab(
    _path: string,
    _options?: {
      offX?: number;
      offY?: number;
      offZ?: number;
      atOriginalPosition?: boolean;
      orientation?: number;
      rootEntityPersistentIndex?: number;
      mirrorAxes?: number;
      overrideUserId?: string;
    },
  ): void {
    throw badBorrow('loadPrefab');
  }
  loadPrefabOnPlayer(
    _path: string,
    _player: string | OmeggaPlayer,
    _options?: { preserveOwnership?: boolean },
  ): void {
    throw badBorrow('loadPrefabOnPlayer');
  }
  savePrefab(
    _path: string,
    _options?: {
      region?: {
        center: [number, number, number];
        extent: [number, number, number];
      };
      entities?: boolean;
      rootEntityPersistentIndex?: number;
      userId?: string;
    },
  ): void {
    throw badBorrow('savePrefab');
  }
  savePrefabAsync(
    _path: string,
    _options?: {
      region?: {
        center: [number, number, number];
        extent: [number, number, number];
      };
      entities?: boolean;
      rootEntityPersistentIndex?: number;
      userId?: string;
    },
  ): Promise<string | null> {
    throw badBorrow('savePrefabAsync');
  }
  givePrefabToPlayer(
    _path: string,
    _player: string | OmeggaPlayer,
    _options?: { preserveOwnership?: boolean },
  ): void {
    throw badBorrow('givePrefabToPlayer');
  }
  getSavePath(_saveName: string): string | undefined {
    throw badBorrow('getSavePath');
  }
  getWorldPath(_worldName: string): string | undefined {
    throw badBorrow('getWorldPath');
  }
  getWorldRevisions(
    _worldName: string,
  ): Promise<{ index: number; date: Date; note: string }[]> {
    throw badBorrow('getWorldRevisions');
  }
  loadWorld(_worldName: string): Promise<boolean> {
    throw badBorrow('loadWorld');
  }
  loadWorldRevision(_worldName: string, _revision: number): Promise<boolean> {
    throw badBorrow('loadWorldRevision');
  }
  saveWorldAs(_worldName: string): Promise<boolean> {
    throw badBorrow('saveWorldAs');
  }
  saveWorld(): Promise<boolean> {
    throw badBorrow('saveWorld');
  }
  createEmptyWorld(_worldName: string): Promise<boolean> {
    throw badBorrow('createEmptyWorld');
  }
  writeSaveData(_saveName: string, _saveData: WriteSaveObject) {
    throw badBorrow('writeSaveData');
  }
  readSaveData(_saveName: string, _nobricks?: boolean): ReadSaveObject {
    throw badBorrow('readSaveData');
  }
  loadSaveData(
    _saveData: WriteSaveObject,
    _options?: { offX?: number; offY?: number; offZ?: number; quiet?: boolean },
  ): Promise<void> {
    throw badBorrow('loadSaveData');
  }
  loadSaveDataOnPlayer(
    _saveData: WriteSaveObject,
    _player: string | OmeggaPlayer,
    _options?: { offX?: number; offY?: number; offZ?: number },
  ): Promise<void> {
    throw badBorrow('loadSaveDataOnPlayer');
  }
  getSaveData(_region?: {
    center: [number, number, number];
    extent: [number, number, number];
  }): Promise<ReadSaveObject | undefined> {
    throw badBorrow('getSaveData');
  }
  changeMap(_map: string): Promise<boolean> {
    throw badBorrow('changeMap');
  }
  getRoleSetup(): BRRoleSetup {
    throw badBorrow('getRoleSetup');
  }
  getRoleAssignments(): BRRoleAssignments {
    throw badBorrow('getRoleAssignments');
  }
  getBanList(): BRBanList {
    throw badBorrow('getBanList');
  }
  getNameCache(): BRPlayerNameCache {
    throw badBorrow('getNameCache');
  }
  // overridden by the worker with an implementation that queries the host
  getPlugin(_name: string): Promise<PluginInterop | null> {
    throw badBorrow('getPlugin');
  }
}

export function injectOmeggaPrototypes(
  proxyOmegga: typeof ProxyOmegga,
  omegga: typeof Omegga,
) {
  // copy prototypes from core omegga to the proxy omegga; writing through a
  // union of method keys requires widening the target's value types
  const proto = proxyOmegga.prototype as Record<keyof OmeggaCore, unknown>;
  for (const fn of Object.keys(STEAL_PROTOTYPES) as (keyof OmeggaCore)[]) {
    proto[fn] = omegga.prototype[fn];
  }
}
