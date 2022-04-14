import { OmeggaPlugin } from 'omegga';

type Config = { foo: string; }
type Storage = { bar: string; }

export default class Plugin extends OmeggaPlugin<Config, Storage> {
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
