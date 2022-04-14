import EventEmitter from 'events';
import commandInjector from '@omegga/commandInjector';
import LogWrangler from '@omegga/logWrangler';
import Player from '@omegga/player';
import { Plugin } from '@omegga/plugin';
import Omegga from '@omegga/server';
import {
  ILogMinigame,
  IMinigameList,
  IPlayerPositions,
  IServerStatus,
} from '@omegga/types';
import { OmeggaLike, OmeggaCore, OmeggaPlayer, WatcherPattern } from '@/plugin';
import {
  BRRoleSetup,
  BRRoleAssignments,
  BRBanList,
  BRPlayerNameCache,
} from '@brickadia/types';
import { WriteSaveObject, ReadSaveObject } from 'brs-js';
import Logger from '@/logger';
import { EnvironmentPreset } from '@brickadia/presets';

// bootstrap the proxy with initial omegga data
export const bootstrap = (omegga: Omegga): Record<string, unknown[]> => ({
  'plugin:players:raw': [omegga.players.map(p => p.raw())],
  bootstrap: [
    {
      host: Object.freeze({ ...omegga.host }),
      version: omegga.version,
      verbose: Logger.VERBOSE,
      savePath: omegga.savePath,
      path: omegga.path,
      configPath: omegga.configPath,
      presetPath: omegga.presetPath,
      starting: omegga.starting,
      started: omegga.started,
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
  getSavePath: true,
  getSaves: true,
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

  host: { id: string; name: string };

  started: boolean;
  starting: boolean;
  stopping: boolean;
  currentMap: string;

  configPath: string;
  savePath: string;
  presetPath: string;

  logWrangler: LogWrangler;

  getPlugin: (
    name: string
  ) => Promise<
    Plugin & { emit(event: string, ...args: any[]): Promise<unknown> }
  >;

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
      (players: [string, string, string, string][]) =>
        (this.players = players.map(p => new Player(this as OmeggaLike, ...p)))
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
    pattern: RegExp | ((line: string, match: RegExpMatchArray) => T),
    callback:
      | ((match: RegExpMatchArray) => boolean)
      | ((match: RegExpMatchArray) => T)
  ): void {
    throw badBorrow('addMatcher');
  }
  addWatcher<T = RegExpMatchArray>(
    pattern: RegExp | WatcherPattern<T>,
    options?: {
      timeoutDelay?: number;
      bundle?: boolean;
      debounce?: boolean;
      afterMatchDelay?: number;
      last?: (match: T) => boolean;
      exec?: () => void;
    }
  ): Promise<RegExpMatchArray[] | T[]> {
    throw badBorrow('addWatcher');
  }
  watchLogChunk<T = string>(
    cmd: string,
    pattern: RegExp | WatcherPattern<T>,
    options?: {
      first?: 'index' | ((match: T) => boolean);
      last?: (match: T) => boolean;
      afterMatchDelay?: number;
      timeoutDelay?: number;
    }
  ): Promise<RegExpMatchArray[] | T[]> {
    throw badBorrow('watchLogChunk');
  }
  watchLogArray<
    Item extends Record<string, string> = Record<string, string>,
    Member extends Record<string, string> = Record<string, string>
  >(
    cmd: string,
    itemPattern: RegExp,
    memberPattern: RegExp
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

  getPlayers(): {
    id: string;
    name: string;
    controller: string;
    state: string;
  }[] {
    throw badBorrow('getPlayers');
  }
  getPlayer(target: string): OmeggaPlayer {
    throw badBorrow('getPlayer');
  }
  findPlayerByName(name: string): OmeggaPlayer {
    throw badBorrow('findPlayerByName');
  }
  getHostId(): string {
    throw badBorrow('getHostId');
  }
  broadcast(...messages: string[]): void {
    throw badBorrow('broadcast');
  }
  whisper(target: string | OmeggaPlayer, ...messages: string[]): void {
    throw badBorrow('whisper');
  }
  middlePrint(target: string | OmeggaPlayer, message: string): void {
    throw badBorrow('middlePrint');
  }
  saveMinigame(index: number, name: string): void {
    throw badBorrow('saveMinigame');
  }
  deleteMinigame(index: number): void {
    throw badBorrow('deleteMinigame');
  }
  resetMinigame(index: number): void {
    throw badBorrow('resetMinigame');
  }
  nextRoundMinigame(index: number): void {
    throw badBorrow('nextRoundMinigame');
  }
  loadMinigame(presetName: string, owner?: string): void {
    throw badBorrow('loadMinigame');
  }
  getMinigamePresets(): string[] {
    throw badBorrow('getMinigamePresets');
  }
  resetEnvironment(): void {
    throw badBorrow('resetEnvironment');
  }
  saveEnvironment(presetName: string): void {
    throw badBorrow('saveEnvironment');
  }
  loadEnvironment(presetName: string): void {
    throw badBorrow('loadEnvironment');
  }
  loadEnvironmentData(preset: EnvironmentPreset): void {
    throw badBorrow('loadEnvironmentData');
  }
  getEnvironmentPresets(): string[] {
    throw badBorrow('getEnvironmentPresets');
  }
  clearBricks(target: string | { id: string }, quiet?: boolean): void {
    throw badBorrow('clearBricks');
  }
  clearRegion(
    region: {
      center: [number, number, number];
      extent: [number, number, number];
    },
    options: {
      target: string | OmeggaPlayer;
    }
  ): void {
    throw badBorrow('clearRegion');
  }
  clearAllBricks(quiet?: boolean): void {
    throw badBorrow('clearAllBricks');
  }
  saveBricks(
    saveName: string,
    region?: {
      center: [number, number, number];
      extent: [number, number, number];
    }
  ): void {
    throw badBorrow('saveBricks');
  }
  loadBricks(
    saveName: string,
    options?: { offX?: number; offY?: number; offZ?: number; quiet?: boolean }
  ): void {
    throw badBorrow('loadBricks');
  }
  loadBricksOnPlayer(
    saveName: string,
    player: string | OmeggaPlayer,
    options?: { offX?: number; offY?: number; offZ?: number }
  ): void {
    throw badBorrow('loadBricksOnPlayer');
  }
  getSaves(): string[] {
    throw badBorrow('getSaves');
  }
  getSavePath(saveName: string): string {
    throw badBorrow('getSavePath');
  }
  writeSaveData(saveName: string, saveData: WriteSaveObject): void {
    throw badBorrow('writeSaveData');
  }
  readSaveData(saveName: string, nobricks?: boolean): ReadSaveObject {
    throw badBorrow('readSaveData');
  }
  loadSaveData(
    saveData: WriteSaveObject,
    options?: { offX?: number; offY?: number; offZ?: number; quiet?: boolean }
  ): Promise<void> {
    throw badBorrow('loadSaveData');
  }
  loadSaveDataOnPlayer(
    saveData: WriteSaveObject,
    player: string | OmeggaPlayer,
    options?: { offX?: number; offY?: number; offZ?: number }
  ): Promise<void> {
    throw badBorrow('loadSaveDataOnPlayer');
  }
  getSaveData(region?: {
    center: [number, number, number];
    extent: [number, number, number];
  }): Promise<ReadSaveObject> {
    throw badBorrow('getSaveData');
  }
  changeMap(map: string): Promise<boolean> {
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
}

// copy prototypes from core omegga to the proxy omegga
for (const fn in STEAL_PROTOTYPES) {
  (ProxyOmegga as any).prototype[fn] = Omegga.prototype[fn];
}
