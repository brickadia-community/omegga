import { includes } from '@/info/default_commands.json';
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

const MISSING_CMD =
  '"Command not found. Type <color=\\"ffff00\\">/help</> for a list of commands or <color=\\"ffff00\\">/plugins</> for plugin information."';

// TODO: safe broadcast parsing

const verboseLog = (...args: unknown[]) => {
  if (!Omegga.VERBOSE) return;
  if (Omegga.log) Omegga.log('V>'.magenta, ...args);
  else console.log('V>'.magenta, ...args);
};

class Omegga extends OmeggaWrapper {
  /** The save counter prevents omegga from saving over the same file */
  _tempSaveCounter = 0;
  /** The save prefix is prepended to all temporary saves */
  _tempSavePrefix = 'omegga_temp_';

  // allow a terminal to be used instead of console log
  static terminal: Terminal = undefined;

  static VERBOSE: boolean;

  /**
   * send a console log to the readline terminal or stdout
   */
  static log(...args: unknown[]) {
    (Omegga.terminal || console).log(...args);
  }

  /**
   * send a console error to the readline terminal or stderr
   */
  static error(...args: unknown[]) {
    (Omegga.terminal || console).error(...args);
  }

  /**
   * send a console warn to the readline terminal or stdout
   */
  static warn(...args: unknown[]) {
    (Omegga.terminal || console).warn(...args);
  }

  /**
   * send a console log when omegga is launched when --verbose
   */
  static verbose(...args: unknown[]) {
    verboseLog(...args);
  }

  /**
   * send a console log to the readline terminal or console
   */
  static setTerminal(term: Terminal) {
    if (term instanceof Terminal) Omegga.terminal = term;
  }

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
  constructor(serverPath: string, cfg: IConfig, options: IOmeggaOptions = {}) {
    super(serverPath, cfg);
    this.verbose = Omegga.VERBOSE;

    // inject commands
    verboseLog('Setting up command injector');
    commandInjector(this, this.logWrangler);

    // launch options (disabling webserver)
    this.options = options;

    // path to save files
    this.savePath = join(this.path, DATA_PATH, 'Saved/Builds');

    this.presetPath = join(this.path, DATA_PATH, 'Saved/Presets');

    // path to config files
    this.configPath = join(this.path, DATA_PATH, 'Saved/Server');

    // create dir folders
    verboseLog('Creating directories');
    mkdir(this.savePath);
    mkdir(this.configPath);

    // ignore auth file copy
    if (!options.noauth) {
      verboseLog('Copying auth files');
      this.copyAuthFiles();
    }

    // create the webserver if it's enabled
    // the web interface provides access to server information while the server is running
    // and lets you view chat logs, disable plugins, etc
    if (!options.noweb) {
      verboseLog('Creating webserver');
      this.webserver = new Webserver(cfg.server, this);
    }

    if (!options.noplugin) {
      verboseLog('Creating plugin loader');
      // create the pluginloader
      this.pluginLoader = new PluginLoader(join(this.path, PLUGIN_PATH), this);

      verboseLog('Creating loading plugins');
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
    verboseLog('Adding matchers');
    for (const matcher of MATCHERS) {
      const { pattern, callback } = matcher(this);
      this.addMatcher(pattern, callback);
    }

    process.on('uncaughtException', async err => {
      verboseLog('Uncaught exception', err);
      this.emit('error', err);
      // publish stop to database
      if (this.webserver && this.webserver.database) {
        this.webserver.database.addChatLog('server', {}, 'Server error');
      }
      try {
        await this.stop();
      } catch (e) {
        Omegga.error(e);
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
        !includes(cmd) &&
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
      verboseLog('Scanning for plugins');
      await this.pluginLoader.scan();

      // load the plugins
      verboseLog('Loading plugins');
      await this.pluginLoader.reload();
    }

    verboseLog('Starting Brickadia');
    super.start();
    this.emit('server:starting');
  }

  /**
   * unload plugins and stop the server
   * this should not be called by a plugin
   */
  async stop() {
    if (!this.started && !this.starting) {
      verboseLog("Stop called while server wasn't started or was starting");
      return;
    }

    if (this.stopping) {
      verboseLog('Stop called while server was starting');
      return;
    }

    this.stopping = true;
    this.emit('server:stopping');
    if (this.pluginLoader) {
      verboseLog('Unloading plugins');
      await this.pluginLoader.unload();
    }
    verboseLog('Stopping server');
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
  /**
   * broadcast messages to chat
   * messages are broken by new line
   * multiple arguments are additional lines
   * all messages longer than 512 characters are deleted automatically, though omegga wouldn't have sent them anyway
   * @param messages unescaped chat messages to send. may need to wrap messages with quotes
   */
  //
  broadcast(...messages: string[]) {
    messages
      .flatMap(m => m.toString().split('\n'))
      .filter(m => m.length < 512)
      .forEach(m => this.writeln(`Chat.Broadcast ${m}`));
  }

  /**
   * whisper messages to a player's chat
   * messages are broken by new line
   * multiple arguments are additional lines
   * all messages longer than 512 characters are deleted automatically, though omegga wouldn't have sent them anyway
   * @param target - player identifier or player object
   * @param messages - unescaped chat messages to send. may need to wrap messages with quotes
   */
  //
  whisper(target: string | Player, ...messages: string[]) {
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

  /**
   * get a list of players
   * @return list of players {id: uuid, name: name} objects
   */
  getPlayers(): {
    id: string;
    name: string;
    controller: string;
    state: string;
  }[] {
    return this.players.map(p => ({ ...p }));
  }

  /**
   * Get up-to-date role setup from RoleSetup.json
   */
  getRoleSetup(): BRRoleSetup {
    return readWatchedJSON(
      join(this.configPath, 'RoleSetup.json')
    ) as BRRoleSetup;
  }

  /**
   * Get up-to-date role assignments from RoleAssignment.json
   */
  getRoleAssignments(): BRRoleAssignments {
    return readWatchedJSON(
      join(this.configPath, 'RoleAssignments.json')
    ) as BRRoleAssignments;
  }

  /**
   * Get up-to-date ban list from BanList.json
   */
  getBanList(): BRBanList {
    return readWatchedJSON(join(this.configPath, 'BanList.json')) as BRBanList;
  }

  /**
   * Get up-to-date name cache from PlayerNameCache.json
   * @return {object}
   */
  getNameCache(): BRPlayerNameCache {
    return readWatchedJSON(
      join(this.configPath, 'PlayerNameCache.json')
    ) as BRPlayerNameCache;
  }

  /**
   * find a player by name, id, controller, or state
   * @param target - name, id, controller, or state
   */
  getPlayer(target: string): Player {
    return this.players.find(
      p =>
        p.name === target ||
        p.id === target ||
        p.controller === target ||
        p.state === target
    );
  }

  /**
   * find a player by rough name, prioritize exact matches and get fuzzier
   * @param name player name, fuzzy
   */
  findPlayerByName(name: string): Player {
    name = name.toLowerCase();
    const exploded = pattern.explode(name);
    return (
      this.players.find(p => p.name === name) || // find by exact match
      this.players.find(p => p.name.indexOf(name) > -1) || // find by rough match
      this.players.find(p => p.name.match(exploded))
    ); // find by exploded regex match (ck finds cake, tbp finds TheBlackParrot)
  }

  /**
   * get the host's ID
   * @return Host Id
   */
  getHostId(): string {
    return this.host?.id ?? '';
  }

  /**
   * Save a minigame preset based on a minigame index
   * @param index minigame index
   * @param name preset name
   */
  saveMinigame(index: number, name: string) {
    this.writeln(`Server.Minigame.SavePreset ${index} "${name}"`);
  }

  /**
   * Delete a minigame
   * @param index minigame index
   */
  deleteMinigame(index: number) {
    this.writeln(`Server.Minigame.Delete ${index}`);
  }

  /**
   * Reset a minigame
   * @param index minigame index
   */
  resetMinigame(index: number) {
    this.writeln(`Server.Minigame.Reset ${index}`);
  }

  /**
   * Force the next round in a minigame
   * @param index minigame index
   */
  nextRoundMinigame(index: number) {
    this.writeln(`Server.Minigame.NextRound ${index}`);
  }

  /**
   * Load an Minigame preset
   * @param presetName preset name
   * @param owner owner id/name
   */
  loadMinigame(presetName: string, owner = '') {
    this.writeln(
      `Server.Minigame.LoadPreset "${presetName}" ${owner ? `"${owner}"` : ''}`
    );
  }

  /**
   * get all presets in the minigame folder and child folders
   */
  getMinigamePresets(): string[] {
    const presetPath = join(this.presetPath, 'Minigames');
    return existsSync(presetPath)
      ? sync(presetPath + '/**/*.bp').map(f => basename(f))
      : [];
  }

  /**
   * Reset the environment settings
   */
  resetEnvironment() {
    this.writeln(`Server.Environment.Reset`);
  }

  /**
   * Save an environment preset
   * @param presetName preset name
   */
  saveEnvironment(presetName: string) {
    this.writeln(`Server.Environment.SavePreset "${presetName}"`);
  }

  /**
   * Load an environment preset
   * @param presetName preset name
   */
  loadEnvironment(presetName: string) {
    this.writeln(`Server.Environment.LoadPreset "${presetName}"`);
  }

  /**
   * get all presets in the environment folder and child folders
   */
  getEnvironmentPresets(): string[] {
    const presetPath = join(this.presetPath, 'Environment');
    return existsSync(presetPath)
      ? sync(presetPath + '/**/*.bp').map(f => basename(f))
      : [];
  }

  /**
   * clear a user's bricks (by uuid, name, controller, or player object)
   * @param target player or player identifier
   * @param quiet quietly clear bricks
   */
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

  /**
   * Clear all bricks on the server
   * @param quiet quietly clear bricks
   */
  clearAllBricks(quiet = false) {
    this.writeln(`Bricks.ClearAll ${quiet ? 1 : ''}`);
  }

  /**
   * Save bricks under a name
   * @param saveName save file name
   */
  saveBricks(saveName: string) {
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(saveName.startsWith('"') && saveName.endsWith('"')))
      saveName = `"${saveName}"`;
    this.writeln(`Bricks.Save ${saveName}`);
  }

  /**
   * Load bricks on the server
   */
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

  /**
   * get all saves in the save folder and child folders
   */
  getSaves(): string[] {
    return existsSync(this.savePath) ? sync(this.savePath + '/**/*.brs') : [];
  }

  /**
   * Checks if a save exists and returns an absolute path
   * @param saveName Save filename
   * @return Path to string
   */
  getSavePath(saveName: string) {
    const file = join(
      this.savePath,
      saveName.endsWith('.brs') ? saveName : saveName + '.brs'
    );
    return existsSync(file) ? file : undefined;
  }

  /**
   * unsafely load save data (wrap in try/catch)
   * @param saveName {String} - save file name
   * @param saveData {SaveData} - BRS JS Save data
   */
  writeSaveData(saveName: string, saveData: WriteSaveObject) {
    if (typeof saveName !== 'string')
      throw 'expected name argument for writeSaveData';

    const file = join(this.savePath, saveName + '.brs');
    if (!file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    writeFileSync(file, new Uint8Array(write(saveData)));
  }

  /**
   * unsafely read save data (wrap in try/catch)
   * @param saveName save file name
   * @param nobricks only read save header data
   * @return BRS JS Save Data
   */
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

  /**
   * load bricks from save data and resolve when game finishes loading
   * @param  saveData - BRS JS Save data
   */
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

  /**
   * get current bricks as save data
   */
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

  /**
   * Change server map
   * @param  map Map name
   */
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

global.Omegga = Omegga;
export default Omegga;
type OmeggaType = typeof Omegga;
declare global {
  var Omegga: OmeggaType;
}
