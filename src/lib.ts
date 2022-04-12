/*
  Library module, includes all available resources
*/

module.exports = {
  brickadia: {
    // BrickadiaServer - manages the server child process
    Server: require('./brickadia/server'),

    // config writer for brickadia
    config: require('./brickadia/config'),
  },

  // brickadia server wrapper, log parser, and plugin runner
  omegga: require('./omegga'),
  // the actual object can be required too
  Omegga: require('./omegga/server'),

  // utility functions
  util: require('./util'),

  // config
  config: require('./config'),
};
