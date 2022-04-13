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

// bootstrap the proxy with initial omegga data
export const bootstrap = (omegga: Omegga): Record<string, unknown[]> => ({
  'plugin:players:raw': [omegga.players.map(p => p.raw())],
  bootstrap: [
    {
      host: Object.freeze({ ...omegga.host }),
      version: omegga.version,
      verbose: global.Omegga.VERBOSE,
      savePath: omegga.savePath,
      path: omegga.path,
      configPath: omegga.configPath,
      starting: omegga.starting,
      started: omegga.started,
      config: omegga.config,
      currentMap: omegga.currentMap,
    },
  ],
});

// prototypes that can be directly stolen from omegga
const STEAL_PROTOTYPES = [
  'broadcast',
  'whisper',
  'getPlayer',
  'getPlayers',
  'findPlayerByName',
  'getHostId',
  'clearBricks',
  'clearAllBricks',
  'loadBricks',
  'saveBricks',
  'getSavePath',
  'getSaves',
  'writeSaveData',
  'readSaveData',
  'loadSaveData',
  'getSaveData',
  'getRoleSetup',
  'getRoleAssignments',
  'getBanList',
  'getNameCache',
  'changeMap',
  'saveMinigame',
  'deleteMinigame',
  'resetMinigame',
  'nextRoundMinigame',
  'loadMinigame',
  'getMinigamePresets',
  'resetEnvironment',
  'saveEnvironment',
  'loadEnvironment',
  'getEnvironmentPresets',
];

// this is a "soft" omegga
// it is built to mimic the core omegga
// it does not provide direct write access to
export class ProxyOmegga extends EventEmitter {
  _tempSaveCounter = 0;
  _tempSavePrefix = 'omegga_plugin_temp_';

  writeln: (line: string) => void;
  version: number;
  players: Player[];
  logWrangler: LogWrangler;
  addMatcher: LogWrangler['addMatcher'];
  addWatcher: LogWrangler['addWatcher'];
  watchLogArray: LogWrangler['watchLogArray'];
  watchLogChunk: LogWrangler['watchLogChunk'];

  getServerStatus: () => Promise<IServerStatus>;
  listMinigames: () => Promise<IMinigameList>;
  getAllPlayerPositions: () => Promise<IPlayerPositions>;
  getMinigames: () => Promise<ILogMinigame[]>;
  host: { id: string; name: string };

  started: boolean;
  starting: boolean;
  stopping: boolean;
  currentMap: string;

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
        (this.players = players.map(
          p => new Player(this as unknown as Omegga, ...p)
        ))
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
}

// copy prototypes from core omegga to the proxy omegga
for (const fn of STEAL_PROTOTYPES) {
  (ProxyOmegga.prototype as any)[fn] = (Omegga.prototype as any)[fn];
}
