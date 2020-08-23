module.exports = {
  // contains omegga server
  Server: require('./server.js'),

  // Plugin loader loader format
  Plugin: require('./server.js'),

  // acts as the interface between server logs and matchers
  OmeggaWrapper: require('./wrapper.js'),
};
