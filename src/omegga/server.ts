import default_commands from '@/info/default_commands.json';
import {
  BRICKADIA_AUTH_FILES,
  CONFIG_AUTH_DIR,
  CONFIG_HOME,
  DATA_PATH,
  PLUGIN_PATH,
} from '@/softconfig';
import {
  BRBanList,
  BRPlayerNameCache,
  BRRoleAssignments,
  BRRoleSetup,
} from '@brickadia/types';
import Terminal from '@cli/terminal';
import { IConfig } from '@config/types';
import { map as mapUtils, pattern, uuid } from '@util';
import { copyFiles, mkdir, readWatchedJSON } from '@util/file';
import Webserver from '@webserver/backend';
import { read, ReadSaveObject, write, WriteSaveObject } from 'brs-js';
import 'colors';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { sync } from 'glob';
import { basename, join } from 'path';
import { OmeggaLike, OmeggaPlayer } from '@/plugin';
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
import Logger from '@/logger';

const MISSING_CMD =
  '"Command not found. Type <color=\\"ffff00\\">/help</> for a list of commands or <color=\\"ffff00\\">/plugins</> for plugin information."';

// TODO: safe broadcast parsing

export default class Omegga extends OmeggaWrapper implements OmeggaLike {
  /** The save counter prevents omegga from saving over the same file */
  _tempSaveCounter = 0;
  /** The save prefix is prepended to all temporary saves */
  _tempSavePrefix = 'omegga_temp_';

  // pluginloader is not private so plugins can potentially add more formats
  pluginLoader: PluginLoader = undefined;
  webserver: Webserver;

  verbose: boolean;
  savePath: string;
  presetPath: string;
  configPath: string;
  options: IOmeggaOptions;

  version: number;

  host?: { id: string; name: string };
  players: OmeggaPlayer[];

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
  constructor(serverPath: string, cfg: IConfig, options: IOmeggaOptions = {}) {
    super(serverPath, cfg);
    this.verbose = Logger.VERBOSE;

    // inject commands
    Logger.verbose('Setting up command injector');
    commandInjector(this, this.logWrangler);

    // launch options (disabling webserver)
    this.options = options;

    // path to save files
    this.savePath = join(this.path, DATA_PATH, 'Saved/Builds');

    this.presetPath = join(this.path, DATA_PATH, 'Saved/Presets');

    // path to config files
    this.configPath = join(this.path, DATA_PATH, 'Saved/Server');

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
      this.pluginLoader = new PluginLoader(join(this.path, PLUGIN_PATH), this);

      Logger.verbose('Creating loading plugins');
      // load all the plugin formats in
      this.pluginLoader.loadFormats(join(__dirname, 'plugin'));
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
    const authPath = join(this.path, DATA_PATH, 'Saved/Auth');
    const homeAuthPath = join(CONFIG_HOME, CONFIG_AUTH_DIR);

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
        this.writeln(`Chat.Whisper "${(target as { name: string }).name}" ${m}`)
      );
  }

  middlePrint(target: string | OmeggaPlayer, message: string) {
    // find the target player
    if (typeof target !== 'object') target = this.getPlayer(target);

    // whisper the messages to that player
    if (message.length > 512) return;
    this.writeln(
      `Chat.StatusMessage "${(target as { name: string }).name}" ${message}`
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
    return readWatchedJSON(
      join(this.configPath, 'RoleSetup.json')
    ) as BRRoleSetup;
  }

  getRoleAssignments(): BRRoleAssignments {
    return readWatchedJSON(
      join(this.configPath, 'RoleAssignments.json')
    ) as BRRoleAssignments;
  }

  getBanList(): BRBanList {
    return readWatchedJSON(join(this.configPath, 'BanList.json')) as BRBanList;
  }

  getNameCache(): BRPlayerNameCache {
    return readWatchedJSON(
      join(this.configPath, 'PlayerNameCache.json')
    ) as BRPlayerNameCache;
  }

  getPlayer(target: string): OmeggaPlayer {
    return this.players.find(
      p =>
        p.name === target ||
        p.id === target ||
        p.controller === target ||
        p.state === target
    );
  }

  findPlayerByName(name: string): OmeggaPlayer {
    name = name.toLowerCase();
    const exploded = pattern.explode(name);
    return (
      this.players.find(p => p.name === name) || // find by exact match
      this.players.find(p => p.name.indexOf(name) > -1) || // find by rough match
      this.players.find(p => p.name.match(exploded))
    ); // find by exploded regex match (ck finds cake, tbp finds TheBlackParrot)
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
      `Server.Minigames.LoadPreset "${presetName}" ${owner ? `"${owner}"` : ''}`
    );
  }

  getMinigamePresets(): string[] {
    const presetPath = join(this.presetPath, 'Minigames');
    return existsSync(presetPath)
      ? sync(presetPath + '/**/*.bp').map(f => basename(f))
      : [];
  }

  resetEnvironment() {
    this.writeln(`Server.Environment.Reset`);
  }

  saveEnvironment(presetName: string) {
    this.writeln(`Server.Environment.SavePreset "${presetName}"`);
  }

  loadEnvironment(presetName: string) {
    this.writeln(`Server.Environment.LoadPreset "${presetName}"`);
  }

  getEnvironmentPresets(): string[] {
    const presetPath = join(this.presetPath, 'Environment');
    return existsSync(presetPath)
      ? sync(presetPath + '/**/*.bp').map(f => basename(f))
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

  clearAllBricks(quiet = false) {
    this.writeln(`Bricks.ClearAll ${quiet ? 1 : ''}`);
  }

  saveBricks(saveName: string) {
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;
    this.writeln(`Bricks.Save ${saveName}`);
  }

  loadBricks(
    saveName: string,
    { offX = 0, offY = 0, offZ = 0, quiet = false } = {}
  ) {
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;

    this.writeln(
      `Bricks.Load ${saveName} ${offX} ${offY} ${offZ} ${quiet ? 1 : ''}`
    );
  }

  loadBricksOnPlayer(
    saveName: string,
    player: string | OmeggaPlayer,
    { offX = 0, offY = 0, offZ = 0 } = {}
  ) {
    player = typeof player === 'string' ? this.getPlayer(player) : player;
    if (!player) return;

    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;

    this.writeln(
      `Bricks.LoadTemplate ${saveName} ${offX} ${offY} ${offZ} 0 0 "${player.name}"`
    );
  }

  getSaves(): string[] {
    return existsSync(this.savePath) ? sync(this.savePath + '/**/*.brs') : [];
  }

  getSavePath(saveName: string) {
    const file = join(
      this.savePath,
      saveName.endsWith('.brs') ? saveName : saveName + '.brs'
    );
    return existsSync(file) ? file : undefined;
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
    { offX = 0, offY = 0, offZ = 0, quiet = false } = {}
  ) {
    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempSaveCounter++;
    // write savedata to file
    this.writeSaveData(saveFile, saveData);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `Bricks.Load "${saveFile}" ${offX} ${offY} ${offZ} ${quiet ? 1 : ''}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '.brs...'),
        last: match => Boolean(match[1].match(/Read .+ bricks/)),
        afterMatchDelay: 0,
        timeoutDelay: 30000,
      }
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
    { offX = 0, offY = 0, offZ = 0 } = {}
  ) {
    player = typeof player === 'string' ? this.getPlayer(player) : player;
    if (!player) return;

    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempSaveCounter++;
    // write savedata to file
    this.writeSaveData(saveFile, saveData);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `Bricks.LoadTemplate "${saveFile}" ${offX} ${offY} ${offZ} 0 0 ${player.name}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '.brs...'),
        last: match => Boolean(match[1].match(/Read .+ bricks/)),
        afterMatchDelay: 0,
        timeoutDelay: 30000,
      }
    );

    // delete the save file after we're done
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      unlinkSync(savePath);
    }
  }

  async getSaveData() {
    const saveFile =
      this._tempSavePrefix + Date.now() + '_' + this._tempSaveCounter++;

    // wait for the server to save the file
    await this.watchLogChunk(
      `Bricks.Save "${saveFile}"`,
      /^(LogBrickSerializer|LogTemp): (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '.brs...'),
        last: match =>
          Boolean(
            match[2].match(
              /Saved .+ bricks and .+ components from .+ owners|Error: No bricks in grid!/
            )
          ),
        afterMatchDelay: 0,
        timeoutDelay: 30000,
      }
    );

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
      }
    );
    const success = !!(
      match &&
      match[0] &&
      match[0].groups &&
      match[0].groups.map
    );
    return success;
  }

  /* Command injector methods are overwritten, this code is here for the doc */
}
