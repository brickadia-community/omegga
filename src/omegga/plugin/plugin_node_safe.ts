import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Worker } from 'worker_threads';
import { Plugin } from '@omegga/plugin';
import Omegga from '@omegga/server';
import { bootstrap } from './plugin_node_safe/proxyOmegga';

// Main plugin file (like index.js)
// this isn't named 'index.js' or 'plugin.js' because those may be filenames
// used with other loaders (rpc loader) and are too generic
// omegga.main.js is rather unique and helps avoid collision
const MAIN_FILE = 'omegga.plugin.js';
const MAIN_FILE_TS = 'omegga.plugin.ts';

// Documentation file (contains name, description, author, command helptext)
const DOC_FILE = 'doc.json';
const ACCESS_FILE = 'access.json';
const PLUGIN_FILE = 'plugin.json';

export default class NodeVmPlugin extends Plugin {
  #worker: Worker;
  #outInterface: readline.Interface;
  #errInterface: readline.Interface;

  // every node vm plugin requires a main file, a doc file, and an access file
  // may evolve this so it checks the contents of the doc file later
  static canLoad(pluginPath: string) {
    return (
      (fs.existsSync(path.join(pluginPath, MAIN_FILE)) ||
        fs.existsSync(path.join(pluginPath, MAIN_FILE_TS))) &&
      fs.existsSync(path.join(pluginPath, DOC_FILE)) &&
      fs.existsSync(path.join(pluginPath, ACCESS_FILE))
    );
  }

  // safe node plugins are limited
  static getFormat() {
    return 'node_safe';
  }

  plugin: EventEmitter;
  messageCounter: number;
  access: string[];
  isTypeScript: boolean;

  constructor(pluginPath: string, omegga: Omegga) {
    super(pluginPath, omegga);

    // event emitter and message counter for keeping track of worker events
    this.plugin = new EventEmitter();
    this.messageCounter = 0;

    // TODO: validate documentation
    this.documentation = Plugin.readJSON(path.join(pluginPath, DOC_FILE));
    this.isTypeScript = fs.existsSync(path.join(pluginPath, MAIN_FILE_TS));
    this.pluginConfig = Plugin.readJSON(path.join(pluginPath, PLUGIN_FILE));

    // access list is a list of builtin requires
    // can be ['*'] for everything
    this.access = Plugin.readJSON(path.join(pluginPath, ACCESS_FILE)) || [];

    // list of registered commands
    this.commands = [];

    // verify access is an array of strings
    if (
      !(this.access instanceof Array) ||
      !this.access.every(s => typeof s === 'string')
    ) {
      throw new Error('access list not a string array');
    }

    // plugin name
    const name = this.getName();

    // when the worker emits an error or a log, pass it up to omegga
    this.plugin.on('error', (resp, ...args) => {
      Omegga.error(name.brightRed.underline, '!>'.red, ...args);
      this.notify(resp);
    });
    this.plugin.on('log', (resp, ...args) => {
      Omegga.log(name.underline, '>>'.green, ...args);
      this.notify(resp);
    });

    // let the worker write commands to brickadia
    this.plugin.on('exec', (_, cmd) => omegga.writeln(cmd));

    // storage interface
    this.plugin.on('store.get', async (resp, key) => {
      try {
        this.notify(resp, await this.storage.get(key));
      } catch (e) {
        Omegga.error(
          name.brightRed.underline,
          '!>'.red,
          'error in store.get of',
          key
        );
      }
    });
    this.plugin.on('store.set', async (resp, key, value) => {
      try {
        await this.storage.set(key, JSON.parse(value));
      } catch (e) {
        Omegga.error(
          name.brightRed.underline,
          '!>'.red,
          'error in store.set of',
          key,
          value
        );
      }
      this.notify(resp);
    });
    this.plugin.on('store.delete', async (resp, key) => {
      try {
        await this.storage.delete(key);
      } catch (e) {
        Omegga.error(
          name.brightRed.underline,
          '!>'.red,
          'error in store.delete of',
          key
        );
      }
      this.notify(resp);
    });
    this.plugin.on('store.wipe', async resp => {
      try {
        await this.storage.wipe();
      } catch (e) {
        Omegga.error(name.brightRed.underline, '!>'.red, 'error in store.wipe');
      }
      this.notify(resp);
    });
    this.plugin.on('store.count', async resp => {
      try {
        this.notify(resp, await this.storage.count());
      } catch (e) {
        Omegga.error(
          name.brightRed.underline,
          '!>'.red,
          'error in store.count'
        );
      }
    });
    this.plugin.on('store.keys', async resp => {
      try {
        this.notify(resp, await this.storage.keys());
      } catch (e) {
        Omegga.error(name.brightRed.underline, '!>'.red, 'error in store.keys');
      }
    });

    // plugin fetching
    this.plugin.on('getPlugin', async (resp, name) => {
      const plugin = this.omegga.pluginLoader.plugins.find(
        p => p.getName() === name
      );

      if (plugin) {
        this.notify(resp, {
          name,
          documentation: plugin.getDocumentation(),
          loaded: plugin.isLoaded(),
        });
      } else {
        this.notify(resp);
      }
    });

    this.plugin.on('emitPlugin', async (resp, target, ev, args) => {
      const plugin = this.omegga.pluginLoader.plugins.find(
        p => p.getName() === target
      );

      if (plugin) {
        let r = await plugin.emitPlugin(ev, name, args);
        this.notify(resp, r);
      } else {
        Omegga.error(name.brightRed.underline, '!>'.red, 'error in emitPlugin');
      }
    });

    // command registration
    this.plugin.on('command.registers', async (_, blob) => {
      if (typeof blob !== 'string') return;
      const registers = JSON.parse(blob);
      // ensure registers is an array of strings
      if (
        !(registers instanceof Array) ||
        registers.some(i => typeof i !== 'string')
      )
        return;

      this.commands = registers;
    });

    // listen on every message, post them to to the worker
    this.eventPassthrough = this.eventPassthrough.bind(this);
  }

  // emit a custom plugin event
  async emitPlugin(ev: string, from: string, args: any[]) {
    const [r]: any[] = (await this.emit('emitPlugin', ev, from, args)) ?? [];
    return r;
  }

  // documentation is based on doc.json file
  getDocumentation() {
    return this.documentation;
  }

  // loaded state is based on if a worker exists
  isLoaded() {
    return !!this.#worker;
  }

  // determing if a command is registered
  isCommand(cmd: string) {
    return this.commands.includes(cmd);
  }

  // require the plugin into the system, run the init func
  async load() {
    // can't load the plugin if it's already loaded
    if (typeof this.#worker !== 'undefined') return false;

    // vm restriction settings, default is access to everything
    const vmOptions = {
      builtin: this.access, // TODO: reference access file
      external: true, // TODO: reference access file
      isTypeScript: this.isTypeScript,
    };
    this.commands = [];

    try {
      const config = await this.storage.getConfig();
      if (this.pluginConfig?.emitConfig) {
        await fs.promises.writeFile(
          path.join(this.path, this.pluginConfig.emitConfig),
          JSON.stringify(config)
        );
      }
      this.createWorker();

      // tell the worker its name :)
      await this.emit('name', this.getName());

      // create the vm, export the plugin's class
      if (!(await this.emit('load', this.path, vmOptions))[0]) throw '';

      // get some initial information to create an omegga proxy
      const initialData = bootstrap(this.omegga);
      // send all of the mock events to the proxy omegga
      for (const ev in initialData) {
        try {
          (this.#worker as Worker).postMessage({
            action: 'brickadiaEvent',
            args: [ev, ...initialData[ev]],
          });
        } catch (e) {
          /* just writing 'safe' code :) */
        }
      }

      // pass events through
      this.omegga.on('*', this.eventPassthrough);

      // actually start the plugin
      if (!(await this.emit('start', config))[0]) throw 'plugin failed start';

      this.emitStatus();
      return true;
    } catch (e) {
      // kill the worker
      await this.emit('kill');

      Omegga.error(
        '!>'.red,
        'error loading node vm plugin',
        this.getName().brightRed.underline,
        e
      );
      this.emitStatus();
      return false;
    }
  }

  // disrequire the plugin into the system, run the stop func
  unload() {
    let frozen = true,
      timed = false;

    return Promise.race([
      (async () => {
        // can't unload the plugin if it hasn't been loaded
        if (typeof this.#worker === 'undefined') return false;

        try {
          // stop the plugin (cleanly)
          await this.emit('stop');

          // remove listeners
          this.omegga.off('*', this.eventPassthrough);

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
          this.emitStatus();
          this.commands = [];
          return true;
        } catch (e) {
          frozen = false;
          if (timed) return;

          Omegga.error(
            '!>'.red,
            'error unloading node plugin',
            this.getName().brightRed.underline,
            e
          );
          this.emitStatus();
          return false;
        }
      })(),
      new Promise<boolean>(resolve => {
        // check if the worker is frozen (while true)
        setTimeout(() => {
          if (!frozen) return;
          this.plugin.emit(
            'error',
            0,
            'I appear to be in an unresponsive state - terminating worker'
          );

          // remove listeners
          this.omegga.off('*', this.eventPassthrough);

          // tell the worker to exit
          if (this.#worker) this.#worker.emit('exit');

          // terminate the worker if it still exists
          if (this.#worker) this.#worker.terminate();

          timed = true;
          resolve(true);
          this.emitStatus();
        }, 5000);
      }),
    ]);
  }

  // emit an action to the worker and return a promise with its response
  emit(action: string, ...args: any[]) {
    if (!this.#worker) return;

    const messageId = 'message:' + this.messageCounter++;

    // promise waits for the message to resolve
    const promise = new Promise<unknown[]>(resolve =>
      this.plugin.once(messageId, (_, ...x) => resolve(x))
    );

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

  // notify a response to the worker
  notify(action: string, ...args: any[]) {
    if (!this.#worker) return;

    // post the message
    try {
      this.#worker.postMessage({
        action,
        args: [...args],
      });
    } catch (e) {
      // do nothing here
    }
  }

  // create the worker for this plugin, attach emitter
  createWorker() {
    this.#worker = new Worker(
      path.join(__dirname, 'plugin_node_safe/worker.js'),
      {
        stdout: true,
      }
    );

    // pipe plugin output into omegga
    this.#outInterface = readline.createInterface({
      input: this.#worker.stdout,
      terminal: false,
    });
    this.#errInterface = readline.createInterface({
      input: this.#worker.stderr,
      terminal: false,
    });
    this.#outInterface.on('line', Omegga.log);
    this.#errInterface.on('line', Omegga.error);

    // attach message emitter
    this.#worker.on('message', ({ action, args }) =>
      this.plugin.emit(action, ...args)
    );

    // broadcast an error if there is one
    this.#worker.on('error', err => {
      Omegga.error(
        '!>'.red,
        'error in plugin',
        this.getName().brightRed.underline,
        err
      );
    });

    // when the worker exits - set its variable to undefined this knows it's stopped
    this.#worker.on('exit', () => {
      this.omegga.off('*', this.eventPassthrough);
      this.#outInterface.removeAllListeners('line');
      this.#errInterface.removeAllListeners('line');
      try {
        if (this.#worker) this.#worker.terminate();
      } catch (err) {
        Omegga.error(
          '!>'.red,
          'Error terminating worker for',
          this.getName().brightRed.underline,
          err
        );
      }
      this.#worker = undefined;
      this.emitStatus();
    });
  }

  eventPassthrough(...args: any[]) {
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
      Omegga.error('!>'.red, 'error sending to plugin', ...args, e);
    }
  }
}
