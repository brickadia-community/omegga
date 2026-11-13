import { NOOP_PLUGIN_METRICS } from '@/metrics/plugin';
import {
  type IPluginCommand,
  type IPluginDocumentation,
  type PluginHttpRequest,
  type PluginHttpResponse,
  type PluginMetrics,
} from '@/plugin';
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

// shared by every loader so load order is comparable across plugin formats
let loadCounter = 0;

// the fields of a JSON object, or undefined for anything else
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  // any non-array object can be read by key; every field stays unknown and
  // is checked by the caller
  return value as Record<string, unknown>;
}

// Array.isArray narrows unknown to any[], which would let unchecked values
// through untyped
const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

/**
 * A console command as a plugin declared it, or undefined when it has no
 * usable name. doc.json and extraConsoleCommands() are plugin-authored and
 * unchecked, so everything but the name falls back to an empty value rather
 * than breaking /help. A leading `/` on the name is dropped.
 */
function toConsoleCommand(value: unknown): IPluginCommand | undefined {
  const command = asRecord(value);
  if (typeof command?.name !== 'string') return undefined;
  const name = command.name.trim().replace(/^\//, '');
  if (!name || /\s/.test(name)) return undefined;
  return {
    name,
    description:
      typeof command.description === 'string' ? command.description : '',
    example: typeof command.example === 'string' ? command.example : undefined,
    args: asList(command.args).flatMap(value => {
      const arg = asRecord(value);
      if (typeof arg?.name !== 'string') return [];
      return [
        {
          name: arg.name,
          description:
            typeof arg.description === 'string' ? arg.description : '',
          required: arg.required === true,
        },
      ];
    }),
  };
}

/** The usable entries of a plugin-authored list of console commands. */
export const toConsoleCommands = (value: unknown): IPluginCommand[] =>
  asList(value).flatMap(c => toConsoleCommand(c) ?? []);

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

  /** The kind of plugin this is: its loader's static `getFormat()`. */
  getFormat(): string {
    // TypeScript types `this.constructor` as Function; it is always the
    // loader subclass this plugin was constructed with
    return (this.constructor as typeof Plugin).getFormat();
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
  /**
   * Console commands the loaded plugin offers beyond its doc.json, from its
   * `extraConsoleCommands()`. Only loaders that support it fill this in.
   */
  extraConsoleCommands: IPluginCommand[] = [];
  /**
   * When this plugin was loaded relative to the others, undefined while
   * unloaded. The first loaded of two plugins with the same console command
   * keeps it.
   */
  loadOrder: number | undefined;

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
    // every loader emits status after each load and unload, which makes this
    // the one place load order can be recorded for all of them
    if (!this.isLoaded()) this.loadOrder = undefined;
    else if (this.loadOrder === undefined) this.loadOrder = ++loadCounter;
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
  ): Promise<unknown> {
    return undefined;
  }

  /**
   * Answer a request to the plugin's HTTP routes; undefined when the plugin
   * has no answer (or no routes), which the web server turns into a 404.
   */
  async http(
    _request: PluginHttpRequest,
  ): Promise<PluginHttpResponse | undefined> {
    return undefined;
  }

  /**
   * The console commands this plugin declares: doc.json's `consoleCommands`,
   * then any it added at load. Clashes with other plugins or omegga's own
   * commands are not resolved here; the terminal does that.
   */
  getConsoleCommands(): IPluginCommand[] {
    return [
      ...toConsoleCommands(this.getDocumentation()?.consoleCommands),
      ...this.extraConsoleCommands,
    ];
  }

  /**
   * Deliver a console command to this plugin alone, as the
   * `consolecmd:<name>` event. Does nothing for loaders without a way to
   * reach a single plugin.
   */
  async emitConsoleCommand(_name: string, _args: string[]): Promise<void> {}

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
