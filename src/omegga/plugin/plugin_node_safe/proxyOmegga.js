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
    savePath: omegga.savePath,
    path: omegga.path,
    configPath: omegga.configPath,
    starting: omegga.starting,
    started: omegga.started,
  }],
});

// prototypes that can be directly stolen from omegga
const STEAL_PROTOTYPES = [
  'broadcast', 'whisper', 'getPlayer', 'getPlayers',
  'findPlayerByName', 'getHostId',
  'clearBricks', 'clearAllBricks', 'loadBricks', 'saveBricks',
];

/*Missing functions:
  getSaves, writeSaveData, readSaveData, loadSaveData, getSaveData
*/

// this is a "soft" omegga
// it is built to mimic the core omegga
// it does not provide direct write access to
class ProxyOmegga extends EventEmitter {
  constructor(emit, exec) {
    super();

    this.emitParent = emit;
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
    this.on('boostrap', data => {
      for (const key in data) {
        this[key] = data[key];
      }
    });

    // data synchronization
    this.on('host', host => this.host = host);
    this.on('version', version => {
      this.version = version;
    });
    // create players from raw constructor data
    this.on('plugin:players:raw', players => this.players = players.map(p => new Player(this, ...p)));

    this.on('start', () => {
      this.started = true;
      this.starting = false;
    });
    this.on('exit', () => {
      this.started = false;
      this.starting = false;
    });
  }

  // create a copy of omegga for indirect access of its API
  // BADCODE: this is just placeholder code
  static softOmegga(omegga) {
    // create a copied emitter
    const emitter = new EventEmitter();
    omegga.on('*', (...args) => emitter.emit(...args));

    return {
      // event handler
      on: (...args) => emitter.on(...args),

      // getters
      getHost: () => Object.freeze(omegga.host),
      getVersion: () => omegga.version,
      getStarted: () => omegga.started,
      getPlayers: () => deepFreeze(omegga.getPlayers()),
      getRoleSetup: () => deepFreeze(omegga.getRoleSetup()),
      getRoleAssignments: () => deepFreeze(omegga.getRoleAssignments()),
      getBanList: () => deepFreeze(omegga.getBanList()),
      getNameCache: () => deepFreeze(omegga.getNameCache()),
      getServerStatus: () => omegga.getServerStatus(),
      getAllPlayerPositions: () => omegga.getAllPlayerPositions(),
      getHostId: () => omegga.getHostId(),
      getMinigames: () => omegga.getMinigames(),
      getSaves: () => omegga.getSaves(),
      getSavePath: (...args) => omegga.getSavePath(...args),
      findPlayerByName: name => {
        const player = omegga.findPlayerByName(name);
        return player && player.clone();
      },
      getPlayer: name => {
        const player = omegga.getPlayer(name);
        return player && player.clone();
      },

      // funcs
      broadcast: (...args) => omegga.broadcast(...args),
      whisper: (...args) => omegga.whisper(...args),
      write: (...args) => omegga.write(...args),
      writeln: (...args) => omegga.writeln(...args),
      clearAllBricks: () => omegga.clearAllBricks(),
      clearBricks: (...args) => omegga.clearBricks(...args),
      loadBricks: (...args) => omegga.loadBricks(...args),
      saveBricks: (...args) => omegga.saveBricks(...args),
      writeSaveData: (...args) => omegga.writeSaveData(...args),
      readSaveData: (...args) => omegga.readSaveData(...args),
      loadSaveData: (...args) => omegga.loadSaveData(...args),
      getSaveData: (...args) => omegga.getSaveData(...args),
    };
  }
};

for (const fn of STEAL_PROTOTYPES) {
  ProxyOmegga.prototype[fn] = Omegga.prototype[fn];
}

module.exports = { ProxyOmegga, bootstrap };