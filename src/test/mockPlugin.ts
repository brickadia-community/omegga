import { IPluginDocumentation } from '@/plugin';
import { IPluginJSON } from '@omegga/plugin';
import { Plugin } from '@omegga/plugin/interface';
import Omegga from '@omegga/server';
import { EventEmitter } from 'node:stream';

export class MockPlugin extends Plugin {
  static canLoad(_pluginPath: string) {
    return true;
  }

  static getFormat() {
    return 'mock';
  }

  events: EventEmitter;
  loaded = false;

  constructor(
    pluginPath: string,
    omegga: Omegga,
    {
      docs = {},
      config = {},
    }: {
      docs?: Partial<IPluginDocumentation>;
      config?: Partial<IPluginJSON>;
    } = {},
  ) {
    super(pluginPath, omegga);
    this.documentation = {
      name: pluginPath,
      author: 'test',
      commands: [],
      config: {},
      description: 'A mock plugin for testing',
      ...docs,
    };
    this.pluginConfig = {
      omeggaVersion: '*',
      formatVersion: 1,
      ...config,
    };
  }

  emitPluginEvent(event: string, from: string, ...args: any[]) {
    this.events.emit('emitPlugin', event, from, ...args);
  }

  getDocumentation(): IPluginDocumentation {
    return this.documentation;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isCommand(cmd: string): boolean {
    return this.documentation.commands.find(c => c.name === cmd) !== undefined;
  }

  async load() {
    this.loaded = true;
    return true;
  }
  async unload() {
    this.loaded = false;
    return true;
  }
}
