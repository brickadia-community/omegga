module.exports = {
  // contains omegga server
  Server: require('./server.js'),

  // Plugin loader format
  Plugin: require('./plugin.js'),

  // acts as the interface between server logs and matchers
  OmeggaWrapper: require('./wrapper.js'),

  // auth token generation helpers
  auth: require('./auth.js'),
};
