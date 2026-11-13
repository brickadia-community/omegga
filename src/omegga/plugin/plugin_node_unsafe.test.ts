import { runPluginMigrations } from '@/db/migrate';
import { mockOmegga } from '@/test/util';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginStorage } from '../plugin';
import NodePlugin from './plugin_node_unsafe';

// disrequire also unlinks the module from every parent's child list, walking
// up from its own module to the root, and under vitest that tree holds module
// records without a child list, so it throws. A reload only needs the cache
// entry gone.
vi.mock('disrequire', async () => {
  const { createRequire } = await import('node:module');
  const cache = createRequire(__filename).cache;
  return {
    default: (file: string) => {
      delete cache[file];
    },
  };
});

const omegga = mockOmegga();
let dirs: string[] = [];

function pluginDir(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omegga-unsafe-ts-'));
  dirs.push(dir);
  writeFiles(dir, {
    'doc.json': JSON.stringify({ name: 'typed', config: {}, commands: [] }),
    ...files,
  });
  return dir;
}

function writeFiles(dir: string, files: Record<string, string>) {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
}

function loader(dir: string) {
  const plugin = new NodePlugin(dir, omegga);
  const db = drizzle(new BetterSqlite3(':memory:'));
  runPluginMigrations(db);
  plugin.setStorage(new PluginStorage(db, plugin));
  return plugin;
}

// a plugin whose one command name comes from its own modules, through both a
// relative import and the `src` alias
const entry = `
import { prefix } from './src/prefix';
import { name } from 'src/name';

enum Kind { Greeting = 'greeting' }

export default class Plugin {
  constructor(private readonly omegga: unknown) {}
  async init() {
    return { registeredCommands: [prefix + name + Kind.Greeting] };
  }
}
`;

afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

describe('unsafe TypeScript plugins', () => {
  it('builds omegga.main.ts, loads it, and picks up changes on reload', async () => {
    const dir = pluginDir({
      'omegga.main.ts': entry,
      'src/prefix.ts': `export const prefix: string = 'a-';`,
      'src/name.ts': `export const name = 'b-';`,
    });
    expect(NodePlugin.canLoad(dir)).toBe(true);
    const plugin = loader(dir);

    expect(await plugin.load()).toBe(true);
    expect(plugin.commands).toEqual(['a-b-greeting']);
    expect(fs.existsSync(path.join(dir, '.build/omegga.main.js'))).toBe(true);

    expect(await plugin.unload()).toBe(true);
    writeFiles(dir, { 'src/name.ts': `export const name = 'c-';` });
    expect(await plugin.load()).toBe(true);
    expect(plugin.commands).toEqual(['a-c-greeting']);
    await plugin.unload();
  }, 60_000);

  it('picks up changes on reload when the plugin folder is a symlink', async () => {
    const real = pluginDir({
      'omegga.main.ts': entry,
      'src/prefix.ts': `export const prefix = 'a-';`,
      'src/name.ts': `export const name = 'b-';`,
    });
    // a checkout linked into plugins/: node caches it under the real path
    const link = `${real}-link`;
    fs.symlinkSync(real, link);
    dirs.push(link);
    const plugin = loader(link);
    expect(await plugin.load()).toBe(true);
    expect(plugin.commands).toEqual(['a-b-greeting']);
    expect(await plugin.unload()).toBe(true);
    writeFiles(real, { 'src/name.ts': `export const name = 'c-';` });
    expect(await plugin.load()).toBe(true);
    expect(plugin.commands).toEqual(['a-c-greeting']);
    await plugin.unload();
  }, 60_000);

  it('prefers omegga.main.ts over a prebuilt omegga.main.js', async () => {
    const dir = pluginDir({
      'omegga.main.ts': entry,
      'src/prefix.ts': `export const prefix = 'ts-';`,
      'src/name.ts': `export const name = '';`,
      'omegga.main.js': `module.exports = class {
        async init() { return { registeredCommands: ['js'] }; }
      };`,
    });
    const plugin = loader(dir);
    expect(await plugin.load()).toBe(true);
    expect(plugin.commands).toEqual(['ts-greeting']);
    await plugin.unload();
  }, 60_000);

  it('does not start a plugin whose build fails', async () => {
    const dir = pluginDir({
      'omegga.main.ts': `import { missing } from './src/missing';
        export default class { async init() { missing(); } }`,
    });
    const plugin = loader(dir);
    expect(await plugin.load()).toBe(false);
    expect(plugin.isLoaded()).toBe(false);
  }, 60_000);
});

describe('unsafe plugin console commands', () => {
  it('adds extraConsoleCommands and delivers only to omegga listeners', async () => {
    const dir = pluginDir({
      'doc.json': JSON.stringify({
        name: 'consoled',
        config: {},
        commands: [],
        consoleCommands: [{ name: 'fromdoc', description: 'doc', args: [] }],
      }),
      'omegga.main.js': `module.exports = class {
        constructor(omegga) { this.omegga = omegga; }
        async init() {
          this.omegga.on('consolecmd:extra', (...args) => (this.got = args));
        }
        async stop() {}
        extraConsoleCommands() {
          return [{ name: '/extra', description: 'added' }, { bogus: 1 }];
        }
      };`,
    });
    const plugin = loader(dir);
    expect(await plugin.load()).toBe(true);
    expect(plugin.getConsoleCommands().map(c => c.name)).toEqual([
      'fromdoc',
      'extra',
    ]);

    const relayed = vi.fn();
    omegga.on('*', relayed);
    await plugin.emitConsoleCommand('extra', ['a', 'b']);
    omegga.off('*', relayed);
    expect(plugin.loadedPlugin).toHaveProperty('got', ['a', 'b']);
    // safe and JSON-RPC plugins hear omegga's events through `*`
    expect(relayed).not.toHaveBeenCalled();

    await plugin.unload();
    expect(plugin.getConsoleCommands().map(c => c.name)).toEqual(['fromdoc']);
  });
});
