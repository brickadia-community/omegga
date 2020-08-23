const fs = require('fs');
const path = require('path');

const config = require('../softconfig.js');

// Check if this plugin is disabled
const DISABLED_FILE = 'disabled.omegga';

/*
  Plugin interface
    Allows omegga to interface with plugins of a format
*/
class Plugin {
  // returns true if a plugin at this path can be loaded
  // only one kind of plugin should match this type
  static canLoad(pluginPath) { return false; }

  // initialize a plugin at this path
  constructor(pluginPath, omegga) {
    this.path = pluginPath;
    this.omegga = omegga;
  }

  // check if the plugin is enabled
  isEnabled() { return !fs.existsSync(path.join(this.path, DISABLED_FILE)); }

  // get the plugin name, usually based on documentation data
  getName() { return this.getDocumentation().name; }

  // get the documentation object for this plugin
  getDocumentation() { return null; }

  // return true if this plugin is loaded
  isLoaded() { return false; }

  // start the plugin, returns true if plugin successfully loaded
  load() { return false; }

  // stop + kill the plugin, returns true if plugin successfully unloaded
  unload() { return false; }
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
        .filter(file => file.match(/plugin_[a-zA-Z]+\.js/))
        // require all the formats
        .map(file => require('./plugin/' + file))
    );
  }

  // unload and load all installed plugins
  reload() {
    for (const p of this.plugins) {
      // unload the plugin if it's loaded
      if (p.isLoaded())
        p.unload();

      // load the plugin if it successfully unloaded
      if (!p.isLoaded()) {
        // only load it if it is enabled
        if (p.isEnabled())
            p.load();
      } else {
        console.error('did not successfully unload plugin', p.path);
      }
    }
  }

  // stop all plugins from running
  unload() {
     for (const p of this.plugins) {
      // unload the plugin if it's loaded
      if (p.isLoaded()) p.unload();
    }
  }

  // find every loadable plugin
  scan() {
    // plugin directory doesn't exist
    if (!fs.existsSync(this.path)) {
      return;
    }

    // make sure there are no plugins running
    if (this.plugins.some(p => p.isLoaded()))
      throw 'cannot re-scan plugins while a plugin is loaded';

    // find all directories in the plugin path
    this.plugins = fs.readdirSync(this.path)
      .map(dir => path.join(process.cwd(), this.path, dir)) // convert from local paths
      // every plugin must be in a directory
      .filter(dir => fs.lstatSync(dir).isDirectory())
      // every plugin must be loadable through some format
      .map(dir => {
        // find a plugin format that can load in this plugin
        const PluginFormat = this.formats.find(f => f.canLoad(dir));

        // let users know if there's a missing plugin format
        if (!PluginFormat)
          console.error('Missing plugin format for', dir);

        // if there is a plugin format, create the plugin instance (but don't load yet)
        return PluginFormat && new PluginFormat(dir, this.omegga);
      })
      // remove plugins without formats
      .filter(p => p);
    }
}

module.exports = { Plugin, PluginLoader };