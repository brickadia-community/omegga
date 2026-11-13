# Node Plugins

Node plugins are effectively `require`'d into omegga. They have the potential to crash the entire service through uncaught exceptions and also can be insecure. Develop and run these at your own risk - your server stability may suffer.

These plugins receive a direct reference to the `omegga` that wraps the brickadia server. As a result, they can directly modify how omegga runs.

Cleanup is important as code can still be running after the plugin is unloaded resulting in strange and undefined behavior. Make sure to run `clearInterval` and `clearTimeout`

Register custom `/commands` by returning `{registeredCommands: ['foo', 'bar']}` (registers command `/foo` and `/bar`) in the `async init()` method.

By defining an `async pluginEvent(event, from, ...args)` method in your plugin class, you can respond to events from other plugins, where `from` is the name of the other plugin, `event` is the name of the custom event, and `args` is an array of any passed arguments.

## Globals

- `OMEGGA_UTIL` - access to the `src/util/index.js` module

## Folder Structure

In a `plugins` directory create the following folder structure:

- `plugins/myPlugin` - plugin folder (required)
- `plugins/myPlugin/doc.json`
- `plugins/myPlugin/omegga.main.js` - js plugin main file (required, unless `omegga.main.ts` is there)
- `plugins/myPlugin/omegga.main.ts` - TypeScript plugin main file, see [TypeScript](#typescript)

## `omegga.main.js` (example)

```javascript
class PluginName {
  // config and store variables are optional but provide access to the plugin data store
  constructor(omegga, config, store) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  }

  async init() {
    this.omegga
      .on('chatcmd:ping', (name, ...args) => {
        this.omegga.broadcast(`pong @ ${name} + ${args.length} args`);
      })
      .on('chatcmd:pos', async name => {
        const [x, y, z] = await this.omegga.getPlayer(name).getPosition();
        this.omegga.broadcast(`<b>${name}</> is at ${x} ${y} ${z}`);
      });
  }

  async stop() {
    this.omegga
      .removeAllListeners('chatcmd:ping')
      .removeAllListeners('chatcmd:pos');
  }

  // optional: respond to events from other plugins
  async pluginEvent(event, from, ...args) {
    if (event === 'greeting') {
      return `Hello from ${from}!`;
    }
  }
}

module.exports = PluginName;
```

## TypeScript

Since omegga 1.23.0, an unsafe plugin can be written in TypeScript with no build
step of its own: put an `omegga.main.ts` next to `doc.json`, and `export default`
the plugin class. `omegga init-plugin` sets one up when you pick `unsafe` and
answer yes to TypeScript.

Every time the plugin loads (including a reload), omegga bundles
`omegga.main.ts` and everything it imports from the plugin into
`.build/omegga.main.js`, the same way it builds a typed
[safe plugin](safe.md#omeggaplugints-example), and `require`s that.

- The build strips types without checking them. Check them yourself with
  `npx tsc --noEmit`.
- A build error stops the plugin from starting, and the errors are logged.
- Rebuilds are cached in `.build/.cache`, so a reload with no changes is quick.
- Your own files (relative imports, and `src/...` for the plugin's `src`
  folder) are bundled. Packages from `node_modules` and Node builtins are
  `require`d at runtime as usual.
- `__dirname` is the plugin's `.build` folder, so the plugin folder is
  `path.resolve(__dirname, '..')`.
- Stack traces point at the `.ts` files.
- When the plugin's `.gitignore` lists `omegga.d.ts`, omegga keeps that file up to
  date with its own types on every build.

If a plugin has both files, `omegga.main.ts` wins. A plugin that must also run
on older omegga versions can keep a prebuilt `omegga.main.js` (for example
from `tsc` in `setup.sh`), which those versions load instead.

The plugin is constructed with omegga's server object itself, typed `OU`
(`OmeggaUnsafe`): everything a safe plugin's `OL` has, plus process-level
parts like `dataPath`, `write()`, `getGameBinaryPath()` and `pluginLoader`.

Put `.build/`, `node_modules/` and `omegga.d.ts` in your `.gitignore`, and use
the `tsconfig.json` from the [safe plugin example](safe.md#omeggaplugints-example).

`omegga.main.ts`:

```ts
import OmeggaPlugin, { OU, PC, PM, PS } from 'omegga';

type Config = { foo: string };
type Storage = { bar: string };

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  constructor(
    public omegga: OU,
    public config: PC<Config>,
    public store: PS<Storage>,
    public metrics: PM,
  ) {}

  async init() {
    this.omegga.on('cmd:test', (speaker: string) => {
      this.omegga.broadcast(`Hello, ${speaker}!`);
    });
    return { registeredCommands: ['test'] };
  }

  async stop() {
    this.omegga.removeAllListeners('cmd:test');
  }
}
```

## See also

- [Plugin structure](../plugins/) for `doc.json`, `plugin.json`, config, and the store
- [Omegga](../api/omegga.md), [Player](../api/player.md), and [Events](../api/events.md) for what the plugin can reach
- [Plugin metrics](../metrics.md#plugin-metrics) for exporting your own Prometheus metrics
