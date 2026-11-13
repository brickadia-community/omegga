import OmeggaPlugin, { OU, PC, PM, PS } from 'omegga';

type Config = { foo: string };
type Storage = { bar: string };

// Unsafe plugins run inside omegga's own process: omegga is the server object
// itself, and an uncaught error here can take omegga down.
export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OU;
  config: PC<Config>;
  store: PS<Storage>;
  metrics: PM;

  constructor(omegga: OU, config: PC<Config>, store: PS<Storage>, metrics: PM) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    this.metrics = metrics;
  }

  async init() {
    // Write your plugin!
    this.omegga.on('cmd:test', (speaker: string) => {
      this.omegga.broadcast(`Hello, ${speaker}!`);
    });

    return { registeredCommands: ['test'] };
  }

  async stop() {
    // Anything that needs to be cleaned up...
  }
}
