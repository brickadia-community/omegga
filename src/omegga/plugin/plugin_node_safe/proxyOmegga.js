const { EventEmitter } = require('events');

const LogWrangler = require('../../logWrangler.js');
const Player = require('../../player.js');
const Omegga = require('../../server.js');
const commandInjector = require('../../commandInjector.js');

// bootstrap the proxy with initial omegga data
const bootstrap = (omegga) => ({
  'plugin:players:raw': [omegga.players.map(p => p.raw())],
  bootstrap: [{
    host: Object.freeze({...omegga.host}),
    version: omegga.version,
    verbose: global.VERBOSE,
    savePath: omegga.savePath,
    path: omegga.path,
    configPath: omegga.configPath,
    starting: omegga.starting,
    started: omegga.started,
    config: omegga.config,
  }],
});

// prototypes that can be directly stolen from omegga
const STEAL_PROTOTYPES = [
  'broadcast', 'whisper', 'getPlayer', 'getPlayers',
  'findPlayerByName', 'getHostId',
  'clearBricks', 'clearAllBricks', 'loadBricks', 'saveBricks',
  'getSavePath', 'getSaves',
  'writeSaveData', 'readSaveData', 'loadSaveData', 'getSaveData',
  'getRoleSetup', 'getRoleAssignments', 'getBanList', 'getNameCache',
  'changeMap'
];

// this is a "soft" omegga
// it is built to mimic the core omegga
// it does not provide direct write access to
class ProxyOmegga extends EventEmitter {
  _tempSaveCounter = 0;
  _tempSavePrefix = 'omegga_plugin_temp_';

  constructor(exec) {
    super();

    this.writeln = exec;

    this.version = 'a4';

    this.players = [];

    // log wrangler wrangles logs... it reads brickadia logs and clumps them together
    this.logWrangler = new LogWrangler(this);
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
        this[key] = data[key];
      }
    });

    // data synchronization
    this.on('host', host => this.host = host);
    this.on('version', version => this.version = version);

    // create players from raw constructor data
    this.on('plugin:players:raw', players =>
      this.players = players.map(p => new Player(this, ...p)));

    this.on('start', (map) => {
      this.started = true;
      this.starting = false;
      this.currentMap = map;
    });
    this.on('exit', () => {
      this.started = false;
      this.starting = false;
    });
    this.on('mapchange', (map) => {
      this.currentMap = map;
    });
  }
}

// copy prototypes from core omegga to the proxy omegga
for (const fn of STEAL_PROTOTYPES) {
  ProxyOmegga.prototype[fn] = Omegga.prototype[fn];
}

module.exports = { ProxyOmegga, bootstrap };