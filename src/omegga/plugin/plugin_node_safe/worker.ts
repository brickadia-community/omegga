// The safe node plugin is run inside of a worker
// so if the plugin inevitably crashes, only the worker dies
// this also lets plugins get terminated easier by killing the worker
// rather than unloading and reloading code

import Logger from '@/logger';
import { NOOP_PLUGIN_METRICS, PluginMetricsFacade } from '@/metrics/plugin';
import { PLUGIN_LIMITS, Registry } from '@/metrics/registry';
import OmeggaPlugin, {
  OmeggaLike,
  PluginConfig,
  PluginInterop,
  PluginMetrics,
  PluginStore,
} from '@/plugin';
import Player from '@omegga/player';
import Omegga from '@omegga/server';
import OmeggaUtil from '@util';
import 'colors';
import { cloneDeep } from 'lodash';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { NodeVM } from 'vm2';
import { buildTypedPlugin, PLUGIN_BUILD_DIR } from '../build';
import { injectOmeggaPrototypes, ProxyOmegga } from './proxyOmegga';
Logger.VERBOSE = process.env.VERBOSE === 'true';

const MAIN_FILE = 'omegga.plugin.js';
const MAIN_FILE_TS = 'omegga.plugin.ts';
const TS_BUILD_FILE = 'plugin.js';
let vm: NodeVM | undefined,
  PluginClass:
    | {
        new (
          omegga: OmeggaLike,
          config: PluginConfig,
          store: PluginStore,
          metrics: PluginMetrics,
        ): OmeggaPlugin;
      }
    | undefined,
  pluginInstance: OmeggaPlugin | undefined;
let pluginName = 'unnamed plugin';
let messageCounter = 0;
// emitter that receives messages from the parent
const parent = new EventEmitter();

// this file only runs inside a worker thread, where parentPort is set
if (!parentPort) throw new Error('plugin worker must run in a worker thread');
const port = parentPort;

// stringify an unknown thrown value for logging
const errStr = (e: unknown): string =>
  e instanceof Error ? (e.stack ?? String(e)) : String(e);

// handle message passing
port.on('message', ({ action, args }) => parent.emit(action, ...args));

// emit a message to the parent port - async wait for a reponse
const emit = (action: string, ...args: unknown[]) => {
  const messageId = 'message:' + messageCounter++;

  // promise waits for the message to resolve
  return new Promise((resolve, reject) => {
    parent.once(messageId, resolve);

    try {
      // post the message
      port.postMessage({ action, args: [messageId, ...args] });
    } catch (err) {
      reject(err);
    }
  });
};

// tell omegga to exec a command
const exec = (cmd: string) => emit('exec', cmd);

// create the proxy omegga
injectOmeggaPrototypes(ProxyOmegga, Omegga);
const omegga = new ProxyOmegga(exec);

// add plugin fetcher
omegga.getPlugin = async name => {
  const plugin = (await emit('getPlugin', name)) as PluginInterop & {
    emitPlugin(event: string, ...args: unknown[]): Promise<unknown>;
  };
  if (plugin) {
    plugin.emitPlugin = async (ev: string, ...args: unknown[]) => {
      return await emit('emitPlugin', name, ev, cloneDeep(args));
    };
    return plugin;
  } else {
    return null;
  }
};

/*
  Plugin metrics live in this worker, not in the host: writes are local and
  cheap, and the host only ever receives a periodic snapshot. That keeps the
  scrape path free of any dependency on this worker being responsive - a stuck
  plugin's metrics go stale rather than stalling prometheus.
*/
const metricsRegistry = new Registry(PLUGIN_LIMITS);
let metrics: PluginMetrics = NOOP_PLUGIN_METRICS;
let metricsFlush: ReturnType<typeof setInterval> | undefined;
let lastSnapshot = '';

const flushMetrics = () => {
  try {
    const snapshot = metricsRegistry.snapshot();
    // gauges with collect callbacks change on their own, so compare the
    // rendered snapshot rather than tracking writes
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSnapshot) return;
    lastSnapshot = serialized;
    emit('metrics.snapshot', snapshot).catch(() => {});
  } catch (err) {
    Logger.errorp(
      pluginName.brightRed,
      'error collecting metrics',
      errStr(err),
    );
  }
};

// interface with plugin store
const store: PluginStore = {
  get: <T>(key: string) => emit('store.get', key) as Promise<T>,
  set: <T>(key: string, value: T) =>
    emit('store.set', key, JSON.stringify(value)) as Promise<void>,
  delete: (key: string) => emit('store.delete', key) as Promise<void>,
  wipe: () => emit('store.wipe') as Promise<void>,
  count: () => emit('store.count') as Promise<number>,
  keys: () => emit('store.keys') as Promise<string[]>,
};

// generic brickadia events are forwarded to the proxy omegga
parent.on('brickadiaEvent', (type, ...args) => {
  if (!vm) return;
  if (type === 'error') {
    Logger.errorp(pluginName.brightRed, 'Received error', ...args);
    return;
  }
  try {
    omegga.emit(type, ...args);
  } catch (e) {
    Logger.errorp(
      pluginName.brightRed,
      `Error in safe plugin worker's brickadiaEvent (${type}):`,
      errStr(e),
    );
  }
});

// create the node vm
async function createVm(
  pluginPath: string,
  { builtin = ['*'], external = true, isTypeScript = false } = {},
): Promise<[boolean, string] | undefined> {
  let pluginCode: string | undefined;

  if (isTypeScript) {
    const output = await buildTypedPlugin(
      pluginName,
      pluginPath,
      MAIN_FILE_TS,
      TS_BUILD_FILE,
      { allowErrors: true },
    );
    if (output === undefined)
      return [false, 'failed compiling building typescript'];
    try {
      pluginCode = fs.readFileSync(output).toString();
    } catch (err) {
      Logger.errorp(pluginName.brightRed, err);
      return [false, 'failed compiling building typescript'];
    }
  }
  if (vm !== undefined) return [false, 'vm is already created'];
  const sandbox: Record<string, unknown> = {};
  for (const name of [
    'fetch',
    'Headers',
    'Request',
    'Response',
    'FormData',
    'Blob',
    'File',
    'AbortController',
    'AbortSignal',
    'URL',
    'URLSearchParams',
    'TextEncoder',
    'TextDecoder',
    'crypto',
    'structuredClone',
    'queueMicrotask',
    'btoa',
    'atob',
  ]) {
    const value = (globalThis as Record<string, unknown>)[name];
    if (value !== undefined) sandbox[name] = value;
  }

  // create the vm
  vm = new NodeVM({
    console: 'redirect',
    sandbox,
    require: {
      external,
      builtin,
      root: pluginPath,
    },
  });

  // plugin log generator function
  const ezLog =
    (
      logFn: 'log' | 'error' | 'info' | 'debug' | 'warn' | 'trace',
      name: string,
      symbol: string,
    ) =>
    (...args: unknown[]) =>
      console[logFn](name.underline, symbol, ...args);

  // special formatting for stdout
  vm.on('console.log', ezLog('log', pluginName, '>>'.green));
  vm.on('console.error', ezLog('error', pluginName.brightRed, '!>'.red));
  vm.on('console.info', ezLog('info', pluginName, '#>'.blue));
  vm.on('console.debug', ezLog('debug', pluginName, '?>'.blue));
  vm.on('console.warn', ezLog('warn', pluginName.brightYellow, ':>'.yellow));
  vm.on('console.trace', ezLog('trace', pluginName, 'T>'.grey));

  global.OMEGGA_UTIL = OmeggaUtil;
  // pass in util functions
  vm.freeze(global.OMEGGA_UTIL, 'OMEGGA_UTIL');
  vm.freeze(omegga, 'Omegga');
  vm.freeze(Player, 'Player');

  const file = path.join(
    pluginPath,
    isTypeScript ? path.join(PLUGIN_BUILD_DIR, TS_BUILD_FILE) : MAIN_FILE,
  );
  if (!isTypeScript) {
    try {
      pluginCode = fs.readFileSync(file).toString();
    } catch (e) {
      emit('error', 'failed to read plugin source: ' + errStr(e));
      throw 'failed to read plugin source: ' + errStr(e);
    }
  }

  if (pluginCode === undefined) {
    emit('error', 'plugin source was not loaded');
    throw 'plugin source was not loaded';
  }

  // proxy the plugin out of the vm
  // potential for performance improvement by using VM.script to precompile plugins
  try {
    const pluginOutput = vm.run(pluginCode, file);
    PluginClass = pluginOutput?.default ?? pluginOutput;
  } catch (e) {
    emit('error', 'plugin failed to init');
    Logger.errorp(pluginName.brightRed, e);
    throw 'plugin failed to init: ' + errStr(e);
  }

  if (
    !PluginClass ||
    typeof PluginClass !== 'function' ||
    typeof PluginClass.prototype !== 'object'
  ) {
    PluginClass = undefined;
    emit('error', 'plugin does not export a class');
    throw 'plugin does not export a class';
  }

  if (typeof PluginClass.prototype.init !== 'function') {
    PluginClass = undefined;
    emit('error', 'plugin is missing init() function');
    throw 'plugin is missing init() function';
  }

  if (typeof PluginClass.prototype.stop !== 'function') {
    PluginClass = undefined;
    emit('error', 'plugin is missing stop() function');
    throw 'plugin is missing stop() function';
  }
}

// kill this plugin
parent.on('kill', resp => {
  emit(resp);
  process.exit(0);
});

// set plugin name
parent.on('name', (resp, name) => {
  pluginName = name;
  // temp save prefix changes to avoid collision
  omegga._tempSavePrefix = 'omegga_' + name + '_temp';
  emit(resp);
});

// enable metrics. The host sends this only when the endpoint is on, so
// plugins on a server without metrics keep the no-op facade and cost nothing
parent.on('metrics.enable', (resp, flushInterval: number) => {
  metrics = new PluginMetricsFacade(metricsRegistry, pluginName, message =>
    Logger.warnp(pluginName.brightYellow, message),
  );
  clearInterval(metricsFlush);
  metricsFlush = setInterval(flushMetrics, flushInterval);
  // the worker must never be held open by a metrics timer
  metricsFlush.unref();
  emit(resp);
});

// get memory usage for this plugin
parent.on('mem', resp => emit(resp, 'mem', process.memoryUsage()));

// create the vm
parent.on('load', async (resp, pluginPath, options) => {
  try {
    await createVm(pluginPath, options);

    emit(resp, true);
  } catch (err) {
    Logger.errorp(pluginName.brightRed, 'error creating vm', errStr(err));
    emit(resp, false);
  }
});

// start the plugin with a faux omegga
// resp is an action sent back to the parent process
// to coordinate async funcs
parent.on('start', async (resp, config) => {
  try {
    if (!PluginClass) throw new Error('plugin is not loaded');
    pluginInstance = new PluginClass(omegga, config, store, metrics);
    const result = await pluginInstance.init();
    // if a plugin init returns a list of strings, treat them as the list of commands
    if (typeof result === 'object' && result) {
      // if registeredCommands is in the results, register the provided strings as commands
      const cmds = result.registeredCommands;
      if (
        cmds &&
        cmds instanceof Array &&
        cmds.every(i => typeof i === 'string')
      ) {
        emit('command.registers', JSON.stringify(cmds));
      }
    }
    emit(resp, true);
  } catch (err) {
    emit(
      'error',
      'error starting plugin',
      err instanceof Error ? (err.stack ?? String(err)) : JSON.stringify(err),
    );
    emit(resp, false);
    Logger.errorp(pluginName.brightRed, 'Error starting plugin', err);
  }
});

// stop the plugin
parent.on('stop', async resp => {
  try {
    if (pluginInstance) {
      await pluginInstance.stop.bind(pluginInstance)();
    }
    pluginInstance = undefined;
    clearInterval(metricsFlush);
    metricsFlush = undefined;
    metricsRegistry.clear();
    lastSnapshot = '';
    emit(resp, true);
  } catch (err) {
    emit('error', 'error stopping plugin', errStr(err));
    emit(resp, false);
  }
});

// HTTP requests to the plugin's routes; null tells the host there's no answer
parent.on('http', async (resp, request) => {
  if (typeof pluginInstance?.http !== 'function') return emit(resp, null);
  try {
    emit(resp, (await pluginInstance.http(request)) ?? null);
  } catch (err) {
    emit('error', 'error in http handler', errStr(err));
    emit(resp, { status: 500, body: 'plugin error' });
  }
});

// handle emitPlugins
parent.on('emitPlugin', async (resp, ev, from, args) => {
  if (pluginInstance?.pluginEvent) {
    emit(resp, await pluginInstance.pluginEvent(ev, from, ...args));
  } else {
    emit(resp, null);
  }
});
