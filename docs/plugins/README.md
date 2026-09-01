# Plugins

Plugins are located in the `plugins` directory in an omegga config folder.

A plugin is a module that adds functionality to Omegga or a Brickadia server.
An example is the [autosaveez plugin](https://github.com/Meshiest/omegga-autosaveez),
which lets users create and manage autosaves. More can be found in the
#finished-plugins channel of the [discord](https://discord.gg/UcdwTYhS75).

Omegga and plugins are not officially supported by Brickadia and may cease to
function after any update.

## Plugin types

Plugins can be created manually using the file structure described below, or
initialized automatically with `omegga init-plugin`. Follow the prompts and your
plugin will be generated for you.

| `init-plugin` type | Main file | Notes |
| --- | --- | --- |
| [`safe`](safe.md) (default) | `omegga.plugin.js` / `.ts` | The standard Node VM plugin. Runs in a VM inside a worker, so a crash does not take omegga down |
| [`unsafe`](unsafe.md) | `omegga.main.js` | Raw access to internal Omegga APIs, and the ability to crash them |
| [`rpc`](jsonrpc.md) | `omegga_plugin` | Any language that runs from one executable, over JSON-RPC on stdin/stdout |
| `rust` | `omegga_plugin` | An RPC plugin built on the [omegga-rs](https://github.com/voximity/omegga-rs) Rust interface |

Javascript is the easiest of these to develop in. Use JSON RPC to write plugins
in other languages.

Everything below applies to all four.

## Plugin Structure

All plugins are located in a `plugins` directory where you are running Omegga:

- `plugins/myPlugin` - plugin folder (required)
- `plugins/myPlugin/doc.json` - plugin information (required)
- `plugins/myPlugin/plugin.json` - plugin version information, validated with `omegga check` (optional, for now)
- `plugins/myPlugin/setup.sh` - plugin setup script, run after installed by `omegga install` (optional)
- `plugins/myPlugin/disable.omegga` - empty file only present if the plugin should be disabled (optional)

Every plugin requires a `doc.json` file to document which briefly describes the plugin and its commands.

### `doc.json` (example)

```json
{
  "name": "My Plugin",
  "description": "Example Plugin",
  "author": "cake",
  "config": {
    "example-text": {
      "description": "This is an example text input",
      "default": "default value",
      "type": "string"
    },
    "example-password": {
      "description": "This is example text input hidden as a password",
      "default": "hidden password value",
      "type": "password"
    },
    "example-number": {
      "description": "This is an example numerical input",
      "default": 5,
      "type": "number"
    },
    "example-bool": {
      "description": "This is an example boolean input",
      "default": false,
      "type": "boolean"
    }
  },
  "commands": [
    {
      "name": "!ping",
      "description": "sends a pong to the sender",
      "example": "!ping foo bar",
      "args": [
        {
          "name": "args",
          "description": "random filler arguments",
          "required": false
        }
      ]
    },
    {
      "name": "!pos",
      "description": "announces player position",
      "example": "!pos",
      "args": []
    }
  ]
}
```

## Plugin Config

This is an example config section of a `doc.json`. The web ui provides an interface for editing these configs.

```json
{
  "config": {
    "example-text": {
      "description": "This is an example text input",
      "default": "default value",
      "type": "string"
    },
    "example-password": {
      "description": "This is example text input hidden as a password",
      "default": "hidden password value",
      "type": "password"
    },
    "example-number": {
      "description": "This is an example numerical input",
      "default": 5,
      "type": "number"
    },
    "example-bool": {
      "description": "This is an example boolean input",
      "default": false,
      "type": "boolean"
    },
    "example-list": {
      "description": "This is an example list input. List type can be string, password, number, or enum",
      "type": "list",
      "itemType": "string",
      "default": ["hello"]
    },
    "example-enum": {
      "description": "This is an example enum/dropdown input",
      "type": "enum",
      "options": ["foo", "bar", "baz", 1, 2, 3],
      "default": "foo"
    },
    "example-enum-list": {
      "description": "This is an example list of enums.",
      "type": "list",
      "itemType": "enum",
      "options": ["foo", "bar", "baz"],
      "default": ["foo"]
    },
    "example-players-list": {
      "description": "This is an example list of players.",
      "type": "players",
      "default": [
        {
          "id": "fa577b9e-f2be-493f-a30a-3789b02ba70b",
          "name": "Aware"
        }
      ]
    },
    "example-role": {
      "description": "This is an example role dropdown",
      "type": "role",
      "default": "Admin"
    }
  }
}
```

That config section would generate the following default config:

```json
{
  "example-text": "default value",
  "example-password": "hidden password value",
  "example-number": 5,
  "example-bool": false,
  "example-list": ["hello"],
  "example-enum": "foo",
  "example-enum-list": ["foo"],
  "example-players-list": [
    { "id": "fa577b9e-f2be-493f-a30a-3789b02ba70b", "name": "Aware" }
  ]
}
```

This is provided to plugins in the constructor or the RPC init function.

## Plugin File

This is an example `plugin.json`, located inside a plugin folder. The plugin file helps omegga know if the plugin is compatible with the current installation. Plugin files can be validated with the `omegga check` command.

```json
{
  "formatVersion": 1,
  "omeggaVersion": ">=0.1.32",
  "emitConfig": "config.json",
  "dependencies": {
    "otherPlugin": "https://github.com/owner/repo",
    "requiredPlugin": { "optional": false },
    "optionalPlugin": { "optional": true, "repo": "https://github.com/owner/repo" }
  },
  "loadPriority": 0,
  "loadBefore": ["pluginToLoadAfterThis"],
  "loadAfter": ["pluginToLoadBeforeThis"]
}
```

- `formatVersion` - indicates the plugin file format version
- `omeggaVersion` - indicates compatible omegga versions ([semver cheatsheet](https://www.npmjs.com/package/semver#user-content-ranges))
- `emitConfig` - optional, a path to a json file where plugin config will be saved to before the plugin starts.
- `dependencies` - optional, declares dependencies on other plugins
  - Can be a string specifying the GitHub repository URL (e.g., `"otherPlugin": "https://github.com/owner/repo"`)
  - Can be an object with optional properties:
    - `optional` - if `true`, the plugin will load even if this dependency is missing
    - `repo` - GitHub repository URL where the dependency can be found (e.g., `"https://github.com/owner/repo"`)
  - Dependencies are automatically loaded before the dependent plugin
- `loadPriority` - optional, numeric priority for load order (lower/negative numbers load earlier, higher/positive numbers load later, undefined loads in the middle)
- `loadBefore` - optional, array of plugin names that should load after this plugin
- `loadAfter` - optional, array of plugin names that should load before this plugin

**Note:** Omegga will automatically resolve the correct load order based on dependencies, `loadPriority`, `loadBefore`, and `loadAfter` constraints. If there's a cyclic dependency or conflicting constraints, plugins may fail to load.

## Plugin Store

All plugins have the capability to get/set values in a very lightweight "database"

The following **asynchronous** methods are provided:

| Method         | Arguments                 | Description                              |
| -------------- | ------------------------- | ---------------------------------------- |
| `store.get`    | key (string)              | Get an object from plugin store          |
| `store.set`    | key (string), value (any) | Store an object in plugin store          |
| `store.delete` | key (string)              | Remove an object from plugin store       |
| `store.wipe`   | _none_                    | Remove all objects from plugin store     |
| `store.count`  | _none_                    | Count number of objects in plugin store  |
| `store.keys`   | _none_                    | Get keys for all objects in plugin store |

### Example usage:

```javascript
// simple add function
async function add() {
  const a = await store.get('foo');
  const b = await store.get('bar');
  await store.set('baz', a + b);
  await store.delete('foo');
  await store.delete('bar');
}

(async () => {
  // store foo and bar in the plugin store
  await Promise.all([store.set('foo', 5), store.set('bar', 2)]);

  // add foo and bar
  await add();

  // baz should be equal to 7
  console.log('assert', (await store.get('baz')) === 7);

  // demo of storing an object
  await store.set('example object', {
    foo: 'you can store objects in the store too',
    bar: "just don't expect it to work with anything recursive (cannot serialize)",
  });
})();
```

For Node Plugins, the `store` is the third argument passed into the constructor. For JSONRPC Plugins, the `"store.get"`/etc. methods can be used.

**JSONRPC Note:** `store.set` has an array of arguments (`[key, value]`)

## Plugin Metrics

Plugins get a `metrics` object as a fourth constructor argument, alongside
`store`. Counters, gauges, and histograms registered on it are exported from
omegga's [metrics endpoint](../metrics.md) as
`omegga_plugin_<plugin>_<metric>`. Handles are returned whether or not the
endpoint is enabled, so no guards are needed.

[Plugin metrics](../metrics.md#plugin-metrics) covers the full API, the RPC
`metrics` notification, and the per-plugin limits.

## What plugins can reach

- [Omegga API](../api/omegga.md) for the server itself
- [Player API](../api/player.md) for a specific player
- [Events](../api/events.md) for reacting to what happens in game
- [Log parsing](../api/log-parsing.md) for console output omegga does not already parse
- [Plugin metrics](../metrics.md#plugin-metrics) for exporting Prometheus metrics of their own
