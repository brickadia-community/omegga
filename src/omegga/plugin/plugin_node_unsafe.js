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

// TODO: pass lightweight omegga to plugin instead of entire omegga

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
    this.documentation = require(path.join(pluginPath, DOC_FILE));
    this.pluginFile = path.join(pluginPath, MAIN_FILE);
  }

  // documentation is based on doc.json file
  getDocumentation() { return this.documentation; }

  // loaded state is based on if the loadedPlugin object is created
  isLoaded() { return !!this.loadedPlugin; }

  // require the plugin into the system, run the init func
  load() {
    const stopPlugin = reason => {
      Omegga.error('error launching node plugin', this.path, ':', reason);
      try{disrequire(this.pluginFile);}catch(e){Omegga.error('error unloading node plugin (2)', this.path, e);}
      return false;
    };

    try {
      // require the plugin itself
      const Plugin = require(this.pluginFile);

      // node plugins must export a class with a constructor
      if (typeof Plugin.prototype !== 'object' || typeof Plugin.prototype.constructor !== 'function')
        return stopPlugin();

      // create the loaded plugin
      this.loadedPlugin = new Plugin(this.omegga);

      // start the loaded plugin
      if (typeof this.loadedPlugin.init === 'function')
        this.loadedPlugin.init();

      return true;
    } catch (e) {
      Omegga.error('error loading node plugin', this.path, e);
      return false;
    }
  }

  // disrequire the plugin into the system, run the stop func
  unload() {
    // can't unload the plugin if it hasn't been loaded
    if (typeof this.loadedPlugin === 'undefined')
      return false;

    try {
      // run the stop func on the plugin if applicable
      if (typeof this.loadedPlugin.stop === 'function')
        this.loadedPlugin.stop();

      // unload the plugin
      disrequire(this.pluginFile);
      this.loadedPlugin = undefined;
      return true;
    } catch (e) {
      Omegga.error('error unloading node plugin', this.path, e);
      return false;
    }
  }
}

module.exports = NodePlugin;