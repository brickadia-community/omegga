// The safe node plugin is run inside of a worker
// so if the plugin inevitably crashes, only the worker dies
// this also lets plugins get terminated easier by killing the worker
// rather than unloading and reloading code

import type { Plugin } from '@omegga/plugin';
import type Omegga from '@omegga/server';
import type { PluginStore } from '@omegga/types';
import { OmeggaPlugin } from '@omegga/types';
import 'colors';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { NodeVM } from 'vm2';
import { parentPort } from 'worker_threads';
import { ProxyOmegga } from './proxyOmegga';

const MAIN_FILE = 'omegga.plugin.js';
let vm: NodeVM, PluginClass: typeof OmeggaPlugin, pluginInstance: OmeggaPlugin;
let pluginName = 'unnamed plugin';
let messageCounter = 0;
// emitter that receives messages from the parent
const parent = new EventEmitter();

// handle message passing
parentPort.on('message', ({ action, args }) => parent.emit(action, ...args));

// emit a message to the parent port - async wait for a reponse
const emit = (action: string, ...args: any[]) => {
  const messageId = 'message:' + messageCounter++;

  let rejectFn: (reason?: any) => void;
  // promise waits for the message to resolve
  const promise = new Promise((resolve, reject) => {
    parent.once(messageId, resolve);
    rejectFn = reject;
  });

  try {
    // post the message
    parentPort.postMessage({ action, args: [messageId, ...args] });
  } catch (err) {
    rejectFn(err);
  }

  // return the promise
  return promise;
};

// tell omegga to exec a command
const exec = (cmd: string) => emit('exec', cmd);

// create the proxy omegga
const omegga = new ProxyOmegga(exec);

// add plugin fetcher
omegga.getPlugin = async name => {
  let plugin = (await emit('getPlugin', name)) as Plugin & {
    emit(event: string, ...args: any[]): Promise<unknown>;
  };
  if (plugin) {
    plugin.emit = async (ev: string, ...args: unknown[]) => {
      return await emit('emitPlugin', name, ev, args);
    };
    return plugin;
  } else {
    return null;
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
  try {
    omegga.emit(type, ...args);
  } catch (e) {
    console.log('error in brickadia event', e?.stack ?? e.toString());
  }
});

// create the node vm
function createVm(
  pluginPath: string,
  { builtin = ['*'], external = true } = {}
) {
  if (vm !== undefined) return [false, 'vm is already created'];

  // create the vm
  vm = new NodeVM({
    console: 'redirect',
    sandbox: {},
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
      symbol: string
    ) =>
    (...args: any[]) =>
      console[logFn](name.underline, symbol, ...args);

  // special formatting for stdout
  vm.on('console.log', ezLog('log', pluginName, '>>'.green));
  vm.on('console.error', ezLog('error', pluginName.brightRed, '!>'.red));
  vm.on('console.info', ezLog('info', pluginName, '#>'.blue));
  vm.on('console.debug', ezLog('debug', pluginName, '?>'.blue));
  vm.on('console.warn', ezLog('warn', pluginName.brightYellow, ':>'.yellow));
  vm.on('console.trace', ezLog('trace', pluginName, 'T>'.grey));

  global.OMEGGA_UTIL = require('../../../util/index.js');
  // pass in util functions
  vm.freeze(global.OMEGGA_UTIL, 'OMEGGA_UTIL');
  vm.freeze(omegga, 'Omegga');

  const file = path.join(pluginPath, MAIN_FILE);
  let pluginCode;

  try {
    pluginCode = fs.readFileSync(file);
  } catch (e) {
    emit('error', 'failed to read plugin source: ' + e?.stack ?? e.toString());
    throw 'failed to read plugin source: ' + e?.stack ?? e.toString();
  }

  // proxy the plugin out of the vm
  // potential for performance improvement by using VM.script to precompile plugins
  try {
    PluginClass = vm.run(pluginCode.toString(), file);
  } catch (e) {
    emit('error', 'plugin failed to init');
    console.log(e);
    throw 'plugin failed to init: ' + e?.stack ?? e.toString();
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

// get memory usage for this plugin
parent.on('mem', resp => emit(resp, 'mem', process.memoryUsage()));

// create the vm
parent.on('load', (resp, pluginPath, options) => {
  try {
    createVm(pluginPath, options);
    emit(resp, true);
  } catch (err) {
    console.error('error creating vm', err?.stack ?? err.toString());
    emit(resp, false);
  }
});

// start the plugin with a faux omegga
// resp is an action sent back to the parent process
// to coordinate async funcs
parent.on('start', async (resp, config) => {
  try {
    pluginInstance = new PluginClass(
      omegga as unknown as Omegga,
      config,
      store
    );
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
    emit('error', 'error starting plugin', err?.stack ?? JSON.stringify(err));
    emit(resp, false);
    console.error(err);
  }
});

// stop the plugin
parent.on('stop', async resp => {
  try {
    if (pluginInstance) {
      await pluginInstance.stop();
    }
    pluginInstance = undefined;
    emit(resp, true);
  } catch (err) {
    emit('error', 'error stopping plugin', err?.stack ?? err.toString());
    emit(resp, false);
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
