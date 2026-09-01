import OmeggaPlugin, { OL, PS, PC, PM } from 'omegga';

type Config = { foo: string };
type Storage = { bar: string };

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  metrics: PM;

  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>, metrics: PM) {
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
    this.omegga.on('cmd:test', (speaker: string) => {
      greetings.inc();
      this.omegga.broadcast(`Hello, ${speaker}!`);
    });

    return { registeredCommands: ['test'] };
  }

  async stop() {
    // Anything that needs to be cleaned up...
  }
}
