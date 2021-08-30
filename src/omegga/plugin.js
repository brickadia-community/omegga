const fs = require('fs');
const path = require('path');

const Datastore = require('nedb-promise');

const soft = require('../softconfig.js');

// Check if this plugin is disabled
const DISABLED_FILE = 'disabled.omegga';

// TODO: move doc.json to this file (maybe)
// TODO: cleaner plugin error messages

/*
  Plugin interface
    Allows omegga to interface with plugins of a format
*/
class Plugin {
  // returns true if a plugin at this path can be loaded
  // only one kind of plugin should match this type
  static canLoad(_pluginPath) { return false; }

  // returns the kind of plugin this is
  static getFormat() { throw 'undefined plugin format'; }


  // read a file as json or return null
  static readJSON(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  // initialize a plugin at this path
  constructor(pluginPath, omegga) {
    this.path = pluginPath;
    this.omegga = omegga;
    this.shortPath = pluginPath.replace(path.join(omegga.path, soft.PLUGIN_PATH) + '/', '');
  }

  // assign plugin storage
  setStorage(storage) {
    this.storage = storage;
  }

  // check if the plugin is enabled
  isEnabled() { return !fs.existsSync(path.join(this.path, DISABLED_FILE)); }
  // set the plugin enabled/disabled
  setEnabled(enabled) {
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
  async emitPlugin(_ev, _from, _args) {}

  // get the plugin name, usually based on documentation data
  getName() {
    const doc = this.getDocumentation();
    return (doc ? doc.name : path.basename(this.path)) || 'unnamed plugin';
  }

  // get the documentation object for this plugin
  getDocumentation() { return null; }

  // return true if this plugin is loaded
  isLoaded() { return false; }

  // return true if the command exists
  isCommand(_cmd) { return false; }

  // start the plugin, returns true if plugin successfully loaded
  async load() { return false; }

  // stop + kill the plugin, returns true if plugin successfully unloaded
  async unload() { return false; }

  // extra info for this kind of plugin
  getInfo() { return {}; }
}

// key-value storage for a plugin
class PluginStorage {
  constructor(store, plugin) {
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
    const config = {};
    for (const k in doc.config) {
      config[k] = doc.config[k].default;
    }

    return config;
  }

  // set the config field for this plugin
  async setConfig(value) {
    await this.store.update({type: 'config', plugin: this.name}, {
      $set: { value },
    }, { upsert: true });
  }

  // get the config for this plugin
  async getConfig() {
    const config = await this.store.findOne({type: 'config', plugin: this.name});
    if (!config) return null;
    return config.value;
  }

  // initialize the plugin store
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
  async get(key) {
    if (typeof key !== 'string' || key.length === 0) return;
    const obj = await this.store.findOne({type: 'store', plugin: this.name, key});
    if (!obj) return null;
    return obj.value;
  }

  // delete a stored object
  async delete(key) {
    if (typeof key !== 'string' || key.length === 0) return;
    await this.store.remove({ type: 'store', plugin: this.name, key });
  }

  // clear all stored values
  async wipe() {
    await this.store.remove({ type: 'store', plugin: this.name }, {multi: true});
  }

  // count number of objects in store
  async count() {
    return await this.store.count({ type: 'store', plugin: this.name });
  }

  // get keys of all objects in store
  async keys() {
    const objects = await this.store.find({ type: 'store', plugin: this.name });
    return objects.map(o => o.key);
  }

  // set a stored value
  async set(key, value) {
    if (typeof key !== 'string' || key.length === 0) return;
    await this.store.update(
      {type: 'store', plugin: this.name, key},
      {$set: {value}},
      {upsert: true},
    );
  }
}

/*
  Plugin Loader and Scanner
    Allows omegga to scan in plugins and load them
*/
class PluginLoader {
  constructor(pluginsPath, omegga) {
    this.path = pluginsPath;
    this.omegga = omegga;
    this.store = new Datastore({filename: path.join(omegga.dataPath, soft.PLUGIN_STORE), autoload: true}),
    this.formats = [];
    this.plugins = [];

    // soon to be deprecated !help
    omegga.on('chatcmd:help', this.showHelp.bind(this));

    // use /plugins to get help
    omegga.on('cmd:plugins', this.showHelp.bind(this));
  }

  // let the plugin loader scan another kind of plugin in
  addFormat(format) {
    if (!(format instanceof Plugin))
      throw 'provided plugin format is not a plugin';

    this.formats.push(format);
  }

  // determine if this command is a command on the plugin
  isCommand(cmd) {
    return cmd === 'plugins' || this.plugins.some(p => p.isCommand(cmd));
  }

  // scan a folder and load in formats
  loadFormats(dir) {
    // add all the discovered formats into the formats list
    this.formats.push(
      // find all plugin_EXT.js files in the given dir
      ...fs.readdirSync(dir)
        // all files match the plugin_nameType.js pattern
        .filter(file => file.match(/plugin_[a-zA-Z_]+\.js/))
        // require all the formats
        .map(file => require('./plugin/' + file))
    );
  }

  // unload and load all installed plugins
  async reload() {
    let ok = true;
    Omegga.verbose('Reloading plugins');
    for (const p of this.plugins) {
      try {
        // unload the plugin if it's loaded
        if (p.isLoaded())
          await p.unload();

        // load the plugin if it successfully unloaded
        if (!p.isLoaded()) {
          // only load it if it is enabled
          if (p.isEnabled()) {
            Omegga.verbose('Loading plugin', p.constructor.getFormat(), p.getName().underline);
            ok = (await p.load()) || ok;
          }
        } else {
          Omegga.error('!>'.red, 'Did not successfully unload plugin', p.getName().brightRed.underline);
          ok = false;
        }
      } catch (err) {
        Omegga.error('!>'.red, 'Error loading plugin', p.getName().brightRed.underline, err);
        ok = false;
      }
    }
    Omegga.verbose('Finished reloading plugins');
    return ok;
  }

  // stop all plugins from running
  async unload() {
    Omegga.verbose('Unloading plugins');
    let ok = true;
    // potentually use Promise.all
    for (const p of this.plugins) {
      try {
        // unload the plugin if it's loaded
        if (p.isLoaded()) {
          if (!(await p.unload())) {
            Omegga.error('!>'.red, 'Could not unloading plugin', p.getName().brightRed.underline);
            ok = false;
            continue;
          } else {
            Omegga.verbose('Unloaded', p.getName().underline);
          }
        }
      } catch (e) {
        Omegga.error('!>'.red, 'Error unloading plugin', p.getName().brightRed.underline);
        ok = false;
      }
    }
    return ok;
  }

  // find every loadable plugin
  async scan() {
    Omegga.verbose('Scanning plugin directory');
    // plugin directory doesn't exist
    if (!fs.existsSync(this.path)) {
      Omegga.verbose('Plugin directory is missing');
      return false;
    }

    // make sure there are no plugins running
    if (this.plugins.some(p => p.isLoaded())) {
      Omegga.error('!>'.red, 'Cannot re-scan plugins while a plugin is loaded');
      return false;
    }

    // find all directories in the plugin path
    this.plugins = (await Promise.all(fs.readdirSync(this.path)
      .map(dir => path.join(this.path, dir)) // convert from local paths
      // every plugin must be in a directory
      .filter(dir => fs.existsSync(dir) && fs.lstatSync(dir).isDirectory())
      // every plugin must be loadable through some format
      .map(async dir => {
        // find a plugin format that can load in this plugin
        const PluginFormat = this.formats.find(f => f.canLoad(dir));

        // let users know if there's a missing plugin format
        if (!PluginFormat) {
          Omegga.error('!>'.red, 'Missing plugin format for', dir);
          return;
        }
        try {
          // create the plugin format
          const plugin = PluginFormat && new PluginFormat(dir, this.omegga);
          if (!plugin.getDocumentation()) {
            Omegga.error('!>'.red, 'Missing/invalid plugin documentation for', dir);
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
          Omegga.error('!>'.red, 'Error loading plugin', e.getName().brightRed.underline, PluginFormat, e);
        }
      })))
      // remove plugins without formats
      .filter(p => p);

    this.buildDocumentation();

    return true;
  }

  // show helptext
  showHelp(player, ...args) {
    // send the message to the player
    const send = msg => this.omegga.whisper(player, msg);

    // available commands and documentation from the plugin system
    const commands = this.commands;
    const docs = this.documentation;

    const splitHelper = objs => {
      const lines = [];
      while (objs.length > 0) {
        const [ item ] = objs.splice(0, 1);
        if (!lines.length || lines[lines.length - 1].length + item.length > 150)
          lines.push(item);
        else
          lines[lines.length - 1] += ', ' + item;
      }
      return lines;
    };

    // no arguments
    if (!args.length) {
      send('"Use <code>/plugins plugin</>, <code>/plugins !command</>, <code>/plugins /command</> for more information"');
      const plugins = Object.keys(docs).map(d => `<color=\\"${docs[d]._plugin.isLoaded() ? 'aaffaa' : 'aaaaaa'}\\">${d}</>`);
      if (!plugins.length) {
        send('"<b>No Installed Plugins</>"');
      } else {
        const lines = splitHelper(plugins);
        send(`"<b>Installed Plugins</>: ${lines[0]}"`);
        for(let i = 1; i < lines.length; i++)
          send(`"${lines[i]}"`);
      }

    // plugin or command argument
    } else if (args.length > 0) {
      const target = args.join(' ');
      // argument is a plugin; render description, author, and commands
      if (docs[target]) {
        const doc = docs[target];
        const desc = doc.description || 'no description';
        const color = doc._plugin.isLoaded() ? 'aaffaa' : 'aaaaaa';
        send(`"<b>Plugin</> <code><color=\\"${color}\\">${target}</></>: ${desc}"`);

        if (doc.author)
          send(`"<b>Author</>: <color=\\"c4d7f5\\"><b>${doc.author}</></>"`);

        if (doc.commands && doc.commands.length > 0) {
          const lines = splitHelper(doc.commands.map(c => `<code>${c.name}</>`));
          send(`"<b>Commands</>: ${lines[0]}"`);
          for(let i = 1; i < lines.length; i++)
            send(`"${lines[i]}"`);
        }

      // argument is a command
      } else if (commands[target]) {
        const doc = commands[target];
        const desc = doc.description || 'no description';
        const example = doc.example || 'no example';
        const color = doc._plugin.isLoaded() ? 'aaffaa' : 'aaaaaa';
        send(`"<b>Command</> <code><color=\\"${color}\\">${doc.name}</></>: ${desc}"`);
        send(`"<b>Example</>: <code>${example}</>"`);
        if (doc.args && doc.args.length > 0) {
          send('"<b>Arguments</>:"');
          for (const arg of doc.args) {
            const desc = arg.description || 'no description';
            send(`"- <code>${arg.name}</>${arg.required ? ' (required)' : ''}: ${desc}"`);
          }
        } else {
          send('"<b>Arguments</>: None"');
        }

        // user takes the helptext literally
      } else if (args[0] === '!command' || args[0] === '/command' || args[0] === 'plugin') {
        send('"Use <code>/plugins [name of plugin]</> or <code>/plugins [name of !command or /command]</> for more help for the respective plugin or command"');

      // argument is not found
      } else {
        send('"Could not find that command or plugin"');
      }

    // too many arguments
    } else {
      send('"Use <code>/plugins</> to list plugins and <code>/plugins plugin</> or <code>!help !command or /command</> for more information"');
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

      doc._plugin = plugin;

      // add the documentation into a dictionary
      this.documentation[name] = doc;

      // add all the commands into a dictionary
      if (doc.commands) {
        for (const cmd of doc.commands) {
          this.commands[cmd.name] = cmd;
          cmd._plugin = plugin;
        }
      }
    }
  }
}

module.exports = { Plugin, PluginLoader };