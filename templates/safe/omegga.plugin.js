module.exports = class Plugin {
  constructor(omegga, config, store, metrics) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    this.metrics = metrics;
  }

  async init() {
    // Prometheus metrics, exported as omegga_plugin_<plugin>_greetings_total
    const greetings = this.metrics.counter({
      name: 'greetings_total',
      help: 'Number of greetings sent',
    });

    // Write your plugin!
    this.omegga.on('cmd:test', (speaker) => {
      greetings.inc();
      this.omegga.broadcast(`Hello, ${speaker}!`);
    });

    return { registeredCommands: ['test'] };
  }

  async stop() {
    // Anything that needs to be cleaned up...
  }
}
