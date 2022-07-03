// The safe node plugin is run inside of a worker
// so if the plugin inevitably crashes, only the worker dies
// this also lets plugins get terminated easier by killing the worker
// rather than unloading and reloading code

import Logger from '@/logger';
Logger.VERBOSE = process.env.VERBOSE === 'true';
import OmeggaPlugin, {
  OmeggaLike,
  PluginConfig,
  PluginInterop,
  PluginStore,
} from '@/plugin';
import Player from '@omegga/player';
import type Omegga from '@omegga/server';
import { mkdir } from '@util/file';
import 'colors';
import EventEmitter from 'events';
import fs from 'fs';
import { cloneDeep } from 'lodash';
import path from 'path';
import { NodeVM } from 'vm2';
import webpack, { Stats } from 'webpack';
import { parentPort } from 'worker_threads';
import { ProxyOmegga } from './proxyOmegga';
import 'source-map-support/register';

const MAIN_FILE = 'omegga.plugin.js';
const MAIN_FILE_TS = 'omegga.plugin.ts';
const TS_BUILD_DIR = '.build';
const TS_BUILD_FILE = 'plugin.js';
let vm: NodeVM,
  PluginClass: {
    new (
      omegga: OmeggaLike,
      config: PluginConfig,
      store: PluginStore
    ): OmeggaPlugin;
  },
  pluginInstance: OmeggaPlugin;
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
  let plugin = (await emit('getPlugin', name)) as PluginInterop & {
    emitPlugin(event: string, ...args: any[]): Promise<any>;
  };
  if (plugin) {
    plugin.emitPlugin = async (ev: string, ...args: any[]) => {
      return await emit('emitPlugin', name, ev, cloneDeep(args));
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
      e?.stack ?? e.toString()
    );
  }
});

// create the node vm
async function createVm(
  pluginPath: string,
  { builtin = ['*'], external = true, isTypeScript = false } = {}
): Promise<[boolean, string]> {
  let pluginCode: string;

  if (isTypeScript) {
    const tsBuildPath = path.join(pluginPath, TS_BUILD_DIR);
    const sourceFileName = path.join(pluginPath, MAIN_FILE_TS);
    const outputPath = path.join(tsBuildPath, TS_BUILD_FILE);
    try {
      mkdir(tsBuildPath);
      mkdir(path.join(tsBuildPath, '.cache'));

      const stats = await new Promise<Stats>((resolve, reject) => {
        webpack(
          Object.freeze({
            target: 'node',
            context: __dirname,
            mode: fs.existsSync(path.resolve(pluginPath, '.development'))
              ? 'development'
              : 'production',
            entry: sourceFileName,
            devtool: 'source-map',
            output: {
              iife: false,
              library: {
                type: 'commonjs',
              },
              path: tsBuildPath,
              filename: TS_BUILD_FILE,
            },
            resolve: {
              extensions: ['.ts', '.js', '.json'],
              alias: {
                // src is the only hard coded path
                src: path.resolve(pluginPath, 'src'),
              },
            },
            cache: {
              type: 'filesystem' as 'filesystem',
              cacheLocation: path.join(tsBuildPath, '.cache'),
              allowCollectingMemory: false,
              idleTimeout: 0,
              idleTimeoutForInitialStore: 0,
              // cache age is one week. plugins probably do not need
              // to be rebuilt every day
              maxAge: 1000 * 60 * 60 * 24 * 7,
              profile: true,
            },
            module: {
              rules: [
                {
                  test: /\.[jt]s$/,
                  exclude: /(node_modules)/,
                  use: {
                    loader: 'swc-loader',
                    options: {
                      sourceMaps: true,
                      cwd: pluginPath,
                      isModule: true,
                      jsc: {
                        target: 'es2020',
                        parser: {
                          syntax: 'typescript',
                        },
                        transform: {},
                      },

                      module: {
                        type: 'commonjs',
                        strictMode: false,
                      },
                    },
                  },
                },
              ],
            },
          }),
          (err, stats) => (err ? reject(err) : resolve(stats))
        );
      });

      if (stats.hasErrors()) {
        for (const err of stats.toJson().errors) {
          Logger.errorp(err.moduleName, err.file);
          Logger.errorp(err.message);
        }
      }

      if (stats.hasWarnings()) {
        for (const warning of stats.toJson().warnings) {
          Logger.warnp(warning.moduleName, warning.file);
          Logger.warnp(warning.message);
        }
      }

      pluginCode = fs.readFileSync(outputPath).toString();
    } catch (err) {
      Logger.errorp(pluginName.brightRed, err);
      return [false, 'failed compiling building typescript'];
    }

    // update omegga.d.ts to latest on plugin compile
    try {
      const gitIgnore = path.join(pluginPath, '.gitignore');
      const omeggaTypesDst = path.join(pluginPath, 'omegga.d.ts');
      const omeggaTypesSrc = path.join(
        __dirname,
        '../../../../templates/safe-ts/omegga.d.ts'
      );

      // plugin has gitignore with "omegga.d.ts" in it and omegga has omegga.d.ts
      if (fs.existsSync(gitIgnore) && fs.existsSync(omeggaTypesSrc)) {
        // and the gitignore covers the omegga.d.ts
        const hasOmeggaTypesIgnored = fs
          .readFileSync(gitIgnore)
          .toString()
          .match(/(\.\/)?omegga\.d\.ts/);

        // compare last modified times to avoid unnecessary copies
        const srcLastModified = fs.statSync(omeggaTypesSrc).mtime.getTime();
        const dstLastModified = fs.existsSync(omeggaTypesDst)
          ? fs.statSync(omeggaTypesDst).mtime.getTime()
          : null;
        if (
          hasOmeggaTypesIgnored &&
          (!dstLastModified || srcLastModified > dstLastModified)
        ) {
          fs.copyFileSync(omeggaTypesSrc, omeggaTypesDst);
        }
      }
    } catch (err) {
      Logger.errorp(
        pluginName.brightRed,
        'error copying latest omegga.d.ts to typescript plugin',
        err
      );
    }
  }
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
  vm.freeze(Player, 'Player');

  const file = path.join(
    pluginPath,
    isTypeScript ? path.join(TS_BUILD_DIR, TS_BUILD_FILE) : MAIN_FILE
  );
  if (!isTypeScript) {
    try {
      pluginCode = fs.readFileSync(file).toString();
    } catch (e) {
      emit(
        'error',
        'failed to read plugin source: ' + e?.stack ?? e.toString()
      );
      throw 'failed to read plugin source: ' + e?.stack ?? e.toString();
    }
  }

  // proxy the plugin out of the vm
  // potential for performance improvement by using VM.script to precompile plugins
  try {
    const pluginOutput = vm.run(pluginCode, file);
    PluginClass = pluginOutput?.default ?? pluginOutput;
  } catch (e) {
    emit('error', 'plugin failed to init');
    Logger.errorp(pluginName.brightRed, e);
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
parent.on('load', async (resp, pluginPath, options) => {
  try {
    await createVm(pluginPath, options);

    emit(resp, true);
  } catch (err) {
    Logger.errorp(
      pluginName.brightRed,
      'error creating vm',
      err?.stack ?? err.toString()
    );
    emit(resp, false);
  }
});

// start the plugin with a faux omegga
// resp is an action sent back to the parent process
// to coordinate async funcs
parent.on('start', async (resp, config) => {
  try {
    pluginInstance = new PluginClass(omegga as any as Omegga, config, store);
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
