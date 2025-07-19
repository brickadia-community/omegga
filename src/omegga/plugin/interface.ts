import OmeggaPlugin, { IPluginDocumentation } from '@/plugin';
import { PLUGIN_PATH } from '@/softconfig';
import { IPluginJSON, PluginStorage } from '@omegga/plugin';
import Omegga from '@omegga/server';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';

// Check if this plugin is disabled
const DISABLED_FILE = 'disabled.omegga';

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
  static getFormat(): string {
    throw 'undefined plugin format';
  }

  // read a file as json or return null
  static readJSON(file: string) {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
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
  constructor(pluginPath: string, omegga?: Omegga) {
    this.path = pluginPath;
    this.omegga = omegga;
    if (omegga) {
      this.shortPath = pluginPath.replace(
        path.join(omegga.path, PLUGIN_PATH) + '/',
        '',
      );
    }
  }

  // assign plugin storage
  setStorage(storage: PluginStorage) {
    this.storage = storage;
  }

  // check if the plugin is enabled
  isEnabled() {
    return !existsSync(path.join(this.path, DISABLED_FILE));
  }
  // set the plugin enabled/disabled
  setEnabled(enabled: boolean) {
    const disabledPath = path.join(this.path, DISABLED_FILE);
    if (enabled === this.isEnabled()) {
      return;
    }
    if (enabled) {
      unlinkSync(disabledPath);
    } else {
      closeSync(openSync(disabledPath, 'w'));
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
  getInfo(): Record<string, unknown> {
    return {};
  }
}
