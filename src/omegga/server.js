const fs = require('fs');
const path = require('path');
const glob = require('glob');
const brs = require('brs-js');

const OmeggaWrapper = require('./wrapper.js');
const { PluginLoader } = require('./plugin.js');
const commandInjector = require('./commandInjector.js');
const { Webserver } = require('../webserver/index.js');
const soft = require('../softconfig.js');
const { uuid, pattern } = require('../util/index.js');
const file = require('../util/file.js');
const Terminal = require('../cli/terminal.js');

const MATCHERS = [
  require('./matchers/join.js'), // 'join' event => { name, id, state, controller }
  require('./matchers/leave.js'), // 'leave' event => { name, id, state, controller }
  require('./matchers/chat.js'), // 'chat' event => name, message; 'chatcmd:command' event => name, [...args]
  require('./matchers/command.js'), // 'cmd:command' event => name, args (string)
  require('./matchers/auth.js'), // assigns host 'host' event, 'start' event, 'unauthorized' event
  require('./matchers/exit.js'), // 'exit' event
  require('./matchers/version.js'), // 'version' event, check game version
];

// TODO: safe broadcast parsing

class Omegga extends OmeggaWrapper {
  // pluginloader is not private so plugins can potentially add more formats
  pluginLoader = undefined;

  // prevent omegga from saving over the same file
  _tempSaveCounter = 0;
  _tempSavePrefix = 'omegga_temp_';

  #database = undefined;

  // allow a terminal to be used instead of console log
  static terminal = undefined;
  static log(...args) { (Omegga.terminal || console).log(...args); }
  static error(...args) { (Omegga.terminal || console).error(...args); }
  static setTerminal(term) {
    if (term instanceof Terminal)
      Omegga.terminal = term;
  }

  constructor(serverPath, cfg, options={}) {
    super(serverPath, cfg);

    // inject commands
    commandInjector(this, this.logWrangler);

    // launch options (disabling webserver)
    this.options = options;

    // path to save files
    this.savePath = path.join(this.path, soft.DATA_PATH, 'Saved/Builds');

    // path to config files
    this.configPath = path.join(this.path, soft.DATA_PATH, 'Saved/Server');

    // create dir folders
    file.mkdir(this.savePath);
    file.mkdir(this.configPath);

    // ignore auth file copy
    if (!options.noauth)
      this.copyAuthFiles();

    // create the webserver if it's enabled
    // the web interface provides access to server information while the server is running
    // and lets you view chat logs, disable plugins, etc
    if (!options.noweb)
      this.webserver = new Webserver(options, this);

    if (!options.noplugin) {
      // create the pluginloader
      this.pluginLoader = new PluginLoader(path.join(this.path, soft.PLUGIN_PATH), this);

      // load all the plugin formats in
      this.pluginLoader.loadFormats(path.join(__dirname, 'plugin'));
    }

    // list of online players
    this.players = [];

    // host player info
    this.host = undefined;

    // game version (defaults to a4, updates in a matcher)
    this.version = 'a4';

    // server has started
    this.started = false;
    this.starting = false;

    // add all the matchers to the server
    for (const matcher of MATCHERS) {
      const {pattern, callback} = matcher(this);
      this.addMatcher(pattern, callback);
    }

    process.on('uncaughtException', async err => {
      this.emit('error', err);
      // publish stop to database
      if (this.webserver && this.webserver.database) {
        this.database.addChatLog('server', {}, 'Server error');
      }
      try { await this.stop(); } catch (e) { Omegga.error(e); }
      process.exit();
    });

    this.on('start', () => {
      this.started = true;
      this.starting = false;
    });
    this.on('exit', () => {
      this.stop();
    });
    this.on('closed', () => {
      if (this.started)
        this.emit('exit');
      this.stop();
    });
  }

  // start load plugins and start the server
  async start() {
    this.starting = true;
    if (this.webserver) await this.webserver.start();
    if (this.pluginLoader) {
      // scan for plugins
      await this.pluginLoader.scan();
      // load the plugins
      await this.pluginLoader.reload();
    }
    super.start();
    this.emit('server:starting');
  }

  // unload load plugins and stop the server
  async stop() {
    if (!this.started && !this.starting) return;
    if (this.stopping) return;
    this.stopping = true;
    if (this.pluginLoader)
      await this.pluginLoader.unload();
    super.stop();
    this.emit('server:stopped');
    this.stopping = false;
    this.started = false;
    this.starting = false;
  }

  // if auth files exist, copy them
  copyAuthFiles() {
    const authPath = path.join(this.path, soft.DATA_PATH, 'Saved/Auth');
    const homeAuthPath = path.join(soft.CONFIG_HOME, soft.CONFIG_AUTH_DIR);

    file.copyFiles(homeAuthPath, authPath, soft.BRICKADIA_AUTH_FILES);
  }

  // broadcast messages to chat
  // messages are broken by new line
  // multiple arguments are additional lines
  // TODO: split messages that longer than 512 characters
  // TODO: delete characters that are known to crash the game
  broadcast(...messages) {
    messages
      .flatMap(m => m.toString().split('\n'))
      .filter(m => m.length < 512)
      .forEach(m => this.writeln(`Chat.Broadcast ${m}`));
  }

  // broadcast messages to a player
  // messages are broken by new line
  // multiple arguments are additional lines
  whisper(target, ...messages) {
    // find the target player
    if (typeof target !== 'object')
      target = this.getPlayer(target);

    // whisper the messages to that player
    messages
      .flatMap(m => m.toString().split('\n'))
      .filter(m => m.length < 512)
      .forEach(m => this.writeln(`Chat.Whisper ${target.name} ${m}`));
  }

  // get a list of players
  getPlayers() { return this.players.map(p => ({...p})); }

  // read the server json files (the values automatically update when the files change)
  getRoleSetup() { return file.readWatchedJSON(path.join(this.configPath, 'RoleSetup.json')); }
  getRoleAssignments() { return file.readWatchedJSON(path.join(this.configPath, 'RoleAssignments.json')); }
  getBanList() { return file.readWatchedJSON(path.join(this.configPath, 'BanList.json')); }
  getNameCache() { return file.readWatchedJSON(path.join(this.configPath, 'PlayerNameCache.json')); }

  // find a player by name, id, controller, or state
  getPlayer(arg) {
    return this.players.find(p => p.name === arg || p.id === arg || p.controller === arg || p.state === arg);
  }

  // find a player by rough name, prioritize exact matches and get fuzzier
  findPlayerByName(name) {
    name = name.toLowerCase();
    const exploded = pattern.explode(name);
    return this.players.find(p => p.name === name) // find by exact match
      || this.players.find(p => p.name.indexOf(name) > -1) // find by rough match
      || this.players.find(p => p.name.match(exploded)); // find by exploded regex match (ck finds cake, tbp finds TheBlackParrot)
  }

  // get the host
  getHostId() { return this.host.id; }

  // clear a user's bricks (by uuid, name, controller, or player object)
  // A5+ Only
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

    this.writeln(`Bricks.Clear ${target} ${quiet && this.version !== 'a4' ? 1 : ''}`);
  }

  // save bricks
  clearAllBricks(quiet=false) { this.writeln(`Bricks.ClearAll ${quiet && this.version !== 'a4' ? 1 : ''}`); }

  // save bricks
  saveBricks(name) { this.writeln(`Bricks.Save ${name}`); }

  // load bricks
  loadBricks(name, {offX=0, offY=0, offZ=0, quiet=false}={}) { this.writeln(`Bricks.Load ${name} ${offX} ${offY} ${offZ} ${quiet && this.version !== 'a4' ? 1 : ''}`); }

  // get all saves in the save folder
  getSaves() { return fs.existsSync(this.savePath) ? glob.sync(this.savePath + '/**/*.brs') : []; }

  // returns the path to a save given a save name
  getSavePath(name) {
    const file = path.join(this.savePath, name.endsWith('.brs') ? name : name + '.brs');
    return fs.existsSync(file) ? file : undefined;
  }

  // unsafely load save data (use try/catch)
  writeSaveData(name, data) {
    if (typeof name !== 'string')
      throw 'expected name argument for writeSaveData';

    const file = path.join(this.savePath, name + '.brs');
    if (!file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    fs.writeFileSync(file, new Uint8Array(brs.write(data)));
  }

  // unsafely read save data (use try/catch)
  readSaveData(name) {
    if (typeof name !== 'string')
      throw 'expected name argument for readSaveData';

    const file = this.getSavePath(name);
    if (!file.startsWith(this.savePath))
      throw 'save file not in Saved/Builds directory';
    if (file) return brs.read(fs.readFileSync(file));
  }

  // load bricks from save data
  // A5+ only
  async loadSaveData(data, {offX=0, offY=0, offZ=0, quiet=false}={}) {
    const saveFile = this._tempSavePrefix + Date.now() + '_' + (this._tempSaveCounter++);
    // write savedata to file
    this.writeSaveData(saveFile, data);

    // wait for the server to finish reading the save
    await this.watchLogChunk(
      `Bricks.Load ${saveFile} ${offX} ${offY} ${offZ} ${quiet && this.version !== 'a4' ? 1 : ''}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '...'),
        last: match => match[1].match(/Read \d+ bricks/),
      }
    );

    // delete the save file after we're done
    const savePath = this.getSavePath(saveFile);
    if (savePath) {
      fs.unlinkSync(savePath);
    }
  }

  // get current bricks as save data
  // A5+ only
  async getSaveData() {
    const saveFile = this._tempSavePrefix + Date.now() + '_' + (this._tempSaveCounter++);

    // wait for the server to save the file
    await this.watchLogChunk(
      `Bricks.Save ${saveFile}`,
      /^LogBrickSerializer: (.+)$/,
      {
        first: match => match[0].endsWith(saveFile + '...'),
        last: match => match[1].match(/Saved \d+ bricks/),
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
}

global.Omegga = Omegga;
module.exports = Omegga;
