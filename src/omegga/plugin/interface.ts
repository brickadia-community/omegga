import { NOOP_PLUGIN_METRICS } from '@/metrics/plugin';
import { type IPluginDocumentation, type PluginMetrics } from '@/plugin';
import { PLUGIN_PATH } from '@/softconfig';
import { type IPluginJSON, PluginStorage } from '@omegga/plugin';
import Omegga from '@omegga/server';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';

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
    } catch {
      return null;
    }
  }

  path: string;
  // undefined when constructed from the CLI (config commands), which scans
  // plugins without a running server
  omegga: Omegga | undefined;
  shortPath: string;
  // assigned via setStorage() by PluginLoader.scanPlugin immediately after
  // construction; every other access happens on scanned plugins
  storage!: PluginStorage;

  documentation: IPluginDocumentation | null = null;
  pluginConfig: IPluginJSON | null = null;
  commands: string[] = [];

  // initialize a plugin at this path
  constructor(pluginPath: string, omegga?: Omegga) {
    this.path = pluginPath;
    this.omegga = omegga;
    this.shortPath = omegga
      ? pluginPath.replace(path.join(omegga.path, PLUGIN_PATH) + '/', '')
      : pluginPath;
  }

  // the attached server - only safe to access from code paths that require a
  // loaded plugin (loading requires a server); throws a descriptive error
  // instead of crashing on undefined when misused from a serverless (CLI)
  // context
  get server(): Omegga {
    if (!this.omegga)
      throw new Error(
        `plugin ${this.path} was constructed without a server (CLI context)`,
      );
    return this.omegga;
  }

  // assign plugin storage
  setStorage(storage: PluginStorage) {
    this.storage = storage;
  }

  /**
   * Prometheus metrics scoped to this plugin, exported under
   * `omegga_plugin_<name>_`. Falls back to a no-op facade when the metrics
   * endpoint is off, so plugins never need to guard their metric calls.
   */
  get metrics(): PluginMetrics {
    const host = this.omegga?.metrics;
    if (!host || host.config.plugins === false) return NOOP_PLUGIN_METRICS;
    return host.plugins.facade(this.getName());
  }

  /** stop exporting this plugin's metrics (called when it unloads) */
  dropMetrics() {
    this.omegga?.metrics?.plugins.drop(this.getName());
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
    this.omegga?.emit('plugin:status', this.shortPath, {
      name: this.getName(),
      isLoaded: this.isLoaded(),
      isEnabled: this.isEnabled(),
    });
  }

  // emit a custom event from another plugin
  async emitPlugin(
    _ev: string,
    _from: string,
    _args: unknown[],
  ): Promise<any> {}

  // get the plugin name, usually based on documentation data
  getName() {
    const doc = this.getDocumentation();
    return (doc ? doc.name : path.basename(this.path)) || 'unnamed plugin';
  }

  // get the documentation object for this plugin
  getDocumentation(): IPluginDocumentation | null {
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
