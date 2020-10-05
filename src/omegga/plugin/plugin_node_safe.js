const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const readline = require('readline');

const {
  Worker, MessageChannel,
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

// read a file as json or return null
const readJSON = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
};

// deep freeze an object
// TODO: remove
function deepFreeze(object) {
  // Retrieve the property names defined on object
  const propNames = Object.getOwnPropertyNames(object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = object[name];

    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}

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
    this.documentation = readJSON(path.join(pluginPath, DOC_FILE));

    // access list is a list of builtin requires
    // can be ['*'] for everything
    this.access = readJSON(path.join(pluginPath, ACCESS_FILE)) || [];

    // verify access is an array of strings
    if (!(this.access instanceof Array) || !this.access.every(s => typeof s === 'string')) {
      throw new Error('access list not a string array');
    }

    // plugin name
    const name = this.getName();

    // when the worker emits an error or a log, pass it up to omegga
    this.plugin.on('error', (_, ...args) => {
      Omegga.log(name.brightRed.underline, '!>'.red, ...args);
      this.emit()
    });
    this.plugin.on('log', (_, ...args) => {
      Omegga.log(name.underline, '>>'.green, ...args);
    });

    // let the worker write commands to brickadia
    this.plugin.on('exec', (_, cmd) => omegga.writeln(cmd));

    // listen on every message, post them to to the worker
    this.eventPassthrough = this.eventPassthrough.bind(this);
    omegga.on('*', this.eventPassthrough);

  }

  // documentation is based on doc.json file
  getDocumentation() { return this.documentation; }

  // loaded state is based on if a worker exists
  isLoaded() { return !!this.#worker; }

  // require the plugin into the system, run the init func
  async load() {
    // vm restriction settings, default is access to everything
    const vmOptions = {
      builtin: ['*'], // TODO: reference access file
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
        this.#worker.postMessage({
          action: 'brickadiaEvent',
          args: [ev, ...initialData[ev]],
        });
      }

      // actually start the plugin
      if (!(await this.emit('start')))
        throw '';

      return true;
    } catch (e) {

      // kill the worker
      await this.emit('kill');

      Omegga.error('>!'.red, 'error loading node vm plugin', this.getName().brightRed.underline, e);
      return false;
    }
  }

  // disrequire the plugin into the system, run the stop func
  unload() {
    return new Promise(async resolve => {
      // can't unload the plugin if it hasn't been loaded
      if (typeof this.#worker === 'undefined')
        return resolve(false);

      try {

        let frozen = true;

        // check if the
        setTimeout(() => {
          if (!frozen) return;
          this.plugin.emit('error', 0, 'I appear to be in an infinite loop - terminating worker')
          this.#worker.terminate();
          this.omegga.off('*', this.eventPassthrough);
          this.#worker.emit('exit');
          resolve(true);
        }, 5000);

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

        this.omegga.off('*', this.eventPassthrough);
        frozen = false;
        return resolve(true);
      } catch (e) {
        Omegga.error('>!'.red, 'error unloading node plugin', this.getName().brightRed.underline, e);
        frozen = false;
        return resolve(false);
      }
    });
  }

  // emit an action to the worker and return a promise with its response
  emit(action, ...args) {
    if (!this.#worker) return;

    const messageId = 'message:' + (this.messageCounter ++);

    // promise waits for the message to resolve
    const promise = new Promise(resolve =>
      this.plugin.once(messageId, resolve));

    // post the message
    this.#worker.postMessage({
      action,
      args: [messageId, ...args],
    });

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
      Omegga.error('>!'.red, 'error in plugin', this.getName().brightRed.underline, err);
    });

    // when the worker exits - set its variable to undefined this knows it's stopped
    this.#worker.on('exit', (code) => {
      this.#outInterface.removeAllListeners('line');
      this.#errInterface.removeAllListeners('line');
      this.#worker = undefined;
    });
  }

  eventPassthrough(...args) {
    // worker does not exist
    if (!this.#worker) return;

    // post the message
    this.#worker.postMessage({
      action: 'brickadiaEvent',
      args,
    });
  }
}

module.exports = NodeVmPlugin;