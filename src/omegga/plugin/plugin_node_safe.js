const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const readline = require('readline');

const {
  Worker,
} = require('worker_threads');

const { Plugin } = require('../plugin.js');
const { bootstrap } = require('./plugin_node_safe/proxyOmegga.js');

// Main plugin file (like index.js)
// this isn't named 'index.js' or 'plugin.js' because those may be filenames
// used with other loaders (rpc loader) and are too generic
// omegga.main.js is rather unique and helps avoid collision
const MAIN_FILE = 'omegga.plugin.js';

// Documentation file (contains name, description, author, command helptext)
const DOC_FILE = 'doc.json';
const ACCESS_FILE = 'access.json';

class NodeVmPlugin extends Plugin {
  #worker = undefined;
  #outInterface = undefined;
  #errInterface = undefined;

  // every node vm plugin requires a main file, a doc file, and an access file
  // may evolve this so it checks the contents of the doc file later
  static canLoad(pluginPath) {
    return fs.existsSync(path.join(pluginPath, MAIN_FILE)) &&
      fs.existsSync(path.join(pluginPath, DOC_FILE)) &&
      fs.existsSync(path.join(pluginPath, ACCESS_FILE));
  }

  // safe node plugins are limited
  static getFormat() { return 'node_safe'; }

  constructor(pluginPath, omegga) {
    super(pluginPath, omegga);

    // event emitter and message counter for keeping track of worker events
    this.plugin = new EventEmitter();
    this.messageCounter = 0;

    // TODO: validate documentation
    this.documentation = Plugin.readJSON(path.join(pluginPath, DOC_FILE));

    // access list is a list of builtin requires
    // can be ['*'] for everything
    this.access = Plugin.readJSON(path.join(pluginPath, ACCESS_FILE)) || [];

    // verify access is an array of strings
    if (!(this.access instanceof Array) || !this.access.every(s => typeof s === 'string')) {
      throw new Error('access list not a string array');
    }

    // plugin name
    const name = this.getName();

    // when the worker emits an error or a log, pass it up to omegga
    this.plugin.on('error', (_, ...args) => {
      Omegga.log(name.brightRed.underline, '!>'.red, ...args);
      this.emit();
    });
    this.plugin.on('log', (_, ...args) => {
      Omegga.log(name.underline, '>>'.green, ...args);
    });

    // let the worker write commands to brickadia
    this.plugin.on('exec', (_, cmd) => omegga.writeln(cmd));

    // listen on every message, post them to to the worker
    this.eventPassthrough = this.eventPassthrough.bind(this);
  }

  // documentation is based on doc.json file
  getDocumentation() { return this.documentation; }

  // loaded state is based on if a worker exists
  isLoaded() { return !!this.#worker; }

  // require the plugin into the system, run the init func
  async load() {
    // vm restriction settings, default is access to everything
    const vmOptions = {
      builtin: this.access, // TODO: reference access file
      external: true, // TODO: reference access file
    };

    try {
      this.createWorker();

      // tell the worker its name :)
      await this.emit('name', this.getName());

      // create the vm, export the plugin's class
      if (!(await this.emit('load', this.path, vmOptions)))
        throw '';

      // get some initial information to create an omegga proxy
      const initialData = bootstrap(this.omegga);
      // send all of the mock events to the proxy omegga
      for (const ev in initialData) {
        try {
          this.#worker.postMessage({
            action: 'brickadiaEvent',
            args: [ev, ...initialData[ev]],
          });
        } catch (e) { /* just writing 'safe' code :) */}
      }

      // pass events through
      this.omegga.on('*', this.eventPassthrough);

      // actually start the plugin
      if (!(await this.emit('start')))
        throw '';

      return true;
    } catch (e) {

      // kill the worker
      await this.emit('kill');

      Omegga.error('!>'.red, 'error loading node vm plugin', this.getName().brightRed.underline, e);
      return false;
    }
  }

  // disrequire the plugin into the system, run the stop func
  unload() {
    let frozen = true, timed = false;

    return Promise.race([
      (async() => {
        // can't unload the plugin if it hasn't been loaded
        if (typeof this.#worker === 'undefined')
          return false;

        try {
          // remove listeners
          this.omegga.off('*', this.eventPassthrough);

          // stop the plugin (cleanly)
          await this.emit('stop');

          // let the unload function wait for the worker to properly cleanup
          const promise = new Promise(res => {
            this.#worker.once('exit', res);
          });

          // kill the worker
          await this.emit('kill');

          // wait for the worker to exit
          await promise;

          frozen = false;
          if (timed) return;
          return true;
        } catch (e) {
          frozen = false;
          if (timed) return;

          Omegga.error('!>'.red, 'error unloading node plugin', this.getName().brightRed.underline, e);
          return false;
        }
      })(),
      new Promise(resolve => {
        // check if the worker is frozen (while true)
        setTimeout(() => {
          if (!frozen) return;
          this.plugin.emit('error', 0, 'I appear to be in unresponsive - terminating worker');

          // remove listeners
          this.omegga.off('*', this.eventPassthrough);

          // tell the worker to exit
          if(this.#worker) this.#worker.emit('exit');

          // terminate the worker if it still exists
          if(this.#worker) this.#worker.terminate();

          timed = true;
          resolve(true);
        }, 5000);
      })
    ]);
  }

  // emit an action to the worker and return a promise with its response
  emit(action, ...args) {
    if (!this.#worker) return;

    const messageId = 'message:' + (this.messageCounter ++);

    // promise waits for the message to resolve
    const promise = new Promise(resolve =>
      this.plugin.once(messageId, resolve));

    // post the message
    try {
      this.#worker.postMessage({
        action,
        args: [messageId, ...args],
      });
    } catch (e) {
      return Promise.reject(e);
    }

    // return the promise
    return promise;
  }

  // create the worker for this plugin, attach emitter
  createWorker() {
    this.#worker = new Worker(path.join(__dirname, 'plugin_node_safe/worker.js'), {
      stdout: true,
    });

    // pipe plugin output into omegga
    this.#outInterface = readline.createInterface({input: this.#worker.stdout, terminal: false});
    this.#errInterface = readline.createInterface({input: this.#worker.stderr, terminal: false});
    this.#outInterface.on('line', Omegga.log);
    this.#errInterface.on('line', Omegga.error);

    // attach message emitter
    this.#worker.on('message', ({action, args}) =>
      this.plugin.emit(action, ...args));

    // broadcast an error if there is one
    this.#worker.on('error', err => {
      Omegga.error('!>'.red, 'error in plugin', this.getName().brightRed.underline, err);
    });

    // when the worker exits - set its variable to undefined this knows it's stopped
    this.#worker.on('exit', () => {
      this.#outInterface.removeAllListeners('line');
      this.#errInterface.removeAllListeners('line');
      this.#worker = undefined;
    });
  }

  eventPassthrough(...args) {
    // worker does not exist
    if (!this.#worker) return;

    try {
      // post the message
      this.#worker.postMessage({
        action: 'brickadiaEvent',
        args,
      });
    } catch (e) {
      // make sure post message doesn't crash the entire app
    }
  }
}

module.exports = NodeVmPlugin;