import Logger from '@/logger';
import { IPluginCommand, IPluginDocumentation } from '@/plugin';
import soft from '@/softconfig';
import fs from 'fs';
import Datastore from 'nedb-promises';
import path from 'path';
import type Player from './player';
import { Plugin } from './plugin/interface';
import RpcPlugin from './plugin/plugin_jsonrpc_stdio';
import NodeVmPlugin from './plugin/plugin_node_safe';
import NodePlugin from './plugin/plugin_node_unsafe';
import type Omegga from './server';

export interface IPluginJSON {
  formatVersion: number;
  omeggaVersion: string;
  emitConfig?: string;
}

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
      { upsert: true },
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
      { multi: true },
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
      { multi: true },
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
      { upsert: true },
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
  formats: (typeof Plugin)[];
  plugins: Plugin[];

  commands: Record<string, IPluginCommand & { _plugin: Plugin }>;
  documentation: Record<string, IPluginDocumentation & { _plugin: Plugin }>;

  constructor(workDir: string, omegga?: Omegga) {
    this.path = path.join(workDir, soft.PLUGIN_PATH);
    this.omegga = omegga;
    this.store = Datastore.create({
      filename: path.join(workDir, soft.DATA_PATH, soft.PLUGIN_STORE),
      autoload: true,
    });
    this.store.persistence.setAutocompactionInterval(1000 * 60 * 5);
    this.plugins = [];

    Logger.verbose('Loading plugin formats');
    this.formats = [RpcPlugin, NodeVmPlugin, NodePlugin];
    Logger.verbose('Found plugin formats:', this.formats);

    if (omegga) {
      // soon to be deprecated !help
      omegga.on('chatcmd:help', this.showHelp.bind(this));

      // use /plugins to get help
      omegga.on('cmd:plugins', this.showHelp.bind(this));
    }
  }

  // determine if this command is a command on the plugin
  isCommand(cmd: string) {
    return cmd === 'plugins' || this.plugins.some(p => p.isCommand(cmd));
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
              p.getName().underline,
            );
            ok = (await p.load()) || ok;
          }
        } else {
          Logger.errorp(
            'Did not successfully unload plugin',
            p.getName().brightRed.underline,
          );
          ok = false;
        }
      } catch (err) {
        Logger.errorp(
          'Error loading plugin',
          p.getName().brightRed.underline,
          err,
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
              p.getName().brightRed.underline,
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
          p.getName().brightRed.underline,
        );
        ok = false;
      }
    }
    return ok;
  }

  /** Scans a plugin at the specified directory and create a Plugin object. */
  async scanPlugin(dir: string): Promise<Plugin> {
    Logger.verbose('Scanning plugin', dir.underline);

    if (!fs.existsSync(dir)) {
      Logger.errorp('Plugin directory does not exist', dir.brightRed.underline);
      return;
    }
    if (!fs.statSync(dir).isDirectory()) {
      Logger.errorp('Plugin must be a directory', dir.brightRed.underline);
      return;
    }

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
        e,
      );
    }
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
          .map(async dir => this.scanPlugin(dir)),
      )
    )
      // remove plugins without formats
      .filter(p => p);

    Logger.verbose('Finished scanning plugin directory');
    Logger.verbose(
      `Found ${this.plugins.length} plugins`,
      this.plugins.map(p => p.getName()),
    );

    this.buildDocumentation();

    return true;
  }

  // show helptext
  showHelp(player: string | Player, ...args: string[]) {
    // send the message to the player
    const send = (msg: string) => this.omegga.whisper(player, msg);

    // available commands and documentation from the plugin system
    const commands = this.commands ?? {};
    const docs = this.documentation ?? {};

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
        '"Use <code>/plugins plugin</>, <code>/plugins !command</>, <code>/plugins /command</> for more information"',
      );
      const plugins = Object.keys(docs).map(
        d =>
          `<color=\\"${
            docs[d]._plugin.isLoaded() ? 'aaffaa' : 'aaaaaa'
          }\\">${d}</>`,
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
          `"<b>Plugin</> <code><color=\\"${color}\\">${doc.name}</></>: ${desc}"`,
        );

        if (doc.author)
          send(`"<b>Author</>: <color=\\"c4d7f5\\"><b>${doc.author}</></>"`);

        if (doc.commands && doc.commands.length > 0) {
          const lines = splitHelper(
            doc.commands.map(c => `<code>${c.name}</>`),
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
          `"<b>Command</> <code><color=\\"${color}\\">${cmd.name}</></>: ${desc}"`,
        );
        send(`"<b>Example</>: <code>${example}</>"`);
        if (cmd.args && cmd.args.length > 0) {
          send('"<b>Arguments</>:"');
          for (const arg of cmd.args) {
            const desc = arg.description || 'no description';
            send(
              `"- <code>${arg.name}</>${
                arg.required ? ' (required)' : ''
              }: ${desc}"`,
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
          '"Use <code>/plugins [name of plugin]</> or <code>/plugins [name of !command or /command]</> for more help for the respective plugin or command"',
        );

        // argument is not found
      } else {
        send('"Could not find that command or plugin"');
      }

      // too many arguments
    } else {
      send(
        '"Use <code>/plugins</> to list plugins and <code>/plugins plugin</> or <code>!help !command or /command</> for more information"',
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
