const fs = require('fs');
const path = require('path');
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

  // get the plugin name, usually based on documentation data
  getName() {
    const doc = this.getDocumentation();
    return doc ? doc.name : path.basename(this.path);
  }

  // get the documentation object for this plugin
  getDocumentation() { return null; }

  // return true if this plugin is loaded
  isLoaded() { return false; }

  // start the plugin, returns true if plugin successfully loaded
  async load() { return false; }

  // stop + kill the plugin, returns true if plugin successfully unloaded
  async unload() { return false; }

  // extra info for this kind of plugin
  getInfo() { return {}; }
}

/*
  Plugin Loader and Scanner
    Allows omegga to scan in plugins and load them
*/
class PluginLoader {
  constructor(pluginsPath, omegga) {
    this.path = pluginsPath;
    this.omegga = omegga;
    this.formats = [];
    this.plugins = [];

    omegga.on('chatcmd:help', this.showHelp.bind(this));
  }

  // let the plugin loader scan another kind of plugin in
  addFormat(format) {
    if (!(format instanceof Plugin))
      throw 'provided plugin format is not a plugin';

    this.formats.push(format);
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
    for (const p of this.plugins) {
      try {
        // unload the plugin if it's loaded
        if (p.isLoaded())
          await p.unload();

        // load the plugin if it successfully unloaded
        if (!p.isLoaded()) {
          // only load it if it is enabled
          if (p.isEnabled())
            await p.load();
        } else {
          Omegga.error('!>'.red, 'Did not successfully unload plugin', p.getName().brightRed.underline);
          ok = false;
        }
      } catch (err) {
        Omegga.error('!>'.red, 'Error reloading plugin', p.getName().brightRed.underline);
        ok = false;
      }
    }
    return ok;
  }

  // stop all plugins from running
  async unload() {
    let ok = true;
    // potentually use Promise.all
    for (const p of this.plugins) {
      try {
        // unload the plugin if it's loaded
        if (p.isLoaded() && !(await p.unload())) {
          Omegga.error('!>'.red, 'Could not unloading plugin', p.getName().brightRed.underline);
          ok = false;
        }
      } catch (e) {
        Omegga.error('!>'.red, 'Error unloading plugin', p.getName().brightRed.underline);
        ok = false;
      }
    }
    return ok;
  }

  // find every loadable plugin
  scan() {
    // plugin directory doesn't exist
    if (!fs.existsSync(this.path)) {
      return false;
    }

    // make sure there are no plugins running
    if (this.plugins.some(p => p.isLoaded())) {
      Omegga.error('!>'.red, 'Cannot re-scan plugins while a plugin is loaded');
      return false;
    }

    // find all directories in the plugin path
    this.plugins = fs.readdirSync(this.path)
      .map(dir => path.join(this.path, dir)) // convert from local paths
      // every plugin must be in a directory
      .filter(dir => fs.existsSync(dir) && fs.lstatSync(dir).isDirectory())
      // every plugin must be loadable through some format
      .map(dir => {
        // find a plugin format that can load in this plugin
        const PluginFormat = this.formats.find(f => f.canLoad(dir));

        // let users know if there's a missing plugin format
        if (!PluginFormat)
          Omegga.error('!>'.red, 'Missing plugin format for', dir);
        try {
          // if there is a plugin format, create the plugin instance (but don't load yet)
          return PluginFormat && new PluginFormat(dir, this.omegga);
        } catch (e) {
          // if a plugin format fails to load, prevent omegga from dying
          Omegga.error('!>'.red, 'Error loading plugin', e.getName().brightRed.underline, PluginFormat, e);
        }

      })
      // remove plugins without formats
      .filter(p => p);

    this.buildDocumentation();

    return true;
  }

  // show helptext
  showHelp(player, ...args) {
    // send the message to the player
    const send = msg => this.omegga.version === 'a4' ? this.omegga.broadcast(msg) : this.omegga.whisper(player, msg);

    // available commands and documentation from the plugin system
    const commands = this.commands;
    const docs = this.documentation;

    // no arguments
    if (!args.length) {
      send('"Use <code>!help plugin</> or <code>!help !command</> for more information"');
      send(`"<b>Installed Plugins</b>: ${
        Object.keys(docs).map(d => `<color=\\"${docs[d]._plugin.isLoaded() ? 'aaffaa' : 'aaaaaa'}\\">${d}</>`).join(', ')
      }"`);

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

        if (doc.commands && doc.commands.length > 0)
          send(`"<b>Commands</>: ${doc.commands.map(c => `<code>${c.name}</>`).join(', ')}"`);

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
      } else if (args[0] === '!command' || args[0] === 'plugin') {
        send('"Use <code>!help [name of plugin]</> or <code>!help [name of !command]</> for more help for the respective plugin or command"');

      // argument is not found
      } else {
        send('"Could not find that command or plugin"');
      }

    // too many arguments
    } else {
      send('"Use <code>!help</> to list plugins and <code>!help plugin</> or <code>!help !command</> for more information"');
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