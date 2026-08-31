module.exports = class Plugin {
  constructor(omegga, config, store, metrics) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    this.metrics = metrics;
  }

  async init() {
    // Write your plugin!
  }

  async stop() {
    // Anything that needs to be cleaned up...
  }
}
