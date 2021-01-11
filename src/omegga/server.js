const fs = require('fs');
const path = require('path');
const glob = require('glob');
const brs = require('brs-js');

const OmeggaWrapper = require('./wrapper.js');
const { PluginLoader } = require('./plugin.js');
const commandInjector = require('./commandInjector.js');
const { Webserver } = require('../webserver/index.js');
const soft = require('../softconfig.js');
const { uuid, pattern, map: mapUtils } = require('../util/index.js');
const file = require('../util/file.js');
const Terminal = require('../cli/terminal.js');
require('colors');

const DEFAULT_COMMANDS = require('../info/default_commands.json');
const MISSING_CMD = '"Command not found. Type <color=\\"ffff00\\">/help</> for a list of commands or <color=\\"ffff00\\">/plugins</> for plugin information."';

const MATCHERS = [
  require('./matchers/join.js'),
  // 'join' event => { name, id, state, controller }

  require('./matchers/leave.js'),
  // 'leave' event => { name, id, state, controller }

  require('./matchers/chat.js'),
  // 'chat' event => name, message; 'chatcmd:command' event => name, [...args]
  // 'kick' event => name, kicker, reason

  require('./matchers/command.js'),
  // 'cmd:command' event => name, args (string)

  require('./matchers/auth.js'),
  // assigns host, 'host' event, 'start' event, 'unauthorized' event

  require('./matchers/exit.js'),
  // 'exit' event

  require('./matchers/version.js'),
  // 'version' event, check game version

  require('./matchers/init.js'),
  // watch loginit for any funny business

  require('./matchers/mapChange.js'),
  // 'mapchange' event
];

// TODO: safe broadcast parsing

const verboseLog = (...args) => {
  if (!global.VERBOSE) return;
  if (Omegga.log)
    Omegga.log('V>'.magenta, ...args);
  else
    console.log('V>'.magenta, ...args);
};

class Omegga extends OmeggaWrapper {
  // pluginloader is not private so plugins can potentially add more formats
  pluginLoader = undefined;

  /** The save counter prevents omegga from saving over the same file */
  _tempSaveCounter = 0;
  /** The save prefix is prepended to all temporary saves */
  _tempSavePrefix = 'omegga_temp_';

  // allow a terminal to be used instead of console log
  static terminal = undefined;

  /**
   * send a console log to the readline terminal or stdout
   * @param {...args} - things to print out
   */
  static log(...args) { (Omegga.terminal || console).log(...args); }

  /**
   * send a console error to the readline terminal or stderr
   * @param {...args} - things to print out
   */
  static error(...args) { (Omegga.terminal || console).error(...args); }

  /**
   * send a console warn to the readline terminal or stdout
   * @param {...args} - things to print out
   */
  static warn(...args) { (Omegga.terminal || console).warn(...args); }

  /**
   * send a console log to the readline terminal or console
   * @param {...args} - things to print out
   */
  static setTerminal(term) {
    if (term instanceof Terminal)
      Omegga.terminal = term;
  }

  /**
   * Omegga instance
   * @constructor
   */
  constructor(serverPath, cfg, options={}) {
    super(serverPath, cfg);
    this.verbose = global.VERBOSE;

    // inject commands
    verboseLog('Setting up command injector');
    commandInjector(this, this.logWrangler);

    // launch options (disabling webserver)
    this.options = options;

    // path to save files
    this.savePath = path.join(this.path, soft.DATA_PATH, 'Saved/Builds');

    // path to config files
    this.configPath = path.join(this.path, soft.DATA_PATH, 'Saved/Server');

    // create dir folders
    verboseLog('Creating directories');
    file.mkdir(this.savePath);
    file.mkdir(this.configPath);

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
      this.webserver = new Webserver(options, this);
    }

    if (!options.noplugin) {
      verboseLog('Creating plugin loader');
      // create the pluginloader
      this.pluginLoader = new PluginLoader(path.join(this.path, soft.PLUGIN_PATH), this);

      verboseLog('Creating loading plugins');
      // load all the plugin formats in
      this.pluginLoader.loadFormats(path.join(__dirname, 'plugin'));
    }

    /** @type {Array<Player>}list of online players */
    this.players = [];

    /** host player info `{id: uuid, name: player name}` */
    this.host = undefined;

    /** @type {String} current game version - may later be turned into CL#### versions */
    this.version = 'a5';

    /** @type {Boolean} whether server has started */
    this.started = false;
    /** @type {Boolean} whether server is starting up */
    this.starting = false;

    /** @type {String} current map */
    this.currentMap = '';

    // add all the matchers to the server
    verboseLog('Adding matchers');
    for (const matcher of MATCHERS) {
      const {pattern, callback} = matcher(this);
      this.addMatcher(pattern, callback);
    }

    process.on('uncaughtException', async err => {
      verboseLog('Uncaught exception', err);
      this.emit('error', err);
      // publish stop to database
      if (this.webserver && this.webserver.database) {
        this.webserver.database.addChatLog('server', {}, 'Server error');
      }
      try { await this.stop(); } catch (e) { Omegga.error(e); }
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
      if (this.started)
        this.emit('exit');
      if (!this.stopping)
        this.stop();
    });

    // detect when a missing command is sent
    this.on('cmd', (cmd, name) => {
      // if it's not in the default commands and it's not registered to a plugin,
      // it's okay to send the missing command message
      if (!DEFAULT_COMMANDS.includes(cmd) && (!this.pluginLoader || !this.pluginLoader.isCommand(cmd))) {
        this.whisper(name, MISSING_CMD);
      }
    });
  }

  /**
   * start webserver, load plugins, start the brickadia server
   * this should not be called by a plugin
   * @returns {Promise}
   */
  //
  async start() {
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

    super.start();
    this.emit('server:starting');
  }

  /**
   * unload plugins and stop the server
   * this should not be called by a plugin
   * @returns {Promise}
   */
  async stop() {
    if (!this.started && !this.starting) {
      verboseLog('Stop called while server wasn\'t started or was starting');
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
    if (this.stopping)
      this.emit('server:stopped');
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
    const authPath = path.join(this.path, soft.DATA_PATH, 'Saved/Auth');
    const homeAuthPath = path.join(soft.CONFIG_HOME, soft.CONFIG_AUTH_DIR);

    file.copyFiles(homeAuthPath, authPath, soft.BRICKADIA_AUTH_FILES);
  }

  // TODO: split messages that longer than 512 characters
  // TODO: delete characters that are known to crash the game
  /**
   * broadcast messages to chat
   * messages are broken by new line
   * multiple arguments are additional lines
   * all messages longer than 512 characters are deleted automatically, though omegga wouldn't have sent them anyway
   * @param {...String} - unescaped chat messages to send. may need to wrap messages with quotes
   */
  //
  broadcast(...messages) {
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
   * @param {String} - player identifier or player object
   * @param {...String} - unescaped chat messages to send. may need to wrap messages with quotes
   */
  //
  whisper(target, ...messages) {
    // find the target player
    if (typeof target !== 'object')
      target = this.getPlayer(target);

    // whisper the messages to that player
    messages
      .flatMap(m => m.toString().split('\n'))
      .filter(m => m.length < 512)
      .forEach(m => this.writeln(`Chat.Whisper "${target.name}" ${m}`));
  }

  /**
   * get a list of players
   * @return {players} - list of players {id: uuid, name: name} objects
   */
  getPlayers() { return this.players.map(p => ({...p})); }

  /**
   * Get up-to-date role setup from RoleSetup.json
   * @return {object}
   */
  getRoleSetup() { return file.readWatchedJSON(path.join(this.configPath, 'RoleSetup.json')); }

  /**
   * Get up-to-date role assignments from RoleAssignment.json
   * @return {object}
   */
  getRoleAssignments() { return file.readWatchedJSON(path.join(this.configPath, 'RoleAssignments.json')); }

  /**
   * Get up-to-date ban list from BanList.json
   * @return {object}
   */
  getBanList() { return file.readWatchedJSON(path.join(this.configPath, 'BanList.json')); }

  /**
   * Get up-to-date name cache from PlayerNameCache.json
   * @return {object}
   */
  getNameCache() { return file.readWatchedJSON(path.join(this.configPath, 'PlayerNameCache.json')); }

  /**
   * find a player by name, id, controller, or state
   * @param  {String} - name, id, controller, or state
   * @return {Player}
   */
  getPlayer(arg) {
    return this.players.find(p => p.name === arg || p.id === arg || p.controller === arg || p.state === arg);
  }

  /**
   * find a player by rough name, prioritize exact matches and get fuzzier
   * @param  {String} - player name, fuzzy
   * @return {Player}
   */
  findPlayerByName(name) {
    name = name.toLowerCase();
    const exploded = pattern.explode(name);
    return this.players.find(p => p.name === name) // find by exact match
      || this.players.find(p => p.name.indexOf(name) > -1) // find by rough match
      || this.players.find(p => p.name.match(exploded)); // find by exploded regex match (ck finds cake, tbp finds TheBlackParrot)
  }

  /**
   * get the host's ID
   * @return {String} - Host Id
   */
  getHostId() { return this.host ? this.host.id : ''; }

  /**
   * clear a user's bricks (by uuid, name, controller, or player object)
   * @param  {String|Object} - player or player identifier
   * @param  {Boolean} - quietly clear bricks
   */
  clearBricks(target, quiet=false) {
    // target is a player object, just use that id
    if (typeof target === 'object' && target.id)
      target = target.id;

    // if the target isn't a uuid already, find the player by name or controller and use that uuid
    else if (typeof target === 'string' && !uuid.match(target)) {
      // only set the target if the player exists
      const player = this.getPlayer(target);
      target = player && player.id;
    }

    if (!target)
      return;

    this.writeln(`Bricks.Clear ${target} ${quiet ? 1 : ''}`);
  }

  /**
   * Clear all bricks on the server
   * @param  {Boolean} - quietly clear bricks
   */
  clearAllBricks(quiet=false) { this.writeln(`Bricks.ClearAll ${quiet ? 1 : ''}`); }

  /**
   * Save bricks under a name
   * @param  {String} - save file name
   */
  saveBricks(name) {
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(name.startsWith('"') && name.endsWith('"')))
      name = `"${name}"`;
    this.writeln(`Bricks.Save ${name}`);
  }

  /**
   * Load bricks on the server
   * @param  {String} - save name
   * @param  {Number} - world X offset
   * @param  {Number} - world Y offset
   * @param  {Number} - world Z offset
   * @param  {Boolean} - quiet mode
   */
  loadBricks(name, {offX=0, offY=0, offZ=0, quiet=false}={}) {
    // add quotes around the filename if it doesn't have them (backwards compat w/ plugins)
    if (!(name.startsWith('"') && name.endsWith('"')))
      name = `"${name}"`;

    this.writeln(`Bricks.Load ${name} ${offX} ${offY} ${offZ} ${quiet ? 1 : ''}`);
  }

  /**
   * get all saves in the save folder and child folders
   * @return {Array<String>}
   */
  getSaves() { return fs.existsSync(this.savePath) ? glob.sync(this.savePath + '/**/*.brs') : []; }

  /**
   * Checks if a save exists and returns an absolute path
   * @param  {String} - Save filename
   * @return {String} - Path to string
   */
  getSavePath(name) {
    const file = path.join(this.savePath, name.endsWith('.brs') ? name : name + '.brs');
    return fs.existsSync(file) ? file : undefined;
  }

  /**
   * unsafely load save data (wrap in try/catch)
   * @param  {String} - save file name
   * @param  {SaveData} - BRS JS Save data
   */
  writeSaveData(name, data) {
    if (typeof name !== 'string')
      throw 'expected name argument for writeSaveData';

    const file = path.join(this.savePath, name + '.brs');
    if (!file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    fs.writeFileSync(file, new Uint8Array(brs.write(data)));
  }

  /**
   * unsafely read save data (wrap in try/catch)
   * @param  {String} - save file name
   * @param  {Boolean} - only read save header data
   * @return {SaveData} - BRS JS Save Data
   */
  readSaveData(name, nobricks=false) {
    if (typeof name !== 'string')
      throw 'expected name argument for readSaveData';

    const file = this.getSavePath(name);
    if (!file || !file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    if (file) return brs.read(fs.readFileSync(file), {preview: false, bricks: !nobricks});
  }

  /**
   * load bricks from save data and resolve when game finishes loading
   * @param  {SaveData} - BRS JS Save data
   * @param  {Number} - save load X offset
   * @param  {Number} - save load Y offset
   * @param  {Number} - save load Z offset
   * @param  {Boolean} - quiet mode
   * @return {Promise}
   */
  async loadSaveData(data, {offX=0, offY=0, offZ=0, quiet=false}={}) {
    const saveFile = this._tempSavePrefix + Date.now() + '_' + (this._tempSaveCounter++);
    // write savedata to file
    this.writeSaveData(saveFile, data);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `Bricks.Load ${saveFile} ${offX} ${offY} ${offZ} ${quiet ? 1 : ''}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '.brs...'),
        last: match => match[1].match(/Read .+ bricks/),
        afterMatchDelay: 0,
        timeoutDelay: 30000
      }
    );

    // delete the save file after we're done
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      fs.unlinkSync(savePath);
    }
  }

  /**
   * get current bricks as save data
   * @return {Promise<SaveData>} - BRS JS Save Data
   */
  async getSaveData() {
    const saveFile = this._tempSavePrefix + Date.now() + '_' + (this._tempSaveCounter++);

    // wait for the server to save the file
    await this.watchLogChunk(
      `Bricks.Save ${saveFile}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '.brs...'),
        last: match => match[1].match(/Saved .+ bricks and .+ components from .+ owners|Error: No bricks in grid!/),
        afterMatchDelay: 0,
        timeoutDelay: 30000
      },
    );

    // read the save file
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      // read and parse the save file
      const saveData = brs.read(fs.readFileSync(savePath));

      // delete the save file after we're done reading it
      fs.unlinkSync(savePath);

      // return the parsed save
      return saveData;
    }

    return undefined;
  }

  /**
   * Change server map
   * @param  {String} - Map name
   * @return {Promise}
   */
  async changeMap(map) {
    if(!map) 
      return;

    // ServerTravel requires /Game/Maps/Plate/Plate instead of Plate
    const brName = mapUtils.n2brn(map);
    
    // wait for the server to change maps
    const match = await this.addWatcher(
      /^.*(LogLoad: Took .+ seconds to LoadMap\((?<map>.+)\))|(ERROR: The map .+)$/,
      {
        timeoutDelay: 30000,
        exec: () => this.writeln(`ServerTravel ${brName}`)
      },
    ); 
    const success = !!(match && match[0] && match[0].groups && match[0].groups.map);
    return success;
  }
}

global.Omegga = Omegga;
module.exports = Omegga;
