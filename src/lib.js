/*
  Library module, includes all available resources
*/
module.exports = {
  brickadia: {
    // BrickadiaServer - manages the server child process
    Server: require('./brickadia/server.js'),

    // config writer for brickadia
    config: require('./brickadia/config.js'),
  },

  // brickadia server wrapper, log parser, and plugin runner
  omegga: require('./omegga/index.js'),
  // the actual object can be required too
  Omegga: require('./omegga/server.js'),

  // utility functions
  util: require('./util/index.js'),

  // config
  config: require('./config/index.js'),
};
