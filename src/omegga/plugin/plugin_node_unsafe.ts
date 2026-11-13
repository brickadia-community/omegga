/// <reference path="./disrequire.d.ts" />
import Logger from '@/logger';
import { recordPluginError } from '@/metrics/errors';
import OmeggaPlugin, {
  type OmeggaUnsafe,
  type PluginConfig,
  type PluginHttpRequest,
  type PluginMetrics,
  type PluginStore,
} from '@/plugin';
import type Omegga from '@omegga/server';
import * as util from '@util';
import disrequire from 'disrequire';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { buildTypedPlugin, PLUGIN_BUILD_DIR } from './build';
import { Plugin, toConsoleCommands } from './interface';

global.OMEGGA_UTIL = util;

/**
 * What an unsafe plugin's entry file exports: the plugin class itself, not an
 * instance. Typing it as `OmeggaPlugin` (the instance type) is what previously
 * forced `as any` at every use.
 */
type PluginConstructor = new (
  omegga: OmeggaUnsafe,
  config: PluginConfig,
  store: PluginStore,
  metrics: PluginMetrics,
) => OmeggaPlugin;

// Main plugin file (like index.js)
// this isn't named 'index.js' or 'plugin.js' because those may be filenames
// used with other loaders (rpc loader) and are too generic
// omegga.main.js is rather unique and helps avoid collision
const MAIN_FILE = 'omegga.main.js';
// a TypeScript entry is bundled into .build/omegga.main.js on every load, and
// wins over omegga.main.js, so a plugin can keep a prebuilt omegga.main.js for
// omegga versions that predate it
const MAIN_FILE_TS = 'omegga.main.ts';
const TS_BUILD_FILE = 'omegga.main.js';

// Documentation file (contains name, description, author, command helptext)
const DOC_FILE = 'doc.json';
const PLUGIN_FILE = 'plugin.json';

export default class NodePlugin extends Plugin {
  // every node plugin requires the main file and a doc file
  // may evolve this so it checks the contents of the doc file later
  static canLoad(pluginPath: string) {
    return (
      (fs.existsSync(path.join(pluginPath, MAIN_FILE)) ||
        fs.existsSync(path.join(pluginPath, MAIN_FILE_TS))) &&
      fs.existsSync(path.join(pluginPath, DOC_FILE))
    );
  }

  // unsafe node plugins (can potentially crash omegga) are powerful
  static getFormat() {
    return 'node_unsafe';
  }

  // path to the file require()d when the plugin loads
  pluginFile: string;
  // built from omegga.main.ts before each load
  isTypeScript: boolean;
  // the instantiated plugin class; undefined until load() and after unload()
  loadedPlugin: OmeggaPlugin | undefined;

  constructor(pluginPath: string, omegga: Omegga) {
    super(pluginPath, omegga);
    // TODO: validate documentation
    this.documentation = Plugin.readJSON(path.join(pluginPath, DOC_FILE));
    this.pluginConfig = Plugin.readJSON(path.join(pluginPath, PLUGIN_FILE));
    this.isTypeScript = fs.existsSync(path.join(pluginPath, MAIN_FILE_TS));
    this.pluginFile = this.isTypeScript
      ? path.join(pluginPath, PLUGIN_BUILD_DIR, TS_BUILD_FILE)
      : path.join(pluginPath, MAIN_FILE);

    // list of registered comands
    this.commands = [];
  }

  // documentation is based on doc.json file
  getDocumentation() {
    return this.documentation;
  }

  // loaded state is based on if the loadedPlugin object is created
  isLoaded() {
    return !!this.loadedPlugin;
  }

  // determing if a command is registered
  isCommand(cmd: string) {
    return this.commands.includes(cmd);
  }

  // require the plugin into the system, run the init func
  async load() {
    const stopPlugin = (reason?: string) => {
      Logger.errorp('error launching node plugin', this.getName(), ':', reason);
      try {
        this.disrequireAll();
      } catch (e) {
        Logger.errorp('error unloading node plugin (2)', this.getName(), e);
      }
      this.emitStatus();
      return false;
    };
    this.commands = [];
    this.extraConsoleCommands = [];

    try {
      const config = await this.storage.getConfig();
      if (this.pluginConfig?.emitConfig) {
        await fs.promises.writeFile(
          path.join(this.path, this.pluginConfig.emitConfig),
          JSON.stringify(config),
        );
      }

      if (this.isTypeScript && !(await this.build()))
        return stopPlugin('failed to build TypeScript');

      // require the plugin itself
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- unsafe plugins are loaded with a real runtime require
      const exported: unknown = require(this.pluginFile);
      // a TypeScript entry's `export default` lands on .default; a JS entry
      // assigns the class to module.exports. Checked to be a class just
      // below; its constructor signature can't be checked at runtime
      const Plugin = (
        this.isTypeScript &&
        typeof exported === 'object' &&
        exported !== null &&
        'default' in exported
          ? exported.default
          : exported
      ) as PluginConstructor;

      // node plugins must export a class with a constructor
      if (
        typeof Plugin?.prototype !== 'object' ||
        typeof Plugin.prototype.constructor !== 'function'
      )
        return stopPlugin('missing constructor in plugin');

      // interface with plugin store
      const store: PluginStore = {
        get: key => this.storage.get(key),
        set: (key, value) => this.storage.set(key, value),
        delete: key => this.storage.delete(key),
        wipe: () => this.storage.wipe(),
        count: () => this.storage.count(),
        keys: () => this.storage.keys(),
      };

      // unsafe plugins run in omegga's own process, so their metrics facade
      // writes straight into the host registry
      const loadedPlugin: OmeggaPlugin = new Plugin(
        this.server,
        config ?? {},
        store,
        this.metrics,
      );
      this.loadedPlugin = loadedPlugin;

      // start the loaded plugin
      if (typeof loadedPlugin.init === 'function') {
        const result = await loadedPlugin.init();

        // plugins can return a result object
        if (typeof result === 'object' && result) {
          // if registeredCommands is in the results, register the provided strings as commands
          const cmds = result.registeredCommands;
          if (
            cmds &&
            cmds instanceof Array &&
            cmds.every(i => typeof i === 'string')
          )
            this.commands = cmds;
        }
      }

      // before emitStatus, which is when the terminal checks the plugin's
      // console commands for clashes
      if (typeof loadedPlugin.extraConsoleCommands === 'function') {
        try {
          // typed, but plugin code can return anything
          const extra: unknown = await loadedPlugin.extraConsoleCommands();
          this.extraConsoleCommands = toConsoleCommands(extra);
        } catch (e) {
          Logger.errorp(
            'error getting console commands of node plugin',
            this.getName(),
            e,
          );
        }
      }

      this.emitStatus();
      return true;
    } catch (e) {
      recordPluginError(this.getName());
      Logger.errorp('error loading node plugin', this.getName(), e);
      this.emitStatus();
      return false;
    }
  }

  // disrequire the plugin into the system, run the stop func
  async unload() {
    // can't unload the plugin if it hasn't been loaded
    if (typeof this.loadedPlugin === 'undefined') {
      this.emitStatus();
      return false;
    }

    try {
      // run the stop func on the plugin if applicable
      if (typeof this.loadedPlugin.stop === 'function')
        await this.loadedPlugin.stop();

      // unload the plugin
      this.disrequireAll();
      this.loadedPlugin = undefined;
      this.extraConsoleCommands = [];
      this.dropMetrics();
      this.emitStatus();
      this.commands = [];
      return true;
    } catch (e) {
      recordPluginError(this.getName());
      Logger.errorp('error unloading node plugin', this.getName(), e);
      this.emitStatus();
      return false;
    }
  }

  /**
   * Bundle omegga.main.ts into .build/. False when the bundle has errors:
   * unlike a safe plugin, an unsafe one runs in omegga's process, so a
   * half-built bundle is not worth starting.
   */
  async build() {
    const output = await buildTypedPlugin(
      this.getName(),
      this.path,
      MAIN_FILE_TS,
      TS_BUILD_FILE,
      { absoluteSourcePaths: true },
    );
    if (output === undefined) return false;
    // stack traces from the bundle point at the plugin's .ts files. This is
    // process wide, and only turned on once a TypeScript plugin needs it,
    // since it makes every Error.stack in omegga a little slower
    process.setSourceMapsEnabled(true);
    return true;
  }

  // forward plugin events to the loaded plugin instance
  async http(request: PluginHttpRequest) {
    if (typeof this.loadedPlugin?.http !== 'function') return undefined;
    return (await this.loadedPlugin.http(request)) ?? undefined;
  }

  // Unsafe plugins listen on omegga's own emitter, so the event goes out there.
  // EventEmitter's emit skips omegga's `*` relay, which keeps it from reaching
  // safe and JSON-RPC plugins; another unsafe plugin listening for the same
  // command name would still hear it
  async emitConsoleCommand(name: string, args: string[]) {
    if (!this.loadedPlugin) return;
    EventEmitter.prototype.emit.call(
      this.server,
      'consolecmd:' + name,
      ...args,
    );
  }

  async emitPlugin(ev: string, from: string, args: unknown[]) {
    if (typeof this.loadedPlugin?.pluginEvent === 'function') {
      return await this.loadedPlugin.pluginEvent(ev, from, ...args);
    }
  }

  // disrequire all that match plugin path in require.cache
  disrequireAll() {
    // node caches modules under their real path, so a plugin folder that is a
    // symlink (a checkout linked into plugins/) is matched by its target too;
    // otherwise a reload keeps running the old code
    const roots = [this.path];
    try {
      const real = fs.realpathSync(this.path);
      if (real !== this.path) roots.push(real);
    } catch {
      // a deleted plugin folder: only its old path can be in the cache
    }
    const requiredFiles = Object.keys(require.cache).filter(requiredFile =>
      roots.some(root => requiredFile.includes(root)),
    );
    // disrequire all the files
    requiredFiles.forEach(file => {
      try {
        disrequire(file);
      } catch (e) {
        // ignore error thrown if a module was deleted
        if (
          !(e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND')
        )
          throw e;
      }
    });
  }
}
