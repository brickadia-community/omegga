
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const readline = require('readline');
const { JSONRPCServer, JSONRPCClient, JSONRPCServerAndClient } = require('json-rpc-2.0');

const { Plugin } = require('../plugin.js');
const { bootstrap } = require('./plugin_node_safe/proxyOmegga.js');


// TODO: json rpc over websocket
// TODO: check if version is compatible (v1 -> v2) from file
// TODO: run plugin as child process
// TODO: wrap omegga functions
// TODO: write jsonrpc wrappers in a few languages, implement a few simple plugins
// TODO: languages: [ python, javascript (lol), rust, go ]
// TODO: implement loader

const MAIN_FILE = 'omegga_plugin';
const DOC_FILE = 'doc.json';

class RpcPlugin extends Plugin {
  #child = null;
  #rpc = null;
  #errInterface = null;
  #outInterface = null;

  // all RPC plugins require a main (binary) file and a doc file
  static canLoad(pluginPath) {
    return fs.existsSync(path.join(pluginPath, MAIN_FILE)) &&
      fs.existsSync(path.join(pluginPath, DOC_FILE))
  }

  // websocket rpc plugin type
  static getFormat() { return 'stdio_rpc'; }

  constructor(pluginPath, omegga) {
    super(pluginPath, omegga);

    this.messageCounter = 0;

    // TODO: validate documentation
    this.documentation = Plugin.readJSON(path.join(pluginPath, DOC_FILE));
    this.pluginFile = path.join(pluginPath, MAIN_FILE);

    this.eventPassthrough = this.eventPassthrough.bind(this);

    this.initRPC();
  }

  isLoaded() { return !!this.#child; }

  // spawn the plugin as a child process
  async load() {
    try {
      this.#child = spawn(this.pluginFile);
      this.#child.stdin.setEncoding('utf8');
      this.#outInterface = readline.createInterface({input: this.#child.stdout, terminal: false});
      this.#errInterface = readline.createInterface({input: this.#child.stderr, terminal: false});

      // get some initial information to create an omegga proxy
      const initialData = bootstrap(this.omegga);
      // send some initial information
      this.notify('bootstrap', initialData);

      // pass events through
      this.omegga.on('*', this.eventPassthrough);

      return true;
    } catch(e){
      Omegga.error('>!'.red, 'error loading stdio rpc plugin', this.getName().brightRed.underline, e);
      this.#rpc.rejectAllPendingRequests('plugin stopped - error starting');
      await this.kill();
      return false;
    }
  }

  // kill the child process after requesting it to stop
  async unload() {
    // this is wrapped in a promise for the freeze check
    return new Promise(async resolve => {
      try {
        let frozen = true;

        // check if the child is frozen (while true)
        setTimeout(() => {
          if (!frozen) return;
          Omegga.error('>!'.red, 'I appear to be unresponsive (maybe I forgot to respond to stop)', this.getName().brightRed.underline);
          this.kill();
          this.omegga.off('*', this.eventPassthrough);
          resolve(true);
        }, 5000);

        this.omegga.off('*', this.eventPassthrough);

        // let the plugin know it's time to stop
        await this.emit('stop');

        this.kill();

        frozen = false;
        return resolve(true);
      } catch (e) {
        Omegga.error('>!'.red, 'error unloading rpc plugin', this.getName().brightRed.underline, e);
        frozen = false;
        return resolve(false);
      }
    });
  }

  // attaches event listeners
  attachListeners() {
    const name = this.getName();

    this.#outInterface.on('line', line => {
      try {
        this.#rpc.receiveAndSend(JSON.parse(line));
      } catch (e) {
        Omegga.error(this.getName().brightRed.underline, '>!'.red, 'error parsing rpc data', e, line);
      }
    });

    // stderr - print out the errors
    this.#errInterface.on('line', err => {
      Omegga.error(name.brightRed.underline, '>!'.red, err);
    });

    this.#child.on('exit', code => {
      this.detachListeners();
      this.#child = undefined;
    });
  }

  // removes previously attached event listeners
  detachListeners() {
    this.#outInterface.removeAllListeners('line');
    this.#errInterface.removeAllListeners('line');
    this.#child.removeAllListeners('exit');
  }

  // write a string to the child process
  writeln(line) {
    if (this.#child)
      this.#child.stdin.write(line + '\n');
  }

  // forcibly kills the plugin
  async kill() {
    if (!this.#child)
      return;

    // create a promise for the exit of the process
    const promise = new Promise(resolve => this.#child.once('exit', resolve));

    // kill the process
    this.#child.kill('SIGINT');

    // ...kill it again just to make sure it's dead
    spawn('kill', ['-9', this.#child.pid]);

    // wait for the process to exit
    await promise;
  }

  eventPassthrough(type, ...args) {
    if (!this.#child) return;
    this.#rpc.notify(type, args);
  }

  // setup the JSONRPC communication
  initRPC() {
    const server = JSONRPCServer();
    const client = JSONRPCClient(req => this.writeln(JSON.stringify(req)));
    const rpc = this.#rpc = new JSONRPCServerAndClient(server, client);

    // plugin log generator function
    const ezLog = (logFn, name, symbol) => line => console[logFn](name.underline, symbol, line);

    // server can output logs special formatting for stdout
    rpc.addMethod('log', ezLog('log', pluginName, '>>'.green));
    rpc.addMethod('error', ezLog('error', pluginName.brightRed, '!>'.red));
    rpc.addMethod('info', ezLog('info', pluginName, '#>'.blue));
    rpc.addMethod('warn', ezLog('warn', pluginName.brightYellow, ':>'.yellow));
    rpc.addMethod('trace', ezLog('trace', pluginName, 'T>'.grey));

    // server can run console commands
    rpc.addMethod('exec', line => this.omegga.writeln(line));
    rpc.addMethod('writeln', line => this.omegga.writeln(line));
    rpc.addMethod('broadcast', line => this.omegga.broadcast(line));
    rpc.addMethod('whisper', ({target, line}) => this.omegga.whisper(target, line));
    rpc.addMethod('getPlayers', () => this.omegga.getPlayers());
    rpc.addMethod('getRoleSetup', () => this.omegga.getRoleSetup());
    rpc.addMethod('getBanList', () => this.omegga.getBanList());
    rpc.addMethod('getSaves', () => this.omegga.getBanList());
    rpc.addMethod('getSavePath', (name) => this.omegga.getSavePath(name));
    rpc.addMethod('clearBricks', ({target, quiet=false}) => this.omegga.clearBricks(target, quiet));
    rpc.addMethod('clearAllBricks', () => this.omegga.clearAllBricks());
    rpc.addMethod('saveBricks', (name) => this.omegga.saveBricks(name));
    rpc.addMethod('loadBricks', ({name, offX=0, offY=0, offZ=0, quiet=false}) =>
      this.omegga.loadBricks(name, {offX, offY, offZ, quiet}));
    rpc.addMethod('readSaveData', (name) => this.omegga.readSaveData(name));
  }

  // emit a message to the plugin via the jsonrpc client and expect a response
  emit(type, arg) {
    return this.#rpc.request(type, arg);
  }

  // emit a message to the plugin via the jsonrpc client, don't expect a response
  notify(type, arg) {
    this.#rpc.notify(type, arg);
  }
}

module.exports = RpcPlugin;