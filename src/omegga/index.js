module.exports = {
  // contains omegga server
  Server: require('./server.js'),

  // Plugin loader format
  Plugin: require('./plugin.js'),

  // Player interface
  Player: require('./player.js'),

  // acts as the interface between server logs and matchers
  OmeggaWrapper: require('./wrapper.js'),

  // auth token generation helpers
  auth: require('./auth.js'),

  // tackles the problem of reading brickadia logs
  LogWrangler: require('./logWrangler.js'),

  // injects commands that only need a log wrangler to function
  commandInjector: require('./commandInjector.js'),
};
