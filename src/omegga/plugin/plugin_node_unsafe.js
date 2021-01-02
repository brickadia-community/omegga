const fs = require('fs');
const path = require('path');
const disrequire = require('disrequire');

global.OMEGGA_UTIL = require('../../util/index.js');

const { Plugin } = require('../plugin.js');

// Main plugin file (like index.js)
// this isn't named 'index.js' or 'plugin.js' because those may be filenames
// used with other loaders (rpc loader) and are too generic
// omegga.main.js is rather unique and helps avoid collision
const MAIN_FILE = 'omegga.main.js';

// Documentation file (contains name, description, author, command helptext)
const DOC_FILE = 'doc.json';

class NodePlugin extends Plugin {
  // every node plugin requires the main file and a doc file
  // may evolve this so it checks the contents of the doc file later
  static canLoad(pluginPath) {
    return fs.existsSync(path.join(pluginPath, MAIN_FILE)) &&
      fs.existsSync(path.join(pluginPath, DOC_FILE));
  }

  // unsafe node plugins (can potentially crash omegga) are powerful
  static getFormat() { return 'node_unsafe'; }

  constructor(pluginPath, omegga) {
    super(pluginPath, omegga);
    // TODO: validate documentation
    this.documentation = Plugin.readJSON(path.join(pluginPath, DOC_FILE));
    this.pluginFile = path.join(pluginPath, MAIN_FILE);

    // list of registered comands
    this.commands = [];
  }

  // documentation is based on doc.json file
  getDocumentation() { return this.documentation; }

  // loaded state is based on if the loadedPlugin object is created
  isLoaded() { return !!this.loadedPlugin; }

  // determing if a command is registered
  isCommand(cmd) {
    return this.commands.includes(cmd);
  }

  // require the plugin into the system, run the init func
  async load() {
    const stopPlugin = reason => {
      Omegga.error('error launching node plugin', this.getName(), ':', reason);
      try{disrequire(this.pluginFile);}catch(e){Omegga.error('error unloading node plugin (2)', this.getName(), e);}
      this.emitStatus();
      return false;
    };
    this.commands = [];

    try {
      const config = await this.storage.getConfig();

      // require the plugin itself
      const Plugin = require(this.pluginFile);

      // node plugins must export a class with a constructor
      if (typeof Plugin.prototype !== 'object' || typeof Plugin.prototype.constructor !== 'function')
        return stopPlugin();

      // interface with plugin store
      const store = {
        get: key => this.storage.get(key),
        set: (key, value) => this.storage.set(key, value),
        delete: key => this.storage.delete(key),
        wipe: () => this.storage.wipe(),
        count: () => this.storage.count(),
        keys: () => this.storage.keys(),
      };

      // create the loaded plugin
      this.loadedPlugin = new Plugin(this.omegga, config, store);

      // start the loaded plugin
      if (typeof this.loadedPlugin.init === 'function') {
        const result = await this.loadedPlugin.init();

        // plugins can return a result object
        if (typeof result === 'object' && result) {

          // if registeredCommands is in the results, register the provided strings as commands
          const cmds = result.registeredCommands;
          if (cmds && (cmds instanceof Array) && cmds.every(i => typeof i === 'string'))
            this.commands = cmds;
        }
      }

      this.emitStatus();
      return true;
    } catch (e) {
      Omegga.error('error loading node plugin', this.getName(), e);
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
      disrequire(this.pluginFile);
      this.loadedPlugin = undefined;
      this.emitStatus();
      this.commands = [];
      return true;
    } catch (e) {
      Omegga.error('error unloading node plugin', this.getName(), e);
      this.emitStatus();
      return false;
    }
  }
}

module.exports = NodePlugin;