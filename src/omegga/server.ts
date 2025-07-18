import default_commands from '@/info/default_commands.json';
import Logger from '@/logger';
import { OmeggaLike, OmeggaPlayer, PluginInterop } from '@/plugin';
import {
  BRICKADIA_AUTH_FILES,
  CONFIG_AUTH_DIR,
  CONFIG_HOME,
  CONFIG_SAVED_DIR,
  DATA_PATH,
} from '@/softconfig';
import { EnvironmentPreset } from '@brickadia/presets';
import {
  BRBanList,
  BRPlayerNameCache,
  BRRoleAssignments,
  BRRoleSetup,
} from '@brickadia/types';
import { IConfig } from '@config/types';
import { map as mapUtils, pattern, uuid } from '@util';
import { copyFiles, mkdir, readWatchedJSON } from '@util/file';
import Webserver from '@webserver/backend';
import { read, ReadSaveObject, write, WriteSaveObject } from 'brs-js';
import 'colors';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { sync } from 'glob';
import { basename, join } from 'path';
import { AutoRestartConfig, omegga } from '..';
import commandInjector from './commandInjector';
import MATCHERS from './matchers';
import Player from './player';
import { PluginLoader } from './plugin';
import {
  ILogMinigame,
  IMinigameList,
  IOmeggaOptions,
  IPlayerPositions,
  IServerStatus,
} from './types';
import OmeggaWrapper from './wrapper';
const pkg = require('../../package.json');

const MISSING_CMD =
  '"Command not found. Type <color=\\"ffff00\\">/help</> for a list of commands or <color=\\"ffff00\\">/plugins</> for plugin information."';

// TODO: safe broadcast parsing

export default class Omegga extends OmeggaWrapper implements OmeggaLike {
  /** The save counter prevents omegga from saving over the same file */
  _tempCounter = { save: 0, environment: 0 };
  /** The save prefix is prepended to all temporary saves */
  _tempSavePrefix = 'omegga_temp_';

  // pluginloader is not private so plugins can potentially add more formats
  pluginLoader: PluginLoader = undefined;
  webserver: Webserver;

  verbose: boolean;
  savePath: string;
  worldPath: string;
  presetPath: string;
  configPath: string;
  options: IOmeggaOptions;

  version: number;

  host?: { id: string; name: string };
  players: OmeggaPlayer[];

  started = false;
  starting = false;
  stopping = false;
  currentMap: string;

  getServerStatus: () => Promise<IServerStatus>;
  listMinigames: () => Promise<IMinigameList>;
  getAllPlayerPositions: () => Promise<IPlayerPositions>;
  getMinigames: () => Promise<ILogMinigame[]>;

  /**
   * Omegga instance
   */
  constructor(serverPath: string, cfg: IConfig, options: IOmeggaOptions = {}) {
    super(serverPath, cfg);
    this.verbose = Logger.VERBOSE;

    Logger.verbose('Running omegga', `v${pkg.version}`.green);
    Logger.verbose('Versions', process.versions);
    Logger.verbose('Config', cfg);

    // inject commands
    Logger.verbose('Setting up command injector');
    commandInjector(this, this.logWrangler);

    // launch options (disabling webserver)
    this.options = options;
    const savedDir = cfg.server.savedDir ?? CONFIG_SAVED_DIR;

    // path to save files
    this.savePath = join(this.path, DATA_PATH, savedDir, 'Builds');
    this.worldPath = join(this.path, DATA_PATH, savedDir, 'Worlds');

    this.presetPath = join(this.path, DATA_PATH, savedDir, 'Presets');

    // path to config files
    this.configPath = join(this.path, DATA_PATH, savedDir, 'Server');

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
      this.webserver = new Webserver(cfg.omegga, this);
    }

    if (!options.noplugin) {
      Logger.verbose('Creating plugin loader');
      // create the pluginloader
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

    process.on('uncaughtException', async err => {
      Logger.verbose('Uncaught exception', err);
      this.emit('error', err);

      // publish stop to database
      this.webserver?.database?.addChatLog('server', {}, 'Server error');

      try {
        await this.stop();
      } catch (e) {
        Logger.error(e);
      }
      process.exit();
    });

    // when brickadia starts, mark the server as started
    this.on('start', ({ map }) => {
      this.started = true;
      this.starting = false;
      this.currentMap = map;
      this.writeln('Chat.MessageForUnknownCommands 0');

      this.restoreServer();
    });

    // when brickadia exits, stop omegga
    this.on('exit', () => {
      this.stop();
    });

    // when the process closes, emit the exit signal and stop
    this.on('closed', () => {
      if (this.started) this.emit('exit');
      if (!this.stopping) this.stop();
    });

    // detect when a missing command is sent
    this.on('cmd', (cmd, name) => {
      // if it's not in the default commands and it's not registered to a plugin,
      // it's okay to send the missing command message
      if (
        !default_commands.includes(cmd) &&
        (!this.pluginLoader || !this.pluginLoader.isCommand(cmd))
      ) {
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
      this.saveWorld();
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
    try {
      const tempPlayersFile = join(
        this.path,
        DATA_PATH,
        'omegga_temp_players.json',
      );
      if (existsSync(tempPlayersFile)) {
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
              `Chat.Command /TP "${player.name}" ${position.join(' ')} 0`,
            );

            // remove the entry
            players[index] = players[players.length - 1];
            players.pop();
          }
        };
        this.on('join', callback);

        setTimeout(() => {
          try {
            this.off('join', callback);
            unlinkSync(tempPlayersFile);
          } catch (err) {
            Logger.error('Error removing omegga_temp_players.json', err);
          }
        }, 10000);
      }
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
      .forEach(m => this.writeln(`Chat.Broadcast ${m}`));
  }

  whisper(target: string | OmeggaPlayer, ...messages: string[]) {
    // find the target player
    if (typeof target !== 'object') target = this.getPlayer(target);

    // whisper the messages to that player
    messages
      .flatMap(m => m.toString().split('\n'))
      .filter(m => m.length < 512)
      .forEach(m =>
        this.writeln(
          `Chat.Whisper "${(target as { name: string }).name}" ${m}`,
        ),
      );
  }

  middlePrint(target: string | OmeggaPlayer, message: string) {
    // find the target player
    if (typeof target !== 'object') target = this.getPlayer(target);

    // whisper the messages to that player
    if (message.length > 512) return;
    this.writeln(
      `Chat.StatusMessage "${(target as { name: string }).name}" ${message}`,
    );
  }

  getPlayers(): {
    id: string;
    name: string;
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

  getPlayer(target: string): OmeggaPlayer {
    return this.players.find(
      p =>
        p.name === target ||
        p.id === target ||
        p.controller === target ||
        p.state === target,
    );
  }

  findPlayerByName(name: string): OmeggaPlayer {
    name = name.toLowerCase();
    const exploded = pattern.explode(name);
    return (
      this.players.find(p => p.name === name || p.displayName === name) || // find by exact match
      this.players.find(
        p => p.name.indexOf(name) > -1 || p.displayName.indexOf(name) > -1,
      ) || // find by rough match
      this.players.find(
        p => p.name.match(exploded) || p.displayName.match(exploded),
      ) // find by exploded regex match (ck finds cake, tbp finds TheBlackParrot)
    );
  }

  getHostId(): string {
    return this.host?.id ?? '';
  }

  saveMinigame(index: number, name: string) {
    this.writeln(`Server.Minigames.SavePreset ${index} "${name}"`);
  }

  deleteMinigame(index: number) {
    this.writeln(`Server.Minigames.Delete ${index}`);
  }

  resetMinigame(index: number) {
    this.writeln(`Server.Minigames.Reset ${index}`);
  }

  nextRoundMinigame(index: number) {
    this.writeln(`Server.Minigames.NextRound ${index}`);
  }

  loadMinigame(presetName: string, owner = '') {
    this.writeln(
      `Server.Minigames.LoadPreset "${presetName}" ${owner ? `"${owner}"` : ''}`,
    );
  }

  getMinigamePresets(): string[] {
    const presetPath = join(this.presetPath, 'Minigame');
    return existsSync(presetPath)
      ? sync(presetPath + '/**/*.bp').map(f => basename(f).replace(/\.bp$/, ''))
      : [];
  }

  resetEnvironment() {
    this.writeln(`Server.Environment.Reset`);
  }

  async saveEnvironment(presetName: string): Promise<void> {
    await this.addWatcher(/Environment preset saved.$/, {
      // request the pawn for this player's controller (should only be one)
      exec: () => this.writeln(`Server.Environment.SavePreset "${presetName}"`),
      timeoutDelay: 100,
    });
  }

  async getEnvironmentData(): Promise<EnvironmentPreset> {
    const saveName =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.environment++;

    await this.saveEnvironment(saveName);
    const data = this.readEnvironmentData(saveName);
    const file = join(this.presetPath, 'Environment', saveName + '.bp');
    if (existsSync(file)) unlinkSync(file);

    return data;
  }

  readEnvironmentData(saveName: string): EnvironmentPreset {
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
    this.writeln(`Server.Environment.LoadPreset ${presetName}`);
  }

  loadEnvironmentData(
    preset: EnvironmentPreset | EnvironmentPreset['data']['groups'],
  ) {
    if ('data' in preset) preset = preset.data.groups;

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
      ? sync(presetPath + '/**/*.bp').map(f => basename(f).replace(/\.bp$/, ''))
      : [];
  }

  clearBricks(target: string | { id: string }, quiet = false) {
    // target is a player object, just use that id
    if (typeof target === 'object' && target.id) target = target.id;
    // if the target isn't a uuid already, find the player by name or controller and use that uuid
    else if (typeof target === 'string' && !uuid.match(target)) {
      // only set the target if the player exists
      const player = this.getPlayer(target);
      target = player && player.id;
    }

    if (!target) return;

    this.writeln(`Bricks.Clear ${target} ${quiet ? 1 : ''}`);
  }

  clearRegion(
    region: {
      center: [number, number, number];
      extent: [number, number, number];
    },
    options?: { target: string | OmeggaPlayer },
  ) {
    let target = '';

    // target is a player object, just use that id
    if (options && typeof options.target === 'object')
      target = ' ' + options.target.id;
    // if the target isn't a uuid already, find the player by name or controller and use that uuid

    if (typeof target === 'string' && !uuid.match(target)) {
      // only set the target if the player exists
      const player = this.getPlayer(target);
      if (player) target = ' ' + player.id;
    }

    this.writeln(
      `Bricks.ClearRegion ${region.center.join(' ')} ${region.extent.join(
        ' ',
      )}${target}`,
    );
  }

  clearAllBricks(quiet = false) {
    this.writeln(`Bricks.ClearAll ${quiet ? 1 : ''}`);
  }

  saveBricks(
    saveName: string,
    region?: {
      center: [number, number, number];
      extent: [number, number, number];
    },
  ) {
    if (!saveName) return;

    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;

    if (region?.center && region?.extent)
      this.writeln(
        `Bricks.SaveRegion ${saveName} ${region.center.join(
          ' ',
        )} ${region.extent.join(' ')}`,
      );
    else this.writeln(`Bricks.Save ${saveName}`);
  }

  async saveBricksAsync(
    saveName: string,
    region?: {
      center: [number, number, number];
      extent: [number, number, number];
    },
  ): Promise<void> {
    if (!saveName) return;

    let saveNameClean = saveName;
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveNameClean = `"${saveName}"`;

    const command =
      region?.center && region?.extent
        ? `Bricks.SaveRegion ${saveNameClean} ${region.center.join(
            ' ',
          )} ${region.extent.join(' ')}`
        : `Bricks.Save ${saveNameClean}`;

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
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;

    this.writeln(
      `Bricks.Load ${saveName} ${offX} ${offY} ${offZ} ${quiet ? 1 : 0} ${
        correctPalette ? 1 : 0
      } ${correctCustom ? 1 : 0}`,
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
    player = typeof player === 'string' ? this.getPlayer(player) : player;
    if (!player) return;

    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;

    this.writeln(
      `Bricks.LoadTemplate ${saveName} ${offX} ${offY} ${offZ}  ${
        correctPalette ? 1 : 0
      } ${correctCustom ? 1 : 0} "${player.name}"`,
    );
  }

  getSaves(): string[] {
    return existsSync(this.savePath) ? sync(this.savePath + '/**/*.brs') : [];
  }

  getWorlds(): string[] {
    return existsSync(this.worldPath)
      ? sync(this.worldPath + '/**/*.brdb')
      : [];
  }

  getSavePath(saveName: string) {
    const file = join(
      this.savePath,
      saveName.endsWith('.brs') ? saveName : saveName + '.brs',
    );
    return existsSync(file) ? file : undefined;
  }

  getWorldPath(worldName: string) {
    const file = join(
      this.worldPath,
      worldName.endsWith('.brdb') ? worldName : worldName + '.brdb',
    );
    return existsSync(file) ? file : undefined;
  }

  async getWorldRevisions(worldName: string) {
    worldName = worldName.replace(/\.brdb$/i, '');

    if (!worldName || !this.getWorldPath(worldName)) {
      throw new Error(`World "${worldName}" does not exist`);
    }

    /*
      LogBRBundleManager: There are 2 revisions
      LogBRBundleManager: Revision 1 - 2001.02.03-04.05.06: Initial Revision
      LogBRBundleManager: Revision 2 - 2001.02.03-04.05.06: Manual Save
    */
    let numRevisions = 0;
    const revisionsRaw = await this.watchLogChunk<RegExpMatchArray>(
      `BR.World.ListRevisions "${worldName}"`,
      /^LogBRBundleManager: (There are (?<numRevisions>\d+) revisions|Revision (?<revision>\d+) - (?<date>[\d.-]+): (?<note>.+))$/,
      {
        last: match => Number(match.groups.reverse) === numRevisions,
        first: match => {
          if (match.groups?.numRevisions !== undefined) {
            numRevisions = Number(match.groups.numRevisions);
            return true;
          }
          return false;
        },
      },
    );

    if (!revisionsRaw) return [];
    return revisionsRaw
      .map(match => {
        if (match.groups?.numRevisions !== undefined) {
          return null;
        }

        const revision = match.groups.revision
          ? Number(match.groups.revision)
          : 0;
        // parse date from YYYY.MM.DD-HH.MM.SS to YYYY-MM-DDTHH:MM:SSZ
        const dateStr = match.groups.date.replace(
          /(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/,
          '$1-$2-$3T$4:$5:$6Z',
        );
        const date = new Date(dateStr);
        const note = match.groups.note || '';
        return { index: revision, date, note };
      })
      .filter(Boolean);
  }

  loadWorld(worldName: string) {
    worldName = worldName.replace(/\.brdb$/i, '');
    if (!worldName || !this.getWorldPath(worldName)) return;
    this.writeln(`BR.World.Load "${worldName}"`);
  }

  loadWorldRevision(worldName: string, revision: number) {
    worldName = worldName.replace(/\.brdb$/i, '');
    if (!worldName || !this.getWorldPath(worldName)) return;
    if (typeof revision !== 'number' || revision < 1) {
      throw new Error(`Invalid revision number: ${revision}`);
    }
    this.writeln(`BR.World.LoadRevision "${worldName}" ${revision}`);
  }

  saveWorldAs(worldName: string) {
    if (!worldName) return;
    if (this.stopping || this.starting || !this.started) return;

    worldName = worldName.replace(/\.brdb$/i, '');
    this.writeln(`BR.World.SaveAs "${worldName}"`);
  }

  async saveWorld(): Promise<boolean> {
    // Don't allow saving while the server is starting or stopping
    if (this.stopping || this.starting || !this.started) return false;

    try {
      const match = await this.addWatcher<{ res: boolean }>(
        (_line, match) => {
          if (match?.groups?.generator !== 'LogBRWorldManager') return;

          const ok = match.groups.data.match(/^World files saved after /);
          const err = match.groups.data.match(
            /^Error: World has not been saved\./,
          );
          return ok ? { res: true } : err ? { res: false } : undefined;
        },
        {
          exec: () => {
            this.writeln(`BR.World.Save 0`);
          },
          timeoutDelay: 2000,
        },
      );
      return match?.[0]?.['res'] ?? false;
    } catch (err) {
      return false;
    }
  }

  createEmptyWorld(
    worldName: string,
    map: 'Plate' | 'Space' | 'Studio' | 'Peaks' = 'Plate',
  ) {
    if (!worldName) return;
    worldName = worldName.replace(/\.brdb$/i, '');
    this.writeln(`BR.World.CreateEmpty "${worldName}" ${map}`);
  }

  writeSaveData(saveName: string, saveData: WriteSaveObject) {
    if (typeof saveName !== 'string')
      throw 'expected name argument for writeSaveData';

    const file = join(this.savePath, saveName + '.brs');
    if (!file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    writeFileSync(file, new Uint8Array(write(saveData)));
  }

  readSaveData(saveName: string, nobricks = false): ReadSaveObject {
    if (typeof saveName !== 'string')
      throw 'expected name argument for readSaveData';

    const file = this.getSavePath(saveName);
    if (!file || !file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    if (file)
      return read(readFileSync(file), {
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
    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.save++;
    // write savedata to file
    this.writeSaveData(saveFile, saveData);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `Bricks.Load "${saveFile}" ${offX} ${offY} ${offZ} ${quiet ? 1 : 0} ${
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
    player = typeof player === 'string' ? this.getPlayer(player) : player;
    if (!player) return;

    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.save++;
    // write savedata to file
    this.writeSaveData(saveFile, saveData);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `Bricks.LoadTemplate "${saveFile}" ${offX} ${offY} ${offZ} ${
        correctPalette ? 1 : 0
      } ${correctCustom ? 1 : 0} "${player.name}"`,
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
    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempCounter.save++;

    await this.saveBricksAsync(saveFile, region);

    // read the save file
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      // read and parse the save file
      const saveData = read(readFileSync(savePath));

      // delete the save file after we're done reading it
      unlinkSync(savePath);

      // return the parsed save
      return saveData;
    }

    return undefined;
  }

  // TODO: switch this to use worlds...
  async changeMap(map: string) {
    if (!map) return;

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

  async getPlugin(name: string): Promise<PluginInterop> {
    const plugin = this.pluginLoader.plugins.find(p => p.getName() === name);

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
