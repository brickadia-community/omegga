const { Plugin } = require('../plugin.js');

// TODO: json rpc over websocket
// TODO: check if version is compatible (v1 -> v2) from file
// TODO: run plugin as child process
// TODO: wrap omegga functions
// TODO: write jsonrpc wrappers in a few languages, implement a few simple plugins
// TODO: languages: [ python, javascript (lol), rust, go ]
// TODO: implement loader

class RpcPlugin extends Plugin {

  static canLoad(pluginPath) {
    return false;
  }

  // websocket rpc plugin type
  static getFormat() { return 'ws_rpc'; }

  constructor() { }
}

module.exports = RpcPlugin;