import Logger from '@/logger';
import OmeggaPlugin from '@/plugin';
import soft from '@/softconfig';
import fs from 'fs';
import Datastore from 'nedb-promises';
import path from 'path';
import type Player from './player';
import type Omegga from './server';
import { IPluginDocumentation, IPluginCommand } from '@/plugin';

export interface IPluginJSON {
  formatVersion: number;
  omeggaVersion: string;
  emitConfig?: string;
}

// Check if this plugin is disabled
const DISABLED_FILE = 'disabled.omegga';

// TODO: move doc.json to this file (maybe)
// TODO: cleaner plugin error messages

export interface IStoreItem<T = unknown> {
  type: 'store';
  key: string;
  plugin: string;
  value: T;
}

export interface IStoreConfig {
  type: 'config';
  plugin: string;
  value: Record<string, unknown>;
}

/*
  Plugin interface
    Allows omegga to interface with plugins of a format
*/
export class Plugin {
  // returns true if a plugin at this path can be loaded
  // only one kind of plugin should match this type
  static canLoad(_pluginPath: string) {
    return false;
  }

  // returns the kind of plugin this is
  static getFormat() {
    throw 'undefined plugin format';
  }

  // read a file as json or return null
  static readJSON(file: string) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  path: string;
  omegga: Omegga;
  shortPath: string;
  storage: PluginStorage;

  documentation: IPluginDocumentation;
  pluginConfig: IPluginJSON;
  pluginFile: string;
  commands: string[];
  loadedPlugin: OmeggaPlugin;

  // initialize a plugin at this path
  constructor(pluginPath: string, omegga: Omegga) {
    this.path = pluginPath;
    this.omegga = omegga;
    this.shortPath = pluginPath.replace(
      path.join(omegga.path, soft.PLUGIN_PATH) + '/',
      ''
    );
  }

  // assign plugin storage
  setStorage(storage: PluginStorage) {
    this.storage = storage;
  }

  // check if the plugin is enabled
  isEnabled() {
    return !fs.existsSync(path.join(this.path, DISABLED_FILE));
  }
  // set the plugin enabled/disabled
  setEnabled(enabled: boolean) {
    const disabledPath = path.join(this.path, DISABLED_FILE);
    if (enabled === this.isEnabled()) {
      return;
    }
    if (enabled) {
      fs.unlinkSync(disabledPath);
    } else {
      fs.closeSync(fs.openSync(disabledPath, 'w'));
    }
    this.emitStatus();
  }

  // emit a plugin status change
  emitStatus() {
    this.omegga.emit('plugin:status', this.shortPath, {
      name: this.getName(),
      isLoaded: this.isLoaded(),
      isEnabled: this.isEnabled(),
    });
  }

  // emit a custom event from another plugin
  async emitPlugin(_ev: string, _from: string, _args: any[]): Promise<any> {}

  // get the plugin name, usually based on documentation data
  getName() {
    const doc = this.getDocumentation();
    return (doc ? doc.name : path.basename(this.path)) || 'unnamed plugin';
  }

  // get the documentation object for this plugin
  getDocumentation(): IPluginDocumentation {
    return null;
  }

  // return true if this plugin is loaded
  isLoaded() {
    return false;
  }

  // return true if the command exists
  isCommand(_cmd: string) {
    return false;
  }

  // start the plugin, returns true if plugin successfully loaded
  async load() {
    return false;
  }

  // stop + kill the plugin, returns true if plugin successfully unloaded
  async unload() {
    return false;
  }

  // extra info for this kind of plugin
  getInfo() {
    return {};
  }
}

// key-value storage for a plugin
export class PluginStorage {
  store: Datastore;
  plugin: Plugin;
  name: string;

  constructor(store: Datastore, plugin: Plugin) {
    this.store = store;
    this.plugin = plugin;
    this.name = plugin.getName();
  }

  // get the initial config values
  getDefaultConfig() {
    const doc = this.plugin.getDocumentation();
    // check if the documentation object exists and whether it has a config field
    if (!doc) return {};
    if (!doc.config) return {};

    // insert values from default config values
    const config: Record<string, unknown> = {};
    for (const k in doc.config) {
      config[k] = doc.config[k].default;
    }

    return config;
  }

  // set the config field for this plugin
  async setConfig(value: unknown) {
    await this.store.update(
      { type: 'config', plugin: this.name },
      {
        $set: { value },
      },
      { upsert: true }
    );
  }

  // get the config for this plugin
  async getConfig(): Promise<Record<string, unknown>> {
    const config = await this.store.findOne<IStoreConfig>({
      type: 'config',
      plugin: this.name,
    });
    if (!config) return null;
    return config.value;
  }

  /** Wipes the configs for the plugin. */
  async wipeConfig() {
    await this.store.remove(
      { type: 'config', plugin: this.name },
      { multi: true }
    );
  }

  /** Initializes the configs for the plugin into the database and sets default configs. */
  async init() {
    // get default and configured values
    const defaultConf = this.getDefaultConfig();
    const config = await this.getConfig();

    await this.setConfig({
      // use default config
      ...defaultConf,

      // override with actual config values
      ...(config ? config : {}),
    });
  }

  // get a stored object
  async get<T>(key: string) {
    if (typeof key !== 'string' || key.length === 0) return;
    const obj = await this.store.findOne<IStoreItem<T>>({
      type: 'store',
      plugin: this.name,
      key,
    });
    if (!obj) return null;
    return obj.value;
  }

  // delete a stored object
  async delete(key: string) {
    if (typeof key !== 'string' || key.length === 0) return;
    await this.store.remove({ type: 'store', plugin: this.name, key }, {});
  }

  // clear all stored values
  async wipe() {
    await this.store.remove(
      { type: 'store', plugin: this.name },
      { multi: true }
    );
  }

  // count number of objects in store
  async count() {
    return await this.store.count({ type: 'store', plugin: this.name });
  }

  // get keys of all objects in store
  async keys() {
    const objects = await this.store.find<IStoreItem>({
      type: 'store',
      plugin: this.name,
    });
    return objects.map(o => o.key);
  }

  // set a stored value
  async set<T = unknown>(key: string, value: T) {
    if (typeof key !== 'string' || key.length === 0) return;
    await this.store.update<IStoreItem>(
      { type: 'store', plugin: this.name, key },
      { $set: { value } },
      { upsert: true }
    );
  }
}

/*
  Plugin Loader and Scanner
    Allows omegga to scan in plugins and load them
*/
export class PluginLoader {
  path: string;
  omegga: Omegga;
  store: Datastore;
  formats: typeof Plugin[];
  plugins: Plugin[];

  commands: Record<string, IPluginCommand & { _plugin: Plugin }>;
  documentation: Record<string, IPluginDocumentation & { _plugin: Plugin }>;

  constructor(pluginsPath: string, omegga: Omegga) {
    this.path = pluginsPath;
    this.omegga = omegga;
    this.store = Datastore.create({
      filename: path.join(omegga.dataPath, soft.PLUGIN_STORE),
      autoload: true,
    });
    this.store.persistence.setAutocompactionInterval(1000 * 60 * 5);
    this.formats = [];
    this.plugins = [];

    // soon to be deprecated !help
    omegga.on('chatcmd:help', this.showHelp.bind(this));

    // use /plugins to get help
    omegga.on('cmd:plugins', this.showHelp.bind(this));
  }

  // let the plugin loader scan another kind of plugin in
  addFormat(format: typeof Plugin) {
    if (!(format instanceof Plugin))
      throw 'provided plugin format is not a plugin';

    this.formats.push(format);
  }

  // determine if this command is a command on the plugin
  isCommand(cmd: string) {
    return cmd === 'plugins' || this.plugins.some(p => p.isCommand(cmd));
  }

  // scan a folder and load in formats
  loadFormats(dir: string) {
    // add all the discovered formats into the formats list
    this.formats.push(
      // find all plugin_EXT.js files in the given dir
      ...fs
        .readdirSync(dir)
        // all files match the plugin_nameType.js pattern
        .filter(file => file.match(/plugin_[a-zA-Z_]+\.js$/))
        // require all the formats
        .map(file => require('./plugin/' + file).default)
    );
    Logger.verbose('Found plugin formats:', this.formats);
  }

  // unload and load all installed plugins
  async reload() {
    let ok = true;
    Logger.verbose('Reloading plugins');
    for (const p of this.plugins) {
      try {
        // unload the plugin if it's loaded
        if (p.isLoaded()) await p.unload();

        // load the plugin if it successfully unloaded
        if (!p.isLoaded()) {
          // only load it if it is enabled
          if (p.isEnabled()) {
            Logger.verbose(
              'Loading plugin',
              (p.constructor as typeof Plugin).getFormat(),
              p.getName().underline
            );
            ok = (await p.load()) || ok;
          }
        } else {
          Logger.errorp(
            'Did not successfully unload plugin',
            p.getName().brightRed.underline
          );
          ok = false;
        }
      } catch (err) {
        Logger.errorp(
          'Error loading plugin',
          p.getName().brightRed.underline,
          err
        );
        ok = false;
      }
    }
    Logger.verbose('Finished reloading plugins');
    return ok;
  }

  // stop all plugins from running
  async unload() {
    Logger.verbose('Unloading plugins');
    let ok = true;
    // potentually use Promise.all
    for (const p of this.plugins) {
      try {
        // unload the plugin if it's loaded
        if (p.isLoaded()) {
          if (!(await p.unload())) {
            Logger.errorp(
              'Could not unloading plugin',
              p.getName().brightRed.underline
            );
            ok = false;
            continue;
          } else {
            Logger.verbose('Unloaded', p.getName().underline);
          }
        }
      } catch (e) {
        Logger.errorp(
          'Error unloading plugin',
          p.getName().brightRed.underline
        );
        ok = false;
      }
    }
    return ok;
  }

  /** Scans plugin directory for plugins and builds their documentation. */
  async scan() {
    Logger.verbose('Scanning plugin directory');
    // plugin directory doesn't exist
    if (!fs.existsSync(this.path)) {
      Logger.verbose('Plugin directory is missing');
      return false;
    }

    // make sure there are no plugins running
    if (this.plugins.some(p => p.isLoaded())) {
      Logger.errorp('Cannot re-scan plugins while a plugin is loaded');
      return false;
    }

    // find all directories in the plugin path
    this.plugins = (
      await Promise.all(
        fs
          .readdirSync(this.path)
          .map(dir => path.join(this.path, dir)) // convert from local paths
          // every plugin must be in a directory
          .filter(dir => fs.existsSync(dir) && fs.lstatSync(dir).isDirectory())
          // every plugin must be loadable through some format
          .map(async dir => {
            Logger.verbose('Scanning plugin', dir.underline);
            // find a plugin format that can load in this plugin
            const PluginFormat = this.formats.find(f => f.canLoad(dir));

            // let users know if there's a missing plugin format
            if (!PluginFormat) {
              Logger.errorp('Missing plugin format for', dir);
              return;
            }
            try {
              // create the plugin format
              const plugin = PluginFormat && new PluginFormat(dir, this.omegga);
              if (!plugin.getDocumentation()) {
                Logger.errorp('Missing/invalid plugin documentation for', dir);
                return;
              }

              // create its storage
              const storage = new PluginStorage(this.store, plugin);
              await storage.init();

              // load the storage in
              plugin.setStorage(storage);

              // if there is a plugin format, create the plugin instance (but don't load yet)
              return plugin;
            } catch (e) {
              // if a plugin format fails to load, prevent omegga from dying
              Logger.errorp(
                'Error loading plugin',
                dir.brightRed.underline,
                PluginFormat,
                e
              );
            }
          })
      )
    )
      // remove plugins without formats
      .filter(p => p);

    Logger.verbose('Finished scanning plugin directory');
    Logger.verbose(
      `Found ${this.plugins.length} plugins`,
      this.plugins.map(p => p.getName())
    );

    this.buildDocumentation();

    return true;
  }

  // show helptext
  showHelp(player: string | Player, ...args: string[]) {
    // send the message to the player
    const send = (msg: string) => this.omegga.whisper(player, msg);

    // available commands and documentation from the plugin system
    const commands = this.commands;
    const docs = this.documentation;

    const splitHelper = (objs: string[]) => {
      const lines = [];
      while (objs.length > 0) {
        const [item] = objs.splice(0, 1);
        if (!lines.length || lines[lines.length - 1].length + item.length > 150)
          lines.push(item);
        else lines[lines.length - 1] += ', ' + item;
      }
      return lines;
    };

    // no arguments
    if (!args.length) {
      send(
        '"Use <code>/plugins plugin</>, <code>/plugins !command</>, <code>/plugins /command</> for more information"'
      );
      const plugins = Object.keys(docs).map(
        d =>
          `<color=\\"${
            docs[d]._plugin.isLoaded() ? 'aaffaa' : 'aaaaaa'
          }\\">${d}</>`
      );
      if (!plugins.length) {
        send('"<b>No Installed Plugins</>"');
      } else {
        const lines = splitHelper(plugins);
        send(`"<b>Installed Plugins</>: ${lines[0]}"`);
        for (let i = 1; i < lines.length; i++) send(`"${lines[i]}"`);
      }

      // plugin or command argument
    } else if (args.length > 0) {
      const target = args.join(' ').toLowerCase();

      // argument is a plugin; render description, author, and commands
      if (target in docs) {
        const doc = docs[target];
        const desc = doc.description || 'no description';
        const color = doc._plugin.isLoaded() ? 'aaffaa' : 'aaaaaa';
        send(
          `"<b>Plugin</> <code><color=\\"${color}\\">${doc.name}</></>: ${desc}"`
        );

        if (doc.author)
          send(`"<b>Author</>: <color=\\"c4d7f5\\"><b>${doc.author}</></>"`);

        if (doc.commands && doc.commands.length > 0) {
          const lines = splitHelper(
            doc.commands.map(c => `<code>${c.name}</>`)
          );
          send(`"<b>Commands</>: ${lines[0]}"`);
          for (let i = 1; i < lines.length; i++) send(`"${lines[i]}"`);
        }

        // argument is a command
      } else if (target in commands) {
        const cmd = commands[target];
        const desc = cmd.description || 'no description';
        const example = cmd.example || 'no example';
        const color = cmd._plugin.isLoaded() ? 'aaffaa' : 'aaaaaa';
        send(
          `"<b>Command</> <code><color=\\"${color}\\">${cmd.name}</></>: ${desc}"`
        );
        send(`"<b>Example</>: <code>${example}</>"`);
        if (cmd.args && cmd.args.length > 0) {
          send('"<b>Arguments</>:"');
          for (const arg of cmd.args) {
            const desc = arg.description || 'no description';
            send(
              `"- <code>${arg.name}</>${
                arg.required ? ' (required)' : ''
              }: ${desc}"`
            );
          }
        } else {
          send('"<b>Arguments</>: None"');
        }

        // user takes the helptext literally
      } else if (
        args[0] === '!command' ||
        args[0] === '/command' ||
        args[0] === 'plugin'
      ) {
        send(
          '"Use <code>/plugins [name of plugin]</> or <code>/plugins [name of !command or /command]</> for more help for the respective plugin or command"'
        );

        // argument is not found
      } else {
        send('"Could not find that command or plugin"');
      }

      // too many arguments
    } else {
      send(
        '"Use <code>/plugins</> to list plugins and <code>/plugins plugin</> or <code>!help !command or /command</> for more information"'
      );
    }
  }

  // generate documentation from loaded plugins
  buildDocumentation() {
    this.documentation = {};
    this.commands = {};
    for (const plugin of this.plugins) {
      // make sure this plugin has docs
      const doc = JSON.parse(JSON.stringify(plugin.getDocumentation()));
      if (!doc) continue;
      const name = plugin.getName();
      if (!name) continue;

      // add the documentation into a dictionary
      this.documentation[name.toLowerCase()] = doc;
      doc._plugin = plugin;

      // add all the commands into a dictionary
      if (doc.commands) {
        for (const cmd of doc.commands) {
          this.commands[cmd.name.toLowerCase()] = cmd;
          cmd._plugin = plugin;
        }
      }
    }
  }
}
