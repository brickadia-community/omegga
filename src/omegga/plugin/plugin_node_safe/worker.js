// The safe node plugin is run inside of a worker
// so if the plugin inevitably crashes, only the worker dies
// this also lets plugins get terminated easier by killing the worker
// rather than unloading and reloading code

const path = require('path');
const fs = require('fs');
const { parentPort } = require('worker_threads');
const { ProxyOmegga } = require('./proxyOmegga.js');
const { EventEmitter } = require('events');

const { NodeVM } = require('vm2');
require('colors');

const MAIN_FILE = 'omegga.plugin.js';
let vm, PluginClass, pluginInstance;
let pluginName = 'unnamed plugin';
let messageCounter = 0;

// emitter that receives messages from the parent
const parent = new EventEmitter();

// handle message passing
parentPort.on('message', ({action, args}) => parent.emit(action, ...args));

// emit a message to the parent port - async wait for a reponse
const emit = (action, ...args) => {
  const messageId = 'message:' + (messageCounter ++);

  let rejectFn;
  // promise waits for the message to resolve
  const promise = new Promise((resolve, reject) => {
    parent.once(messageId, resolve);
    rejectFn = reject;
  });

  try {
    // post the message
    parentPort.postMessage({action, args: [messageId, ...args]});
  } catch (err) {
    rejectFn(err);
  }

  // return the promise
  return promise;
};

// tell omegga to exec a command
const exec = cmd => emit('exec', cmd);

// create the proxy omegga
const omegga = new ProxyOmegga(exec);

// interface with plugin store
const store = {
  get: key => emit('store.get', key),
  set: (key, value) => emit('store.set', key, JSON.stringify(value)),
  delete: key => emit('store.delete', key),
  wipe: () => emit('store.wipe'),
  count: () => emit('store.count'),
  keys: () => emit('store.keys'),
};

// generic brickadia events are forwarded to the proxy omegga
parent.on('brickadiaEvent', (type, ...args) => {
  if (!vm) return;
  try {
    omegga.emit(type, ...args);
  } catch(e) {
    console.log('error in brickadia event', e);
  }
});

// create the node vm
function createVm(pluginPath, {builtin=['*'], external=true}={}) {
  if (vm !== undefined)
    return [false, 'vm is already created'];

  // create the vm
  vm = new NodeVM({
    console: 'redirect',
    sandbox: {},
    require: {
      external,
      builtin,
      root: pluginPath,
    }
  });

  // plugin log generator function
  const ezLog = (logFn, name, symbol) => (...args) => console[logFn](name.underline, symbol, ...args);

  // special formatting for stdout
  vm.on('console.log', ezLog('log', pluginName, '>>'.green));
  vm.on('console.error', ezLog('error', pluginName.brightRed, '!>'.red));
  vm.on('console.info', ezLog('info', pluginName, '#>'.blue));
  vm.on('console.warn', ezLog('warn', pluginName.brightYellow, ':>'.yellow));
  vm.on('console.trace', ezLog('trace', pluginName, 'T>'.grey));

  // pass in util functions
  vm.freeze(require('../../../util/index.js'), 'OMEGGA_UTIL');
  vm.freeze(omegga, 'Omegga');

  const file = path.join(pluginPath, MAIN_FILE);
  let pluginCode;

  try {
    pluginCode = fs.readFileSync(file);
  } catch (e) {
    emit('error', 'failed to read plugin source: ' + e.toString());
    throw 'failed to read plugin source: ' + e.toString();
  }

  // proxy the plugin out of the vm
  // potential for performance improvement by using VM.script to precompile plugins
  try {
    PluginClass = vm.run(pluginCode, file);
  } catch (e) {
    emit('error', 'plugin failed to init');
    console.log(e);
    throw 'plugin failed to init: ' + e.toString();
  }

  if (!PluginClass || typeof PluginClass !== 'function' || typeof PluginClass.prototype !== 'object') {
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
parent.on('kill', (resp) => {
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
parent.on('mem', (resp) => emit(resp, 'mem', process.memoryUsage()));

// create the vm
parent.on('load', (resp, pluginPath, options) => {
  try {
    createVm(pluginPath, options);
    emit(resp, true);
  } catch (err) {
    console.log('error creating vm', err);
    emit(resp, false);
  }
});

// start the plugin with a faux omegga
// resp is an action sent back to the parent process
// to coordinate async funcs
parent.on('start', async (resp, config) => {
  try {
    pluginInstance = new PluginClass(omegga, config, store);
    const result = await pluginInstance.init();
    // if a plugin init returns a list of strings, treat them as the list of commands
    if (typeof result === 'object' && result) {

      // if registeredCommands is in the results, register the provided strings as commands
      const cmds = result.registeredCommands;
      if (cmds && (cmds instanceof Array) && cmds.every(i => typeof i === 'string')) {
        emit('command.registers', JSON.stringify(cmds));
      }
    }
    emit(resp, true);
  } catch (err) {
    emit('error', 'error starting plugin', JSON.stringify(err));
    emit(resp, false);
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
    emit('error', 'error stopping plugin', err.toString());
    emit(resp, false);
  }
});

