/*
  The wrapper combines the things looking at or waiting for logs with the actual server logs
*/
const { EventEmitter } = require('events');
const path = require('path');

const BrickadiaServer = require('../brickadia/server.js');
const soft = require('../softconfig.js');
const LogWrangler = require('./logWrangler.js');

class OmeggaWrapper extends EventEmitter {
  #server = undefined;

  constructor(serverPath, cfg) {
    super();

    this.config = cfg;
    this.path = path.isAbsolute(serverPath) || serverPath.startsWith('/') ? serverPath : path.join(process.cwd(), serverPath);
    this.dataPath = path.join(this.path, soft.DATA_PATH);
    this.#server = new BrickadiaServer(this.dataPath, cfg);

    this.version = 'a4';

    // log wrangler wrangles logs... it reads brickadia logs and clumps them together
    this.logWrangler = new LogWrangler(this);
    this.#server.on('line', this.logWrangler.callback);
    this.#server.on('line', line => this.emit('line', line));
    this.addMatcher = this.logWrangler.addMatcher;
    this.addWatcher = this.logWrangler.addWatcher;
    this.watchLogArray = this.logWrangler.watchLogArray;
    this.watchLogChunk = this.logWrangler.watchLogChunk;
  }

  // passthrough to server
  write(str) { this.#server.write(str); }
  writeln(str) { this.#server.writeln(str); }
  start() { this.#server.start(); }
  stop() { this.#server.stop(); }

  // event emitter to catch everything
  emit(type, ...args) {
    super.emit('*', type, ...args);
    return super.emit(type, ...args);
  }
}

module.exports = OmeggaWrapper;