import Logger from '@/logger';
import {
  type OmeggaLike,
  type OmeggaPlayer,
  type PluginInterop,
} from '@/plugin';
import {
  BRICKADIA_AUTH_FILES,
  CONFIG_AUTH_DIR,
  CONFIG_HOME,
  CONFIG_SAVED_DIR,
  DATA_PATH,
} from '@/softconfig';
import { VERSION } from '@/version';
import { type EnvironmentPreset } from '@brickadia/presets';
import {
  type BRBanList,
  type BRPlayerNameCache,
  type BRRoleAssignments,
  type BRRoleSetup,
} from '@brickadia/types';
import { type IConfig } from '@config/types';
import { map as mapUtils, pattern, uuid } from '@util';
import { readBrdbRevisions } from '@util/brdb';
import { copyFiles, mkdir, readWatchedJSON } from '@util/file';
import MetricsServer from '@/metrics';
import {
  recordUncaughtException,
  recordUnhandledRejection,
} from '@/metrics/errors';
import Webserver from '@webserver/backend';
import brs, {
  WorldReader,
  writeBrzLegacy,
  type ReadSaveObject,
  type WriteSaveObject,
} from 'brs-js';
import 'colors';
import glob from 'glob';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'path';
import { type AutoRestartConfig } from '..';
import commandInjector from './commandInjector';
import {
  type ConsoleCommands,
  EA2_VERSION,
  PREFAB_VERSION,
  resolveConsoleCommands,
} from './commands';
import MATCHERS from './matchers';
import { readBinaryVersion } from './matchers/version';
// imported for its side effect: registers the global Player helper
import './player';
import { PluginLoader } from './plugin';
import {
  type IGamemode,
  type ILogMinigame,
  type IMinigameList,
  type IOmeggaOptions,
  type IPlayerPositions,
  type IServerStatus,
} from './types';
import OmeggaWrapper from './wrapper';

const MISSING_CMD =
  '"Command not found. Type <color=\\"ffff00\\">/help</> for a list of commands or <color=\\"ffff00\\">/plugins</> for plugin information."';

// Prefab.SaveRegion requires a region; when saving the whole world we pass a
// maximal extent centered on the origin to capture everything.
const WHOLE_WORLD_EXTENT = 1_000_000_000;

// These helpers are module-level (not class methods) on purpose: safe plugins
// call these methods through a ProxyOmegga whose prototype steals Omegga's
// implementations (see injectOmeggaPrototypes). A `#private` method would fail
// the brand check when `this` is a ProxyOmegga ("Receiver must be an instance
// of class Omegga"), so anything a stolen method depends on must not be
// `#private`. Module functions keep working regardless of the receiver.

/**
 * Whether the running game version has removed the legacy .brs bricks console
 * commands (Bricks.Save/Load/ClearAll/ClearRegion, World.LoadAdditive) in
 * favor of the prefab (`br.Prefab.*`) and world (`br.World.Clear*`) commands.
 * Removed at Brickadia CL{@link PREFAB_VERSION}.
 */
function brsRemoved(version: number): boolean {
  return version > 0 && version >= PREFAB_VERSION;
}

/**
 * Warn that a method backed by a removed console command is a no-op on the
 * running game version, and return whether the caller should bail.
 * @param version the running game version
 * @param method the omegga method being called (for the message)
 * @param since CL version the underlying command was removed at
 * @param release human release name for that version (e.g. `EA2`, `EA3`)
 * @param replacement suggested replacement method/API
 */
function warnRemoved(
  version: number,
  method: string,
  since: number,
  release: string,
  replacement: string,
): boolean {
  if (!(version > 0 && version >= since)) return false;
  Logger.warnp(
    `omegga.${method}() uses a console command removed in Brickadia ` +
      `${release}. This call has no effect - use ${replacement} instead.`,
  );
  return true;
}

/**
 * Resolve `name` to an existing file inside `dir`, appending `ext` when it is
 * missing. `name` may be a bare name, a relative path, or an absolute path --
 * `resolve` (unlike `join`) lets callers pass an absolute path from one of
 * these getters straight back into an api that takes a name.
 * @returns the absolute path, or undefined if it does not exist or escapes `dir`
 */
export function resolveInDir(
  dir: string,
  name: string,
  ext: string,
): string | undefined {
  if (typeof name !== 'string' || !name) return undefined;
  const file = resolve(
    dir,
    name.toLowerCase().endsWith(ext) ? name : name + ext,
  );
  // keep the file inside dir (guards against `..` traversal)
  if (!file.startsWith(dir.endsWith(sep) ? dir : dir + sep)) return undefined;
  return existsSync(file) ? file : undefined;
}

/**
 * Read a `.brz` prefab file (EA3) into a legacy save object. Brick geometry,
 * ownership, assets, materials, and components are reconstructed; wires are
 * not (the save-level `wires` array is left empty). Component names/data are
 * EA3-native (e.g. `Component_Internal_Seat`), not the legacy `BCD_*` names.
 *
 * This is a plain function rather than a method because `readSaveData` and
 * `getSaveData` are handed to safe plugins via STEAL_PROTOTYPES and run with
 * `this` bound to the plugin's proxy omegga, which has no private methods on
 * it -- calling `this.readPrefabData(...)` there throws "not a function".
 */
function readPrefabData(
  omegga: {
    version: number;
    currentMap?: string;
    host?: { id: string; name: string };
  },
  file: string,
  { nobricks = false } = {},
): ReadSaveObject {
  // gridId 1 is the world's main brick grid (MAIN_GRID); entity sub-grids
  // (>=2) are not captured, matching reader.bricks()'s default.
  const MAIN_GRID = 1;
  const reader = WorldReader.from(new Uint8Array(readFileSync(file)));
  const bricks = nobricks
    ? []
    : [...reader.bricks(MAIN_GRID)].map(b => ({
        ...b,
        physical_index: 0,
        components: {} as Record<string, unknown>,
      }));

  // Attach components to their bricks. Components are stored per chunk with a
  // chunk-local brick index; reader.bricks() yields bricks in the same chunk
  // order as brickChunkIndex(), so a running offset maps the chunk-local
  // index onto the flat bricks array.
  if (!nobricks) {
    let brickOffset = 0;
    for (const chunk of reader.brickChunkIndex(MAIN_GRID)) {
      if (chunk.numComponents > 0) {
        const { components } = reader.componentChunk(MAIN_GRID, chunk.index);
        for (const c of components) {
          const brick = bricks[brickOffset + c.brickIndex];
          if (brick) brick.components[c.typeName] = c.data ?? {};
        }
      }
      brickOffset += chunk.numBricks;
    }
  }

  return {
    version: 10,
    map: omegga.currentMap ?? 'Unknown',
    author: { id: omegga.host?.id ?? '', name: omegga.host?.name ?? '' },
    host: { id: omegga.host?.id ?? '', name: omegga.host?.name ?? '' },
    description: '',
    brick_count: bricks.length,
    mods: [],
    brick_assets: reader.brickAssets(),
    colors: [],
    materials: reader.materials(),
    physical_materials: [],
    brick_owners: reader.brickOwners(),
    game_version: omegga.version,
    save_time: new Uint8Array(),
    bricks,
    components: {},
  } as ReadSaveObject;
}

/**
 * Write a save to a temporary `.brz` prefab in the prefab directory (EA3).
 * @returns the bare path ref for `br.Prefab.*` commands (no `Prefabs/` prefix
 * or `.brz` extension) and the absolute file path for cleanup.
 */
function writeTempPrefab(
  omegga: {
    prefabPath: string;
    _tempSavePrefix: string;
    _tempCounter: { save: number };
  },
  saveData: WriteSaveObject,
): { ref: string; file: string } {
  const ref =
    omegga._tempSavePrefix + Date.now() + '_' + omegga._tempCounter.save++;
  const file = join(omegga.prefabPath, ref + '.brz');
  if (!file.startsWith(omegga.prefabPath))
    throw 'prefab file not in Saved/Prefabs directory';
  mkdir(omegga.prefabPath);
  writeFileSync(file, new Uint8Array(writeBrzLegacy(saveData)));
  return { ref, file };
}

// TODO: safe broadcast parsing

export default class Omegga extends OmeggaWrapper implements OmeggaLike {
  /** The save counter prevents omegga from saving over the same file */
  _tempCounter = { save: 0, environment: 0 };
  /** The save prefix is prepended to all temporary saves */
  _tempSavePrefix = 'omegga_temp_';

  // pluginloader is not private so plugins can potentially add more formats
  // undefined when plugins are disabled (--noplugin)
  pluginLoader: PluginLoader | undefined = undefined;
  // undefined when the web ui is disabled (--noweb)
  webserver: Webserver | undefined;
  // undefined unless metrics.enabled is set in the config
  metrics: MetricsServer | undefined;

  verbose: boolean;
  savePath: string;
  worldPath: string;
  prefabPath: string;
  presetPath: string;
  configPath: string;
  binaryPath: string | null;
  options: IOmeggaOptions;

  version: number;

  /** memoized version-resolved console commands ({@link Console}) */
  #console: { version: number; commands: ConsoleCommands } | undefined;

  /**
   * version-resolved Brickadia console command names, nested by namespace.
   * e.g. `omegga.Console.Bricks.Clear` -> "Bricks.Clear" or "br.Bricks.Clear"
   * depending on the running game version.
   */
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

  host?: { id: string; name: string };
  players: OmeggaPlayer[];

  started = false;
  starting = false;
  stopping = false;
  crashDetected = false;
  currentMap: string;

  // assigned by commandInjector() in the constructor
  getServerStatus!: () => Promise<IServerStatus>;
  listMinigames!: () => Promise<IMinigameList>;
  getAllPlayerPositions!: () => Promise<IPlayerPositions>;
  getMinigames!: () => Promise<ILogMinigame[]>;
  getGamemode!: () => Promise<IGamemode | null>;

  /**
   * Omegga instance
   */
  constructor(serverPath: string, cfg: IConfig, options: IOmeggaOptions = {}) {
    super(serverPath, cfg);
    this.verbose = Logger.VERBOSE;

    Logger.verbose('Running omegga', `v${VERSION}`.green);
    Logger.verbose('Versions', process.versions);
    Logger.verbose('Config', {
      ...cfg,
      credentials: cfg.credentials
        ? Object.fromEntries(
            Object.entries(cfg.credentials).map(([k, v]) => [k, v ? '***' : v]),
          )
        : cfg.credentials,
      server: {
        ...cfg.server,
        ...(cfg.server.password && { password: '***' }),
        ...(cfg.server.steambetaPassword && { steambetaPassword: '***' }),
        ...(cfg.server.launchArgs && {
          launchArgs: cfg.server.launchArgs
            .replace(/-Cookie=".*?"/g, '-Cookie="<hidden>"')
            .replace(/-Cookie=\S+/g, '-Cookie=<hidden>'),
        }),
      },
    });

    // inject commands
    Logger.verbose('Setting up command injector');
    commandInjector(this, this.logWrangler);

    // launch options (disabling webserver)
    this.options = options;
    const savedDir = cfg.server.savedDir ?? CONFIG_SAVED_DIR;

    // path to save files
    this.savePath = join(this.path, DATA_PATH, savedDir, 'Builds');
    this.worldPath = join(this.path, DATA_PATH, savedDir, 'Worlds');
    this.prefabPath = join(this.path, DATA_PATH, savedDir, 'Prefabs');

    this.presetPath = join(this.path, DATA_PATH, savedDir, 'Presets');

    // path to config files
    this.configPath = join(this.path, DATA_PATH, savedDir, 'Server');

    // directory the game binary and the files shipped beside it live in
    this.binaryPath = this.getGameBinaryDir();

    // create dir folders
    Logger.verbose('Creating directories');
    mkdir(this.savePath);
    mkdir(this.configPath);

    // ignore auth file copy
    if (!options.noauth) {
      Logger.verbose('Copying auth files');
      this.copyAuthFiles();
    }

    // create the webserver if it's enabled
    // the web interface provides access to server information while the server is running
    // and lets you view chat logs, disable plugins, etc
    if (!options.noweb) {
      Logger.verbose('Creating webserver');
      this.webserver = new Webserver(cfg.omegga ?? {}, this);
    }

    // the prometheus endpoint is independent of the web ui, so that metrics
    // still work with `omegga.webui: false`
    if (cfg.metrics?.enabled) {
      Logger.verbose('Creating metrics server');
      this.metrics = new MetricsServer(this, cfg.metrics);
    }

    if (!options.noplugin) {
      Logger.verbose('Creating plugin loader');
      this.pluginLoader = new PluginLoader(this.path, this);
    }

    /** @type {Array<Player>}list of online players */
    this.players = [];

    /** host player info `{id: uuid, name: player name}` */
    this.host = undefined;

    /** @type {String} current game version - may later be turned into CL#### versions */
    this.version = -1;

    /** @type {Boolean} whether server has started */
    this.started = false;
    /** @type {Boolean} whether server is starting up */
    this.starting = false;

    /** @type {String} current map */
    this.currentMap = '';

    // add all the matchers to the server
    Logger.verbose('Adding matchers');
    for (const matcher of MATCHERS) {
      const { pattern, callback } = matcher(this);
      this.addMatcher(pattern, callback);
    }

    // Node's default for an unhandled rejection is to throw, which lands in the
    // uncaughtException handler below. Registering a listener here suppresses
    // that default, so this one rethrows to keep omegga's crash behaviour
    // exactly as it was; the rejection is counted on its way through.
    process.on('unhandledRejection', err => {
      recordUnhandledRejection();
      throw err;
    });

    let handlingException = false;
    process.on('uncaughtException', async err => {
      // an exception thrown while handling one (a closed terminal, a broken
      // database) rejects this handler, which node routes right back into
      // uncaughtException - without this guard that loops forever
      if (handlingException) {
        console.error('Uncaught exception while shutting down', err);
        process.exit(1);
      }
      handlingException = true;

      recordUncaughtException();

      try {
        Logger.verbose('Uncaught exception', err);
        this.emit('error', err);

        // publish stop to database
        this.webserver?.database?.addChatLog('server', {}, 'Server error');

        await this.stop();
      } catch (e) {
        console.error(e);
      }
      process.exit();
    });

    // when brickadia starts, mark the server as started
    this.on('start', ({ map }) => {
      this.started = true;
      this.starting = false;
      this.currentMap = map;
      this.writeln(`${this.Console.Chat.MessageForUnknownCommands} 0`);

      this.restoreServer();
    });

    // detect engine crash from stderr or stdout
    const crashHandler = (line: string) => {
      if (
        !this.crashDetected &&
        (/Engine crash handling finished; re-raising signal \d+ for the default handler\. Good bye\./.test(
          line,
        ) ||
          /LogCore: === Critical error: ===/.test(line))
      ) {
        Logger.error('Engine crash detected!');
        this.crashDetected = true;
      }
    };
    this.on('err', crashHandler);
    this.on('line', crashHandler);

    // when brickadia exits, stop omegga
    this.on('exit', () => {
      this.stop();
    });

    // when the process closes, emit the exit signal and stop
    this.on('closed', () => {
      // capture crash state before 'exit' handler triggers stop()
      const wasCrash = this.crashDetected;
      this.crashDetected = false;
      if (this.started) this.emit('exit');
      const doRestart = async () => {
        if (!wasCrash) return;
        try {
          const config = await this.webserver?.database?.getAutoRestartConfig();
          if (config?.crashRestartEnabled) {
            Logger.logp('Restarting server after crash...');
            this.webserver?.database?.addChatLog(
              'server',
              {},
              'Server crashed, restarting...',
            );
            await this.start();
          }
        } catch (err) {
          Logger.error('Error restarting after crash', err);
        }
      };
      if (!this.stopping) {
        this.stop().then(doRestart);
      } else {
        // stop() already in progress from 'exit' handler - wait for it to finish
        this.once('server:stopped', () => doRestart());
      }
    });

    // detect when the game reports a command does not exist
    this.on('unknownCommand', (name: string, cmd: string) => {
      // if it's not registered to a plugin, send the missing command message
      if (!this.pluginLoader || !this.pluginLoader.isCommand(cmd)) {
        this.whisper(name, MISSING_CMD);
      }
    });
  }

  /** attempt to save server state */
  async saveServer(config: AutoRestartConfig) {
    if (config.players && this.players.length > 0) {
      Logger.logp('Getting player positions...');
      const players = await this.getAllPlayerPositions();
      Logger.logp(`Saving ${players.length} player positions...`);
      const data = players
        .filter(p => !p.isDead && p.pos)
        .map(p => ({ position: p.pos, id: p.player.id }));
      if (players.length > 0)
        writeFileSync(
          join(this.path, DATA_PATH, 'omegga_temp_players.json'),
          JSON.stringify(data),
        );
    }

    if (config.saveWorld) {
      Logger.logp('Saving world...');
      await this.saveWorld();
    }
  }

  async restartServer() {
    if (this.starting || this.stopping) return;
    if (!this.started) return await this.start();

    const nextWorld = this.getNextWorld();
    if (nextWorld) {
      Logger.logp('Loading world', nextWorld.file.yellow);
      Logger.verbose('Next world configured from', nextWorld.source.yellow);
      this.loadWorld(nextWorld.file);
    } else {
      this.changeMap(this.currentMap);
    }

    const res = await Promise.race([
      // wait for the map to change
      new Promise(resolve =>
        this.once('mapchange', () => resolve('mapchange')),
      ),
      // Timeout after 10 seconds
      new Promise(resolve => setTimeout(() => resolve('timeout'), 10000)),
    ]);
    Logger.verbose('Restart result:', res);
  }

  /** attempt to restore the server's state */
  async restoreServer() {
    const tempPlayersFile = join(
      this.path,
      DATA_PATH,
      'omegga_temp_players.json',
    );
    if (!existsSync(tempPlayersFile)) return;

    try {
      Logger.logp('Loading previous player positions...');

      // player positions are an array to address multi-clienting
      const players: { position: number[]; id: string }[] = JSON.parse(
        readFileSync(tempPlayersFile).toString(),
      );

      // restore player position on join
      const callback = (player: OmeggaPlayer) => {
        const index = players.findIndex(p => p.id === player.id);
        if (index > -1) {
          const { position } = players[index];
          this.writeln(
            `${this.Console.Chat.Command} /TP "${player.name}" ${position.join(' ')} 0`,
          );

          // remove the entry
          players[index] = players[players.length - 1];
          players.pop();
        }
      };
      this.on('join', callback);

      const timeout = setTimeout(() => {
        try {
          this.off('join', callback);
          if (existsSync(tempPlayersFile)) unlinkSync(tempPlayersFile);
        } catch (err) {
          Logger.error('Error removing omegga_temp_players.json', err);
        }
      }, 10000);
      this.once('changemap', () => {
        clearTimeout(timeout);
        this.off('join', callback);
      });
    } catch (err) {
      Logger.error('Error restoring previous server state', err);
    }
  }

  /**
   * start webserver, load plugins, start the brickadia server
   * this should not be called by a plugin
   */
  //
  async start(): Promise<any> {
    this.starting = true;

    // Resolve the game version straight from the server binary before plugins
    // load, so `omegga.version` is valid at plugin `init` time (e.g. for
    // readSaveData) instead of staying -1 until the game boots and writes its
    // log.
    //
    // This re-resolves on every start, not just the first: a steam update can
    // replace the binary between restarts (the process is reused by the crash
    // handler and restartServer), so a version cached from a previous boot goes
    // stale. When the binary can't be read (e.g. launcher-managed installs) we
    // reset to -1 so the log parser (matchers/version) re-detects this boot.
    const binVersion = readBinaryVersion(this.getGameBinaryPath());
    this.version = binVersion ?? -1;
    if (binVersion != null) {
      Logger.verbose('Brickadia Version (from binary)', binVersion);
      // plugins that aren't reloaded on restart only learn the new version
      // through this event (reloaded ones get it via bootstrap)
      this.emit('version', binVersion);
    }

    // started before the webserver so a port clash surfaces early, and before
    // plugins so their metric registrations have somewhere to land
    if (this.metrics) await this.metrics.start();
    if (this.webserver) await this.webserver.start();
    if (this.pluginLoader) {
      // scan for plugins
      Logger.verbose('Scanning for plugins');
      await this.pluginLoader.scan();

      // load the plugins
      Logger.verbose('Loading plugins');
      await this.pluginLoader.reload();
    }

    Logger.verbose('Starting Brickadia');
    super.start();
    this.emit('server:starting');
  }

  /**
   * unload plugins and stop the server
   * this should not be called by a plugin
   */
  async stop() {
    if (!this.started && !this.starting) {
      Logger.verbose("Stop called while server wasn't started or was starting");
      return;
    }

    if (this.stopping) {
      Logger.verbose('Stop called while server was starting');
      return;
    }

    this.stopping = true;
    this.emit('server:stopping');
    if (this.pluginLoader) {
      Logger.verbose('Unloading plugins');
      await this.pluginLoader.unload();
    }
    Logger.verbose('Stopping server');
    super.stop();

    const res = await Promise.race([
      new Promise(resolve => this.once('exit', () => resolve('exit'))),
      // Timeout after 10 seconds
      new Promise(resolve => setTimeout(() => resolve('timeout'), 10000)),
    ]);

    Logger.verbose('Stop result:', res);
    if (this.stopping) this.emit('server:stopped');
    this.stopping = false;
    this.started = false;
    this.starting = false;
    this.players = [];
  }

  /**
   * Copies auth files from home config dir
   * this should never be called by a plugin
   */
  copyAuthFiles() {
    const authDir = this.config.server.authDir ?? CONFIG_AUTH_DIR;
    const savedDir = this.config.server.savedDir ?? CONFIG_SAVED_DIR;
    const authPath = join(this.path, DATA_PATH, savedDir, authDir);
    const homeAuthPath = join(
      CONFIG_HOME,
      (savedDir !== CONFIG_SAVED_DIR ? savedDir : '') + authDir,
    );

    copyFiles(homeAuthPath, authPath, BRICKADIA_AUTH_FILES);
  }

  // TODO: split messages that longer than 512 characters
  // TODO: delete characters that are known to crash the game
  broadcast(...messages: string[]) {
    messages
      .flatMap(m => m.toString().split('\n'))
      .filter(m => m.length < 512)
      .forEach(m => this.writeln(`${this.Console.Chat.Broadcast} ${m}`));
  }

  whisper(target: string | OmeggaPlayer, ...messages: string[]) {
    // find the target player
    const player = typeof target !== 'object' ? this.getPlayer(target) : target;

    // player may have left before the message could be sent
    if (!player) return;

    // whisper the messages to that player
    messages
      .flatMap(m => m.toString().split('\n'))
      .filter(m => m.length < 512)
      .forEach(m =>
        this.writeln(`${this.Console.Chat.Whisper} "${player.name}" ${m}`),
      );
  }

  middlePrint(target: string | OmeggaPlayer, message: string) {
    // find the target player
    const player = typeof target !== 'object' ? this.getPlayer(target) : target;

    // player may have left before the message could be sent
    if (!player) return;

    // whisper the messages to that player
    if (message.length > 512) return;
    this.writeln(
      `${this.Console.Chat.StatusMessage} "${player.name}" ${message}`,
    );
  }

  getPlayers(): {
    id: string;
    name: string;
    displayName: string;
    controller: string;
    state: string;
  }[] {
    return this.players.map(p => ({ ...p }));
  }

  getRoleSetup(): BRRoleSetup {
    // Read RoleSetup2, fallback to old RoleSetup if it doesn't exist
    return (readWatchedJSON(join(this.configPath, 'RoleSetup2.json')) ??
      readWatchedJSON(join(this.configPath, 'RoleSetup.json'))) as BRRoleSetup;
  }

  getRoleAssignments(): BRRoleAssignments {
    return readWatchedJSON(
      join(this.configPath, 'RoleAssignments.json'),
    ) as BRRoleAssignments;
  }

  getBanList(): BRBanList {
    return readWatchedJSON(join(this.configPath, 'BanList.json')) as BRBanList;
  }

  getNameCache(): BRPlayerNameCache {
    return readWatchedJSON(
      join(this.configPath, 'PlayerNameCache.json'),
    ) as BRPlayerNameCache;
  }

  getPlayer(target: string): OmeggaPlayer | null {
    return (
      this.players.find(
        p =>
          p.name === target ||
          p.id === target ||
          p.controller === target ||
          p.state === target,
      ) ?? null
    );
  }

  findPlayerByName(name: string): OmeggaPlayer | null {
    name = name.toLowerCase();
    const exploded = pattern.explode(name);
    return (
      this.players.find(p => p.name === name || p.displayName === name) || // find by exact match
      this.players.find(
        p => p.name.indexOf(name) > -1 || p.displayName.indexOf(name) > -1,
      ) || // find by rough match
      this.players.find(
        p => p.name.match(exploded) || p.displayName.match(exploded),
      ) || // find by exploded regex match (ck finds cake, tbp finds TheBlackParrot)
      null
    );
  }

  getHostId(): string {
    return this.host?.id ?? '';
  }

  saveMinigame(index: number, name: string) {
    this.writeln(
      `${this.Console.Server.Minigames.SavePreset} ${index} "${name}"`,
    );
  }

  deleteMinigame(index: number) {
    this.writeln(`${this.Console.Server.Minigames.Delete} ${index}`);
  }

  resetMinigame(index: number) {
    this.writeln(`${this.Console.Server.Minigames.Reset} ${index}`);
  }

  nextRoundMinigame(index: number) {
    this.writeln(`${this.Console.Server.Minigames.NextRound} ${index}`);
  }

  loadMinigame(presetName: string, owner = '') {
    this.writeln(
      `${this.Console.Server.Minigames.LoadPreset} "${presetName}" ${owner ? `"${owner}"` : ''}`,
    );
  }

  getMinigamePresets(): string[] {
    const presetPath = join(this.presetPath, 'Minigame');
    return existsSync(presetPath)
      ? glob
          .sync(presetPath + '/**/*.bp')
          .map(f => basename(f).replace(/\.bp$/, ''))
      : [];
  }

  resetEnvironment() {
    this.writeln(`${this.Console.Server.Environment.Reset}`);
  }

  async saveEnvironment(presetName: string): Promise<void> {
    await this.addWatcher(/Environment preset saved.$/, {
      // request the pawn for this player's controller (should only be one)
      exec: () =>
        this.writeln(
          `${this.Console.Server.Environment.SavePreset} "${presetName}"`,
        ),
      timeoutDelay: 100,
    });
  }

  async getEnvironmentData(): Promise<EnvironmentPreset | null> {
    const saveName =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.environment++;

    await this.saveEnvironment(saveName);
    const data = this.readEnvironmentData(saveName);
    const file = join(this.presetPath, 'Environment', saveName + '.bp');
    if (existsSync(file)) unlinkSync(file);

    return data;
  }

  readEnvironmentData(saveName: string): EnvironmentPreset | null {
    if (typeof saveName !== 'string')
      throw 'expected name argument for readEnvironmentData';

    const file = join(this.presetPath, 'Environment', saveName + '.bp');
    try {
      if (existsSync(file)) return JSON.parse(readFileSync(file).toString());
    } catch (err) {
      Logger.verbose('Error parsing save data in readEnvironmentData', err);
    }
    return null;
  }

  loadEnvironment(presetName: string) {
    this.writeln(`${this.Console.Server.Environment.LoadPreset} ${presetName}`);
  }

  loadEnvironmentData(
    preset:
      | EnvironmentPreset
      | NonNullable<EnvironmentPreset['data']>['groups'],
  ) {
    // a nullish preset would otherwise silently apply an empty environment
    if (!preset) throw new Error('loadEnvironmentData requires a preset');
    if ('data' in preset) preset = preset.data?.groups;

    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.environment++;

    const path = join(this.presetPath, 'Environment', saveFile + '.bp');

    writeFileSync(
      path,
      JSON.stringify({
        formatVersion: '1',
        presetVersion: '1',
        type: 'Environment',
        data: {
          groups: {
            ...preset,
          },
        },
      }),
    );

    this.loadEnvironment(saveFile);

    // this is lazy, but environments should load much faster than builds
    // do, so it's not really worth keeping track of logs for this
    setTimeout(() => unlinkSync(path), 5000);
  }

  getEnvironmentPresets(): string[] {
    const presetPath = join(this.presetPath, 'Environment');
    return existsSync(presetPath)
      ? glob
          .sync(presetPath + '/**/*.bp')
          .map(f => basename(f).replace(/\.bp$/, ''))
      : [];
  }

  clearBricks(target: string | { id: string }, quiet = false) {
    // target is a player object, just use that id
    let id: string | null;
    if (typeof target === 'object') id = target.id;
    // if the target isn't a uuid already, find the player by name or controller and use that uuid
    else if (!uuid.match(target)) {
      // only set the target if the player exists
      id = this.getPlayer(target)?.id ?? null;
    } else id = target;

    if (!id) return;

    this.writeln(`${this.Console.Bricks.Clear} ${id} ${quiet ? 1 : ''}`);
  }

  clearRegion(
    region: {
      center: [number, number, number];
      extent: [number, number, number];
    },
    options?: {
      target?: string | OmeggaPlayer;
      /** clear bricks in the region (default true) */
      bricks?: boolean;
      /** also clear entities in the region (default false, EA3 only) */
      entities?: boolean;
    },
  ) {
    // resolve the optional owner filter (player object, uuid, or name) to a uuid
    let target = '';
    const rawTarget = options?.target;
    if (rawTarget) {
      if (typeof rawTarget === 'object') target = rawTarget.id;
      else if (uuid.match(rawTarget)) target = rawTarget;
      else target = this.getPlayer(rawTarget)?.id ?? '';
    }

    const center = region.center.join(' ');
    const extent = region.extent.join(' ');

    if (brsRemoved(this.version)) {
      // br.World.ClearRegion <Center> <Extent> [ClearBricks] [ClearEntities] [FilterUserId]
      const bricks = (options?.bricks ?? true) ? 1 : 0;
      const entities = (options?.entities ?? false) ? 1 : 0;
      this.writeln(
        `${this.Console.World.ClearRegion} ${center} ${extent} ${bricks} ${entities}${
          target ? ' ' + target : ''
        }`,
      );
      return;
    }

    // legacy .brs region clear (bricks only)
    this.writeln(
      `${this.Console.Bricks.ClearRegion} ${center} ${extent}${
        target ? ' ' + target : ''
      }`,
    );
  }

  clearAllBricks(
    options:
      | boolean
      | { quiet?: boolean; bricks?: boolean; entities?: boolean } = {},
  ) {
    // backwards compat: a bare boolean is the legacy `quiet` argument
    const {
      quiet = false,
      bricks = true,
      entities = false,
    } = typeof options === 'boolean' ? { quiet: options } : options;

    if (brsRemoved(this.version)) {
      // br.World.ClearAll [ClearBricks] [ClearEntities] [Silent]
      this.writeln(
        `${this.Console.World.ClearAll} ${bricks ? 1 : 0} ${
          entities ? 1 : 0
        } ${quiet ? 1 : 0}`,
      );
      return;
    }
    // legacy Bricks.ClearAll only ever cleared bricks
    this.writeln(`${this.Console.Bricks.ClearAll} ${quiet ? 1 : ''}`);
  }

  saveBricks(
    saveName: string,
    region?: {
      center: [number, number, number];
      extent: [number, number, number];
    },
  ) {
    if (
      warnRemoved(
        this.version,
        'saveBricks',
        PREFAB_VERSION,
        'EA3',
        'savePrefab',
      )
    )
      return;
    if (!saveName) return;

    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;

    if (region?.center && region?.extent)
      this.writeln(
        `${this.Console.Bricks.SaveRegion} ${saveName} ${region.center.join(
          ' ',
        )} ${region.extent.join(' ')}`,
      );
    else this.writeln(`${this.Console.Bricks.Save} ${saveName}`);
  }

  async saveBricksAsync(
    saveName: string,
    region?: {
      center: [number, number, number];
      extent: [number, number, number];
    },
  ): Promise<void> {
    if (
      warnRemoved(
        this.version,
        'saveBricksAsync',
        PREFAB_VERSION,
        'EA3',
        'savePrefabAsync',
      )
    )
      return;
    if (!saveName) return;

    let saveNameClean = saveName;
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveNameClean = `"${saveName}"`;

    const command =
      region?.center && region?.extent
        ? `${this.Console.Bricks.SaveRegion} ${saveNameClean} ${region.center.join(
            ' ',
          )} ${region.extent.join(' ')}`
        : `${this.Console.Bricks.Save} ${saveNameClean}`;

    // wait for the server to save the file
    await this.watchLogChunk(command, /^(LogBrickSerializer|LogTemp): (.+)$/, {
      first: match => match[0].endsWith(saveName + '.brs...'),
      last: match =>
        Boolean(
          match[2].match(
            /Saved .+ bricks and .+ components from .+ owners|Error: No bricks in grid!|Error: No bricks selected to save!/,
          ),
        ),
      afterMatchDelay: 0,
      timeoutDelay: 30000,
    });
  }

  loadBricks(
    saveName: string,
    {
      offX = 0,
      offY = 0,
      offZ = 0,
      quiet = false,
      correctPalette = false,
      correctCustom = false,
    } = {},
  ) {
    if (
      warnRemoved(
        this.version,
        'loadBricks',
        PREFAB_VERSION,
        'EA3',
        'loadPrefab',
      )
    )
      return;
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;

    this.writeln(
      `${this.Console.Bricks.Load} ${saveName} ${offX} ${offY} ${offZ} ${
        quiet ? 1 : 0
      } ${correctPalette ? 1 : 0} ${correctCustom ? 1 : 0}`,
    );
  }

  loadBricksOnPlayer(
    saveName: string,
    player: string | OmeggaPlayer,
    {
      offX = 0,
      offY = 0,
      offZ = 0,
      correctPalette = false,
      correctCustom = false,
    } = {},
  ) {
    if (
      warnRemoved(
        this.version,
        'loadBricksOnPlayer',
        EA2_VERSION,
        'EA2',
        'loadPrefabOnPlayer',
      )
    )
      return;
    const target = typeof player === 'string' ? this.getPlayer(player) : player;
    if (!target) return;

    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;

    this.writeln(
      `${this.Console.Bricks.LoadTemplate} ${saveName} ${offX} ${offY} ${offZ}  ${
        correctPalette ? 1 : 0
      } ${correctCustom ? 1 : 0} "${target.name}"`,
    );
  }

  getSaves(): string[] {
    return existsSync(this.savePath)
      ? glob.sync(this.savePath + '/**/*.brs')
      : [];
  }

  getWorlds(): string[] {
    return existsSync(this.worldPath)
      ? glob.sync(this.worldPath + '/**/*.brdb')
      : [];
  }

  getPrefabs(): string[] {
    return existsSync(this.prefabPath)
      ? glob.sync(this.prefabPath + '/**/*.brz')
      : [];
  }

  getSavePath(saveName: string) {
    return resolveInDir(this.savePath, saveName, '.brs');
  }

  getPrefabPath(prefabName: string) {
    return resolveInDir(this.prefabPath, prefabName, '.brz');
  }

  getWorldPath(worldName: string) {
    return resolveInDir(this.worldPath, worldName, '.brdb');
  }

  async getWorldRevisions(worldName: string) {
    worldName = worldName.replace(/\.brdb$/i, '');

    const path = this.getWorldPath(worldName);
    if (!worldName || !path) {
      throw new Error(`World "${worldName}" does not exist`);
    }

    // Revisions are read directly from the .brdb bundle (SQLite), so this no
    // longer requires the server to be running or a console round-trip. The
    // brdb revision indices/notes match the game's World.ListRevisions output.
    return readBrdbRevisions(path) ?? [];
  }

  async loadWorld(worldName: string): Promise<boolean> {
    worldName = worldName.replace(/\.brdb$/i, '');
    if (!worldName || !this.getWorldPath(worldName)) return false;
    this.writeln(`${this.Console.World.Load} "${worldName}"`);
    const res = await Promise.race([
      // wait for the map to change
      new Promise(resolve =>
        this.once('mapchange', () => resolve('mapchange')),
      ),
      // Timeout after 10 seconds
      new Promise(resolve => setTimeout(() => resolve('timeout'), 10000)),
    ]);
    Logger.verbose('LoadWorld', worldName, 'result:', res);
    return res === 'mapchange';
  }

  async loadWorldRevision(
    worldName: string,
    revision: number,
  ): Promise<boolean> {
    worldName = worldName.replace(/\.brdb$/i, '');
    if (!worldName || !this.getWorldPath(worldName)) return false;
    if (typeof revision !== 'number' || revision < 1) {
      throw new Error(`Invalid revision number: ${revision}`);
    }
    this.writeln(
      `${this.Console.World.LoadRevision} "${worldName}" ${revision}`,
    );
    const res = await Promise.race([
      // wait for the map to change
      new Promise(resolve =>
        this.once('mapchange', () => resolve('mapchange')),
      ),
      // Timeout after 10 seconds
      new Promise(resolve => setTimeout(() => resolve('timeout'), 10000)),
    ]);
    Logger.verbose('LoadWorld', worldName, 'result:', res);
    return res === 'mapchange';
  }

  async saveWorldAs(worldName: string) {
    if (!worldName) return false;
    if (this.stopping || this.starting || !this.started) return false;

    if (this.getWorldPath(worldName)) {
      return false;
    }
    worldName = worldName.replace(/\.brdb$/i, '');

    try {
      const match = await this.addWatcher<{ res: boolean }>(
        (_line, match) => {
          if (match?.groups?.generator !== 'LogBRWorldManager') return;

          const ok = match.groups.data.match(/^World files saved after /);
          const err =
            !match.groups.data.startsWith(
              'Error: Failed to capture minigame settings',
            ) &&
            match.groups.data.match(
              /^Error: (World already exists|Failed to create new world)?/,
            );
          return ok ? { res: true } : err ? { res: false } : undefined;
        },
        {
          exec: () => {
            this.writeln(`${this.Console.World.SaveAs} "${worldName}"`);
          },
          timeoutDelay: 2000,
        },
      );
      return match?.[0]?.['res'] ?? false;
    } catch {
      return false;
    }
  }

  async saveWorld(): Promise<boolean> {
    // Don't allow saving while the server is starting or stopping
    if (this.stopping || this.starting || !this.started) return false;

    try {
      const match = await this.addWatcher<{ res: boolean }>(
        (_line, match) => {
          if (match?.groups?.generator !== 'LogBRWorldManager') return;

          const ok = match.groups.data.match(/^World files saved after /);
          const err =
            !match.groups.data.startsWith(
              'Error: Failed to capture minigame settings',
            ) &&
            match.groups.data.match(/^Error: (World has not been saved\.)?/);
          return ok ? { res: true } : err ? { res: false } : undefined;
        },
        {
          exec: () => {
            this.writeln(`${this.Console.World.Save} 0`);
          },
          timeoutDelay: 2000,
        },
      );
      return match?.[0]?.['res'] ?? false;
    } catch {
      return false;
    }
  }

  async createEmptyWorld(
    worldName: string,
    map: 'Plate' | 'Space' | 'Studio' | 'Peaks' = 'Plate',
  ): Promise<boolean> {
    if (!worldName) return false;
    worldName = worldName.replace(/\.brdb$/i, '');

    try {
      const match = await this.addWatcher<{ res: boolean }>(
        (_line, match) => {
          if (match?.groups?.generator !== 'LogBRWorldManager') return;

          const ok = match.groups.data.match(/^World files saved after /);
          const err = match.groups.data.match(
            /^Error: (Invalid preset|World already exists|Failed to create new world)?/,
          );
          return ok ? { res: true } : err ? { res: false } : undefined;
        },
        {
          exec: () => {
            this.writeln(
              `${this.Console.World.CreateEmpty} "${worldName}" ${map}`,
            );
          },
          timeoutDelay: 2000,
        },
      );
      return match?.[0]?.['res'] ?? false;
    } catch {
      return false;
    }
  }

  writeSaveData(saveName: string, saveData: WriteSaveObject) {
    if (typeof saveName !== 'string')
      throw 'expected name argument for writeSaveData';

    const file = join(this.savePath, saveName + '.brs');
    if (!file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    writeFileSync(file, new Uint8Array(brs.write(saveData)));
  }

  readSaveData(saveName: string, nobricks = false): ReadSaveObject {
    if (typeof saveName !== 'string')
      throw 'expected name argument for readSaveData';

    // EA3: the legacy .brs format is gone; saved builds are `.brz` prefabs.
    // Read the named prefab and reconstruct a legacy save object, mirroring
    // getSaveData's EA3 path.
    if (brsRemoved(this.version)) {
      const file = this.getPrefabPath(saveName);
      if (!file || !file.startsWith(this.prefabPath))
        throw 'prefab file not in Saved/Prefabs directory';
      return readPrefabData(this, file, { nobricks });
    }

    const file = this.getSavePath(saveName);
    if (!file || !file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    return brs.read(readFileSync(file), {
      preview: false,
      bricks: !nobricks,
    });
  }

  async loadSaveData(
    saveData: WriteSaveObject,
    {
      offX = 0,
      offY = 0,
      offZ = 0,
      quiet = false,
      correctPalette = false,
      correctCustom = false,
    } = {},
  ) {
    // EA3: the legacy Bricks.Load command was removed. Convert the save to a
    // .brz prefab and load it into the world via br.Prefab.Load. The palette
    // correction flags have no prefab equivalent and are ignored.
    if (brsRemoved(this.version)) {
      const { ref, file } = writeTempPrefab(this, saveData);
      this.loadPrefab(ref, { offX, offY, offZ });
      // the server reads the prefab synchronously and auto-closes the bundle a
      // couple seconds later; clean up the temp file lazily (cf. loadEnvironment)
      setTimeout(() => {
        if (existsSync(file)) unlinkSync(file);
      }, 5000);
      return;
    }

    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.save++;
    // write savedata to file
    this.writeSaveData(saveFile, saveData);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `${this.Console.Bricks.Load} "${saveFile}" ${offX} ${offY} ${offZ} ${quiet ? 1 : 0} ${
        correctPalette ? 1 : 0
      } ${correctCustom ? 1 : 0}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '.brs...'),
        last: match => Boolean(match[1].match(/Read .+ bricks/)),
        afterMatchDelay: 0,
        timeoutDelay: 30000,
      },
    );

    // delete the save file after we're done
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      unlinkSync(savePath);
    }
  }

  async loadSaveDataOnPlayer(
    saveData: WriteSaveObject,
    player: string | OmeggaPlayer,
    {
      offX = 0,
      offY = 0,
      offZ = 0,
      correctPalette = false,
      correctCustom = false,
    } = {},
  ) {
    const target = typeof player === 'string' ? this.getPlayer(player) : player;
    if (!target) return;

    // EA3: give the save to the player as a prefab (their inventory) via
    // br.Prefab.GiveToPlayer. Offsets have no equivalent and are ignored,
    // matching loadPrefabOnPlayer.
    if (brsRemoved(this.version)) {
      const { ref, file } = writeTempPrefab(this, saveData);
      this.givePrefabToPlayer(ref, target);
      setTimeout(() => {
        if (existsSync(file)) unlinkSync(file);
      }, 5000);
      return;
    }

    // The Bricks.LoadTemplate command was removed at EA2, before the prefab
    // commands existed; there is no working path on that intermediate version.
    if (
      warnRemoved(
        this.version,
        'loadSaveDataOnPlayer',
        EA2_VERSION,
        'EA2',
        'loadPrefabOnPlayer',
      )
    )
      return;

    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.save++;
    // write savedata to file
    this.writeSaveData(saveFile, saveData);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `${this.Console.Bricks.LoadTemplate} "${saveFile}" ${offX} ${offY} ${offZ} ${
        correctPalette ? 1 : 0
      } ${correctCustom ? 1 : 0} "${target.name}"`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '.brs...'),
        last: match => Boolean(match[1].match(/Read .+ bricks/)),
        afterMatchDelay: 0,
        timeoutDelay: 30000,
      },
    );

    // delete the save file after we're done
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      unlinkSync(savePath);
    }
  }

  async getSaveData(region?: {
    center: [number, number, number];
    extent: [number, number, number];
  }) {
    // EA3: the legacy Bricks.Save command was removed. Save the world (or the
    // requested region) as a .brz prefab, then read it back into a legacy save
    // object. Brick geometry, ownership, assets, materials, colors, and
    // components are reconstructed; wires are not (the save-level `wires`
    // array is left empty). Component names/data are EA3-native (e.g.
    // `Component_Internal_Seat`), not the legacy `BCD_*` names.
    if (brsRemoved(this.version)) {
      const ref =
        this._tempSavePrefix + Date.now() + '_' + this._tempCounter.save++;
      const file = await this.savePrefabAsync(ref, { region });
      if (!file) return undefined;

      try {
        return readPrefabData(this, file);
      } finally {
        if (existsSync(file)) unlinkSync(file);
      }
    }

    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.save++;

    await this.saveBricksAsync(saveFile, region);

    // read the save file
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      // read and parse the save file
      const saveData = brs.read(readFileSync(savePath));

      // delete the save file after we're done reading it
      unlinkSync(savePath);

      // return the parsed save
      return saveData;
    }

    return undefined;
  }

  /**
   * Load a prefab into the world (EA3). `path` is a bundle
   * path ref such as `Prefabs/Uploads/<hash>.brz`.
   * br.Prefab.Load <Path> [Offset X Y Z] [At Original Position] [Orientation]
   *   [Root Entity Persistent Index] [Mirror Axes] [Override User Id]
   */
  loadPrefab(
    path: string,
    {
      offX = 0,
      offY = 0,
      offZ = 0,
      atOriginalPosition = false,
      orientation = 0,
      rootEntityPersistentIndex = -1,
      mirrorAxes = 0,
      overrideUserId = '',
    }: {
      offX?: number;
      offY?: number;
      offZ?: number;
      atOriginalPosition?: boolean;
      orientation?: number;
      rootEntityPersistentIndex?: number;
      /** bitmask: X=1 Y=2 Z=4 (e.g. 3 mirrors X and Y) */
      mirrorAxes?: number;
      overrideUserId?: string;
    } = {},
  ) {
    if (!path) return;
    // The root entity persistent index is looked up as a literal brick-grid
    // entity, so passing the -1 sentinel errors ("No brick grid entity with
    // persistent index 4294967295"). Omit it (and the positional args after
    // it) to load into the world grid; only include it when a real index is
    // given.
    const rootPart =
      rootEntityPersistentIndex >= 0
        ? ` ${rootEntityPersistentIndex} ${mirrorAxes}${
            overrideUserId ? ` "${overrideUserId}"` : ''
          }`
        : '';
    this.writeln(
      `${this.Console.Prefab.Load} "${path}" ${offX} ${offY} ${offZ} ${
        atOriginalPosition ? 1 : 0
      } ${orientation}${rootPart}`,
    );
  }

  /**
   * Load a prefab onto a player (EA3). Replaces the
   * removed {@link loadBricksOnPlayer}; backed by `br.Prefab.GiveToPlayer`.
   * @param path prefab bundle path ref
   * @param player player name/id or player object
   * @param options give options (preserve ownership)
   */
  loadPrefabOnPlayer(
    path: string,
    player: string | OmeggaPlayer,
    { preserveOwnership = false }: { preserveOwnership?: boolean } = {},
  ) {
    this.givePrefabToPlayer(path, player, { preserveOwnership });
  }

  /**
   * Save the world (or a region of it) as a prefab (EA3).
   * `path` is the destination bundle path ref (e.g. `Prefabs/MyPrefab.brz`).
   * br.Prefab.SaveRegion <Path> <Center X Y Z> <Extent X Y Z> [Include Entities]
   *   [Root Entity Persistent Index] [Filter User Id]
   * @param path destination prefab bundle path ref
   * @param options save options; omit `region` to capture the whole world
   */
  savePrefab(
    path: string,
    {
      region,
      entities = true,
      rootEntityPersistentIndex = -1,
      userId = '',
    }: {
      region?: {
        center: [number, number, number];
        extent: [number, number, number];
      };
      entities?: boolean;
      rootEntityPersistentIndex?: number;
      userId?: string;
    } = {},
  ) {
    if (!path) return;
    // the command always takes a region; with none given, capture the whole
    // world from the origin with a maximal extent
    const center = (region?.center ?? [0, 0, 0]).join(' ');
    const extent = (
      region?.extent ?? [
        WHOLE_WORLD_EXTENT,
        WHOLE_WORLD_EXTENT,
        WHOLE_WORLD_EXTENT,
      ]
    ).join(' ');
    // As in loadPrefab, the root entity persistent index is looked up as a
    // literal brick-grid entity, so passing the -1 sentinel fails with
    // "No brick grid entity with persistent index 4294967295" and nothing is
    // written. Omit it (and the user id after it) to save from the world grid.
    const rootPart =
      rootEntityPersistentIndex >= 0
        ? ` ${rootEntityPersistentIndex}${userId ? ` "${userId}"` : ''}`
        : '';
    this.writeln(
      `${this.Console.Prefab.SaveRegion} "${path}" ${center} ${extent} ${
        entities ? 1 : 0
      }${rootPart}`,
    );
  }

  /**
   * Save a prefab and resolve once the prefab file has been written to disk.
   * @param path destination prefab bundle path ref
   * @param options same options as {@link savePrefab}
   * @returns the absolute path to the written prefab, or null on timeout
   */
  async savePrefabAsync(
    path: string,
    options?: {
      region?: {
        center: [number, number, number];
        extent: [number, number, number];
      };
      entities?: boolean;
      rootEntityPersistentIndex?: number;
      userId?: string;
    },
  ): Promise<string | null> {
    if (!path) return null;
    this.savePrefab(path, options);

    // TODO: confirm the write via the prefab-saved log line once its exact
    // format is nailed down; for now poll for the written file on disk.
    const name = path.replace(/^Prefabs[\\/]/i, '').replace(/\.brz$/i, '');
    const file = join(this.prefabPath, name + '.brz');
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (existsSync(file)) return file;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  }

  /**
   * Give a prefab to a player's inventory (EA3).
   * br.Prefab.GiveToPlayer <Path> <Player Name or User Id> [Preserve Ownership]
   */
  givePrefabToPlayer(
    path: string,
    player: string | OmeggaPlayer,
    { preserveOwnership = false }: { preserveOwnership?: boolean } = {},
  ) {
    if (!path) return;
    // the command accepts a player name or user id; prefer the resolved id
    const target = typeof player === 'object' ? player.id : player;
    if (!target) return;
    this.writeln(
      `${this.Console.Prefab.GiveToPlayer} "${path}" "${target}" ${
        preserveOwnership ? 1 : 0
      }`,
    );
  }

  // TODO: switch this to use worlds...
  async changeMap(map: string) {
    if (!map) return false;

    // ServerTravel requires /Game/Maps/Plate/Plate instead of Plate
    const brName = mapUtils.n2brn(map);

    // wait for the server to change maps
    const match = await this.addWatcher(
      /^.*(LogLoad: Took .+ seconds to LoadMap\((?<map>.+)\))|(ERROR: The map .+)$/,
      {
        timeoutDelay: 30000,
        exec: () => this.writeln(`ServerTravel ${brName}`),
      },
    );
    const success = !!(
      match &&
      match[0] &&
      match[0].groups &&
      match[0].groups.map
    );
    return success;
  }

  async getPlugin(name: string): Promise<PluginInterop | null> {
    const plugin = this.pluginLoader?.plugins.find(p => p.getName() === name);

    if (plugin) {
      return {
        name,
        documentation: plugin.getDocumentation(),
        loaded: plugin.isLoaded(),
        emitPlugin: (event: string, ...args: any[]) => {
          return plugin.emitPlugin(event, 'unsafe', args);
        },
      };
    } else {
      return null;
    }
  }
}
