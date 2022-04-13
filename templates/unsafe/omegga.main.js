module.exports = class Plugin {
  constructor(omegga, config, store) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  }

  async init() {
    // Write your plugin!
  }

  async stop() {
    // Anything that needs to be cleaned up...
  }
}
