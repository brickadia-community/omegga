import { type IPluginCommand } from '@/plugin';
import { Plugin } from '@omegga/plugin/interface';
import Omegga from '@omegga/server';
import EventEmitter from 'events';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import Terminal from './terminal';

const stubOmegga = (plugins: Plugin[] = []) =>
  Object.assign(new EventEmitter(), {
    started: false,
    path: '/srv',
    pluginLoader: { plugins },
  }) as unknown as Omegga;

// a plugin that records the console commands it is sent instead of running
class FakePlugin extends Plugin {
  loaded = false;
  received: [string, string[]][] = [];

  constructor(omegga: Omegga, name: string, consoleCommands: IPluginCommand[]) {
    super('/srv/plugins/' + name, omegga);
    this.documentation = {
      name,
      description: '',
      author: '',
      config: {},
      commands: [],
      consoleCommands,
    };
  }

  getDocumentation() {
    return this.documentation;
  }
  isLoaded() {
    return this.loaded;
  }
  async load() {
    this.loaded = true;
    this.emitStatus();
    return true;
  }
  async unload() {
    this.loaded = false;
    this.emitStatus();
    return true;
  }
  async emitConsoleCommand(name: string, args: string[]) {
    this.received.push([name, args]);
  }
}

const command = (name: string, extra: Partial<IPluginCommand> = {}) => ({
  name,
  description: name + ' things',
  args: [],
  ...extra,
});

// a terminal over the given plugins, with its output captured as plain text
function setup(...plugins: [string, IPluginCommand[]][]) {
  const list: Plugin[] = [];
  const omegga = stubOmegga(list);
  const fakes = plugins.map(
    ([name, cmds]) => new FakePlugin(omegga, name, cmds),
  );
  list.push(...fakes);
  const terminal = new Terminal(omegga);
  terminal.rl.close();

  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(stripVTControlCharacters(args.map(String).join(' ')));
  };
  vi.spyOn(terminal, 'log').mockImplementation(capture);
  vi.spyOn(terminal, 'warn').mockImplementation(capture);
  vi.spyOn(terminal, 'error').mockImplementation(capture);
  return { terminal, plugins: fakes, lines };
}

describe('terminal', () => {
  it('does not throw when logging after readline closes', () => {
    const omegga = stubOmegga();
    const terminal = new Terminal(omegga);
    terminal.rl.close();

    expect(() => terminal.log('after close')).not.toThrow();
    expect(() => terminal.error('after close')).not.toThrow();
    // the 'error' handler prints through the terminal - a throw here rejects
    // omegga's uncaughtException handler and loops back into it forever
    expect(() => omegga.emit('error', new Error('boom'))).not.toThrow();
  });
});

describe('plugin console commands', () => {
  it('sends a command to the plugin that declared it only', async () => {
    const {
      terminal,
      plugins: [a, b],
    } = setup(['a', [command('foo')]], ['b', [command('/Bar')]]);
    await a.load();
    await b.load();

    await terminal.handleLine('/bar x y');
    await terminal.handleLine('/BAR');

    expect(b.received).toEqual([
      ['bar', ['x', 'y']],
      ['bar', []],
    ]);
    expect(a.received).toEqual([]);
  });

  it('keeps omegga commands and warns the plugin that declares one', async () => {
    const {
      terminal,
      plugins: [a],
      lines,
    } = setup(['a', [command('status'), command('mine')]]);
    await a.load();

    expect(lines).toEqual([
      expect.stringMatching(/a console command \/status is an omegga command/),
    ]);
    await terminal.handleLine('/status');
    expect(a.received).toEqual([]);
    expect([...terminal.pluginConsoleCommands().keys()]).toEqual(['mine']);
  });

  it('gives a shared command to the plugin loaded first', async () => {
    const {
      terminal,
      plugins: [late, early],
      lines,
    } = setup(['late', [command('dup')]], ['early', [command('dup')]]);
    await early.load();
    await late.load();

    expect(lines).toEqual([
      expect.stringMatching(
        /late console command \/dup is ignored while early/,
      ),
    ]);
    await terminal.handleLine('/dup');
    expect(early.received).toEqual([['dup', []]]);
    expect(late.received).toEqual([]);

    // a status event while still loaded does not warn again
    late.emitStatus();
    expect(lines).toHaveLength(1);

    // with the owner gone, the command falls to the other plugin
    await early.unload();
    await terminal.handleLine('/dup');
    expect(late.received).toEqual([['dup', []]]);
  });

  it('forgets the commands of an unloaded plugin', async () => {
    const {
      terminal,
      plugins: [a],
      lines,
    } = setup(['a', [command('foo')]]);
    await a.load();
    await a.unload();

    await terminal.handleLine('/foo');
    expect(a.received).toEqual([]);
    expect(lines).toEqual([
      expect.stringMatching(/unrecognized command \/foo/),
    ]);

    lines.length = 0;
    await terminal.handleLine('/help');
    expect(lines.join('\n')).not.toContain('Plugin commands');
  });

  it('lists plugin commands in /help', async () => {
    const {
      terminal,
      plugins: [a],
      lines,
    } = setup([
      'Moderation',
      [
        command('warn', {
          description: 'warn a player',
          example: '/warn cake spam',
          args: [
            { name: 'player', description: 'who to warn', required: true },
            { name: 'reason', description: 'why' },
          ],
        }),
      ],
    ]);
    await a.load();

    await terminal.handleLine('/help');
    const help = lines.join('\n');
    const section = help.slice(help.indexOf('-- Plugin commands'));
    expect(section).toMatch(/\/warn - warn a player \(Moderation\)/);
    expect(section).toContain('/warn <player> [reason]');
    expect(section).toMatch(/player - who to warn/);
    expect(section).toMatch(/reason - why/);
    expect(section).toContain('example: /warn cake spam');
  });
});
