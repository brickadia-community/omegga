# Node VM Plugins

Node VM Plugins are what you should be using. They are run inside a VM inside a Worker. This means when they crash, they do not crash the whole server, and they can in the future have locked down permissions (disable filesystem access, etc.).

These plugins receive a "proxy" reference to `omegga` and have limited reach for what they can touch.

Register custom `/commands` by returning `{registeredCommands: ['foo', 'bar']}` (registers command `/foo` and `/bar`) in the `async init()` method.

By defining an `async pluginEvent(event, from, ...args)` method in your plugin class, you can respond to events from other plugins, where `from` is the name of the other plugin, `event` is the name of the custom event, and `args` is an array of any passed arguments.

## Globals

- `OMEGGA_UTIL` - access to the `src/util/index.js` module
- `Omegga` - access to the "proxy" omegga
- `console.log` - and other variants (`console.error`, `console.info`) print specialized output to console

## Folder Structure

In a `plugins` directory create the following folder structure:

- `plugins/myPlugin` - plugin folder (required)
- `plugins/myPlugin/omegga.plugin.js` - js plugin main file (required)
- `plugins/myPlugin/doc.json`
- `plugins/myPlugin/access.json` - plugin access information (required, but doesn't have to have anything right now). this will contain what things the vm will need to access

## `access.json` (examples)

Access to any builtin modules (`fs`, `path`, etc.)

```json
["*"]
```

Access to nothing - only the code in the `omegga.plugin.js`

```json
[]
```

Access to only `fs`, (`const fs = require('fs');`)

```json
["fs"]
```

## `omegga.plugin.js` (example)

```javascript
class PluginName {
  // the constructor also contains an omegga if you don't want to use the global one
  // config and store variables are optional but provide access to the plugin data store
  constructor(omegga, config, store) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    console.info('constructed my plugin!');
  }

  async init() {
    Omegga.on('chatcmd:ping', (name, ...args) => {
      Omegga.broadcast(`pong @ ${name} + ${args.length} args`);
    }).on('chatcmd:pos', async name => {
      const [x, y, z] = await Omegga.getPlayer(name).getPosition();
      Omegga.broadcast(`<b>${name}</> is at ${x} ${y} ${z}`);
    });
  }

  async stop() {
    // any remove events are not necessary because the VM removes the code
  }
}

module.exports = PluginName;
```

## `omegga.plugin.ts` (example)

Be sure to put `.build/` and `node_modules/` in your `.gitignore`

**Requires a `tsconfig.json`**:

```json
{
  "compilerOptions": {
    "noEmit": true,
    "esModuleInterop": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "target": "es2020",
    "baseUrl": ".",
    "paths": {
      "omegga/*": ["node_modules/omegga/dist/*"]
    }
  }
}
```

`omegga.plugin.ts`:

```ts
import type { OmeggaPlugin, OL, PS, PC } from 'omegga/plugin';

type Config = { foo: string };
type Storage = { bar: string };

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;

  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
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
```

## See also

- [Plugin structure](../plugins/) for `doc.json`, `plugin.json`, config, and the store
- [Omegga](../api/omegga.md), [Player](../api/player.md), and [Events](../api/events.md) for what the plugin can reach
- [Plugin metrics](../metrics.md#plugin-metrics) for exporting your own Prometheus metrics
