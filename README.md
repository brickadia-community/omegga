# Omegga

[Join the discord](https://discord.gg/UcdwTYhS75) to browse plugins and get support. Read the README first before asking questions!

Omegga wraps brickadia's server console to provide interactivity and utility via plugins.

## Screenshots

[<img src="https://i.imgur.com/AqJF2T0.png" width="512"/>](https://i.imgur.com/AqJF2T0.png)
[<img src="https://i.imgur.com/vGjKoB6.png" width="512"/>](https://i.imgur.com/vGjKoB6.png)
[<img src="https://i.imgur.com/EhT1GBR.png" width="512"/>](https://i.imgur.com/EhT1GBR.png)
[<img src="https://i.imgur.com/PLwgVlx.png" width="512"/>](https://i.imgur.com/PLwgVlx.png)
[<img src="https://i.imgur.com/bCnQ5Pb.png" width="512"/>](https://i.imgur.com/bCnQ5Pb.png)

## Install

You can run omegga in the [Windows Subsystem for Linux](#wsl) (I recommend Ubuntu) or on an actual linux install.

<font size="5" color="red">Do not install omegga or run brickadia/omegga as root/superuser</font>:

- running `whoami` should NOT print "root"
- your terminal prompt should NOT end with #
- you should NOT be typing `sudo npm i -g omegga`
- running `echo $EUID` should NOT print "0"

If any of the above are true, [create a new user](#creating-a-new-user) and continue from there.

### Quick Setup (automatically download launcher)

1. Install linux if you haven't already ([Windows Install](#wsl))

2. If you type `whoami` and it says "root", [create a new user](#creating-a-new-user) and come back. This step is usually only necessary for people using a VPS.

3. Run these commands (Installs a node installer, installs node, installs omegga):

   ```sh
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
   . ~/.nvm/nvm.sh
   nvm install 16
   npm i -g omegga
   ```

   If you get an error like "gyp info find Python using Python version 3.8.10 found at /usr/bin/python3" you need to install python3: `sudo apt install python3` and re-run `npm i -g omegga`
   If you get an error like "gyp ERR! stack Error: not found: make" you need to install build-essential: `sudo apt install build-essential` and re-run `npm i -g omegga`

   If you are having trouble installing with nvm and are running Ubuntu/Debian, run the following commands (installs node, installs omegga) instead or install node&npm from [NodeSource Binary Distributions](https://github.com/nodesource/distributions/blob/master/README.md).

   ```sh
   curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt-get install -y nodejs
   npm i -g omegga
   ```

Then head over to [Running Omegga](#running)!

### Manual Setup (you install stuff)

Omegga depends on:

- linux
  - [Windows Install](https://docs.microsoft.com/en-us/windows/wsl/install-win10#manual-installation-steps) (WSL 1 or WSL 2)
    - [Windows Ubuntu](https://www.microsoft.com/en-us/p/ubuntu/9nblggh4msv6)
- Node v14+ ([ubuntu/deb](https://github.com/nodesource/distributions/blob/master/README.md#installation-instructions))
- One of:
  - `tar` (most linuxes come with this, though you can `sudo apt install tar`)
  - [Brickadia linux launcher](https://brickadia.com/download)

Omegga is installed as a global npm package

    npm i -g omegga

Alternatively, you can use a development/local omegga.

    # clone omegga
    git clone https://github.com/brickadia-community/omegga.git && cd omegga

    # install dependencies
    npm i

    # point development omegga to global npm bin
    npm link

    # build omegga's dist from typescript
    npm run build

    # build the web ui (once)
    npm run dist

If you accidentally install both from Github and `npm i -g omegga`, you can run `npm unlink omegga` to stop npm from using the git one.

If you have EACCES errors on WSL, see the [troubleshooting](#troubleshooting) section for a potential fix.

### WSL

These are simple instructions to get Windows System for Linux installed.

**Note**: WSL 2 at the moment requires the [wsl2binds plugin](https://github.com/Meshiest/omegga-wsl2binds). You can install it with `omegga install gh:meshiest/wsl2binds`

To enable WSL, run this in powershell as an administrator:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

Then in the Microsoft Store, download a linux:

- [Ubuntu](https://www.microsoft.com/en-us/p/ubuntu/9nblggh4msv6)

[More Advanced Instructions here](https://docs.microsoft.com/en-us/windows/wsl/install-win10#manual-installation-steps) if the above is not sufficient.

To set WSL version from 2 to 1:

1. Check WSL version with `wsl -l -v` in cmd
2. In Administrator cmd, run `wsl --set-version <distribution name> 1` where `<distribution name>` is `Ubuntu`, `Debian`, etc. (From the NAME section of the previous command)

### Creating a New User

If you are running as root (terminal prompt ends with '#' instead of '$' or running `whoami` says "root"), create a new user.

The following commands will create a user named `brickadia`. Feel free to replace it to `user` or your own name.

```sh
# create the user
useradd -m brickadia
# set the new user's password
passwd brickadia
# allow "sudo apt install ...." to work in this user
usermod -aG sudo brickadia
# become this user
su brickadia
```

## Running

It's recommend to create a folder first _before_ starting your server:

    mkdir myServer && cd myServer

To start a server, simply type the following in a linux shell after install:

    omegga

Omegga will prompt for credentials as necessary and only stores the auth tokens brickadia generates on login. **Omegga does not store your password**

## Updating

Omegga will tell you when it's out of date. You can update with this command:

    npm i -g omegga

## Configuration

- CLI config via `omegga config`
- Omegga config is located in a generated `omegga-config.yml`
- Plugin config is handled by plugin or inside the web-ui's plugins tab.

Example available `omegga-config.yml` fields

```yaml
omegga:
  port: 8080
  webui: true
  https: true
  debug: false
server:
  port: 7777
  map: Plate
  branch: unstable:unstable-server
```

Note: `BRANCH-server` branches download only server data

## Troubleshooting

Narrow down where the issue might be with the following options:

- If your brickadia is crashing and omegga works, type `/debug` into omegga console or run with `omegga --debug`
- If your omegga isn't starting, run with `omegga --verbose`
- If a plugin is crashing, message the plugin developer
- If you are on Ubuntu and the output of `which npm` is `/bin/npm`, run `sudo apt purge nodejs` and restart install instructions from `nvm install 16`.
- If you're getting an EACCES error when running `npm i -g omegga`:
  1. First, try [this](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).
  2. If that doesn't work, try this horrible bodge method for WSL:
     1. Set your WSL to WSL 2
     2. `npm i -g omegga`
     3. Set your WSL back to WSL 1
- If you're getting a "gyp ERR! stack Error: not found: make" install [build-essential](https://wiki.gnucash.org/wiki/Install_Build_Tools)

## Uninstalling

```sh
# uninstall omegga
npm uninstall -g omegga

# remove omegga config
rm -rf ~/.config/omegga

# remove brickadia installs
rm -rf ~/.local/share/brickadia-launcher

# potentially remove extra brickadia config
rm ~/.config/Epic
```

You will have to delete your omegga data folders manually

# Planned Features

- [ ] web interface (mostly done)
  - [x] reload plugins
  - [x] enable/disable plugins live
  - [x] live plugin reloading/unloading state
  - [x] browse chat history
  - [x] manage plugins config
  - [x] start/stop server
  - [x] chat with players
  - [ ] view recent console logs
  - [x] view server status
  - [x] multiple users
  - [ ] roles for each user
  - [ ] chatcmd history
  - [x] track players kicked/banned
  - [ ] automated/scheduled server restarting (when no one is on)
- [x] terminal interface
  - [x] reload plugins
  - [x] chat with players
  - [x] view recent console logs
  - [x] view server status
- [ ] metrics
  - [ ] bricks over time charts
  - [x] player online time tracking
  - [x] chat logs
  - [ ] chats/hour tracking
- [x] plugins in other languages via JSON RPC over stdio
  - [ ] LogWrangler impl for other languages
  - [x] events sent JSON RPC
- [ ] sandboxed node plugins (more secure, more stable)
  - [x] running in own thread (worker)
  - [x] running in own vm
  - [x] can `require`
  - [x] partial omegga spec (events, some features)
  - [x] full omegga spec
  - [ ] _good_ access restrictions (ask user for permission)
- [x] plugin installation by `omegga install gh:user/repo`
- [x] plugin updates by `omegga update`
- [ ] server config bundling (making it easier to transfer configs)
  - [ ] omegga.server.json
    - [ ] list of installed omegga plugins, versions, and download urls
    - [ ] list of roles, bans, role assignments

# Plugins

Plugins are located in the `plugins` directory in an omegga config folder

Plugins are most easily developed in Javascript at the moment using the Node VM Plugins and Node Plugins. You can use JSON RPC Plugins to write plugins in other languages.

## Installing Plugins

### CLI Installation

You can install plugins with the `omegga install https://github.com/user/repo` command.

You can install plugins using a shorthand `omegga install gh:user/repo` which will install the plugin located at `https://github.com/user/omegga-repo`

### Manual Installation

Usually you can run `git clone https://github.com/user/repo` inside your `plugins` folder (created when you run `omegga` for the first time):

- `cd plugins` to navigate to plugins folder
- Make sure to read the plugin's README file for after-install instructions

## Updating Plugins

Plugins can be updated with `omegga update` or `omegga update pluginName anotherPluginName`

Plugins may also need to be updated based on the project's README file.

## Creating Plugins

Plugins can be created manually using the file structure described below, or they can be initialized automatically using `omegga init-plugin`:

`omegga init-plugin [--type <type>] [--author <author>] <plugin-name>`

If the current working directory is an Omegga installation, the initialized plugin will be placed in the `plugins` directory. Otherwise,
it will be created at the current working directory.

For most cases, you will find yourself using `safe` or `safe-ts` plugins, but the valid plugin types to pass to `--type` are

- `safe` (default), the standard Node VM plugin type
- `safe-ts`, a `safe` plugin using TS
- `unsafe`, an unsafe plugin with raw access to internal Omegga APIs
- `rpc`, a plugin that will interface another executable using RPC over STDIN/STDOUT

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
  "emitConfig": "config.json"
}
```

- `formatVersion` - indicates the plugin file format version
- `omeggaVersion` - indicates compatible omegga versions ([semver cheatsheet](https://www.npmjs.com/package/semver#user-content-ranges))
- `emitConfig` - optional, a path to a json file where plugin config will be saved to before the plugin starts.

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

## Node VM Plugins

Node VM Plugins are what you should be using. They are run inside a VM inside a Worker. This means when they crash, they do not crash the whole server, and they can in the future have locked down permissions (disable filesystem access, etc.).

These plugins receive a "proxy" reference to `omegga` and have limited reach for what they can touch.

Register custom `/commands` by returning `{registeredCommands: ['foo', 'bar']}` (registers command `/foo` and `/bar`) in the `async init()` method.

By defining an `async pluginEvent(event, from, ...args)` method in your plugin class, you can respond to events from other plugins, where `from` is the name of the other plugin, `event` is the name of the custom event, and `args` is an array of any passed arguments.

### Globals

- `OMEGGA_UTIL` - access to the `src/util/index.js` module
- `Omegga` - access to the "proxy" omegga
- `console.log` - and other variants (`console.error`, `console.info`) print specialized output to console

### Folder Structure

In a `plugins` directory create the following folder structure:

- `plugins/myPlugin` - plugin folder (required)
- `plugins/myPlugin/omegga.plugin.js` - js plugin main file (required)
- `plugins/myPlugin/doc.json`
- `plugins/myPlugin/access.json` - plugin access information (required, but doesn't have to have anything right now). this will contain what things the vm will need to access

### `access.json` (examples)

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

### `omegga.plugin.js` (example)

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

### `omegga.plugin.ts` (example)

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

## Node Plugins

Node plugins are effectively `require`'d into omegga. They have the potential to crash the entire service through uncaught exceptions and also can be insecure. Develop and run these at your own risk - your server stability may suffer.

These plugins receive a direct reference to the `omegga` that wraps the brickadia server. As a result, they can directly modify how omegga runs.

Cleanup is important as code can still be running after the plugin is unloaded resulting in strange and undefined behavior. Make sure to run `clearInterval` and `clearTimeout`

Register custom `/commands` by returning `{registeredCommands: ['foo', 'bar']}` (registers command `/foo` and `/bar`) in the `async init()` method.

### Globals

- `OMEGGA_UTIL` - access to the `src/util/index.js` module

### Folder Structure

In a `plugins` directory create the following folder structure:

- `plugins/myPlugin` - plugin folder (required)
- `plugins/myPlugin/doc.json`
- `plugins/myPlugin/omegga.main.js` - js plugin main file (required)

### `omegga.main.js` (example)

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
}

module.exports = PluginName;
```

## JSON RPC Plugins

JSON RPC Plugins let you use any language you desire, as long as you can run it from a single executable file. They follow the [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

The server communicates with the plugin by sending messages to `stdin` and expects responses in `stdout`. All `stderr` is printed to the console.

Register custom `/commands` by returning `{registeredCommands: ['foo', 'bar']}` (registers command `/foo` and `/bar`) in the `init` method.

### Omegga Methods (You can access these)

| Method                         | Arguments                                            | Description                                                         | Returns                                                         |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `log`                          | line (string)                                        | Prints message to omegga console                                    |                                                                 |
| `error`                        | line (string)                                        | Same as `log` but with different colors                             |                                                                 |
| `info`                         | line (string)                                        | Same as `log` but with different colors                             |                                                                 |
| `debug`                        | line (string)                                        | Same as `log` but with different colors                             |                                                                 |
| `warn`                         | line (string)                                        | Same as `log` but with different colors                             |                                                                 |
| `trace`                        | line (string)                                        | Same as `log` but with different colors                             |                                                                 |
| `store.get`                    | key (string)                                         | Get an object from plugin store                                     | Object                                                          |
| `store.set`                    | [key (string), value (any)]                          | Store an object in plugin store                                     |                                                                 |
| `store.delete`                 | key (string)                                         | Remove an object from plugin store                                  |                                                                 |
| `store.wipe`                   | _none_                                               | Remove all objects from plugin store                                |                                                                 |
| `store.count`                  | _none_                                               | Count number of objects in plugin store                             | Integer                                                         |
| `store.keys`                   | _none_                                               | Get keys for all objects in plugin store                            | List of Strings                                                 |
| `exec`                         | cmd (string)                                         | Writes a console command to Brickadia                               |                                                                 |
| `writeln`                      | cmd (string)                                         | Same as `exec`                                                      |                                                                 |
| `broadcast`                    | line (string)                                        | Broadcasts a message to the server                                  |                                                                 |
| `whisper`                      | {target: string, line: string}                       | Sends a message to a specific client                                |                                                                 |
| `middlePrint`                  | {target: string, line: string}                       | Sends a middle print message to a specific client                   |                                                                 |
| `getPlayers`                   | _none_                                               | Online players                                                      | List of Players                                                 |
| `getAllPlayerPositions`        | _none_                                               | An array of objects with fields `pos` and `player`.                 | List of { _Player Object_(...), _Position_(...), isDead(bool) } |
| `getRoleSetup`                 | _none_                                               | Server roles                                                        | _JSON Data_                                                     |
| `getBanList`                   | _none_                                               | List of bans                                                        | _JSON Data_                                                     |
| `getSaves`                     | _none_                                               | Saves in the saves directory                                        | List Strings                                                    |
| `getSavePath`                  | name (string)                                        | The path to a specific save                                         | String                                                          |
| `getSaveData`                  | _none_                                               | Current save as brs-js data                                         | _BRS Object_                                                    |
| `clearBricks`                  | {target: string, quiet: bool}                        | Clears a specific player's bricks                                   |                                                                 |
| `clearAllBricks`               | quiet                                                | Clears all bricks on the server                                     |                                                                 |
| `saveBricks`                   | name (string)                                        | Save bricks to a save named `name`                                  |                                                                 |
| `loadBricks`                   | {name: string, offX, offY, offY, quiet: bool}        | Load bricks of save named `name`                                    |                                                                 |
| `loadBricksOnPlayer`           | {name: string, player: string, offX, offY, offY}     | Load bricks of save named `name` on player clipboard                |                                                                 |
| `readSaveData`                 | name (string)                                        | Parses save into a brs-js save object, returns the object           | _BRS Object_                                                    |
| `loadSaveData`                 | {data: object, offX, offY, offY, quiet: bool}        | Builds brs file from data, loads the file                           |                                                                 |
| `loadSaveDataOnPlayer`         | {data: object, player: string, offX, offY, offY}     | Builds brs file from data, loads the file onto a player's clipboard |                                                                 |
| `changeMap`                    | map (string)                                         | Change map to specified map name, returns success                   | Boolean                                                         |
| `player.get`                   | target (string)                                      | Gets the player by their name or UUID.                              | `{name, id, controller, state, host: bool}`                     |
| `player.getRoles`              | target (string)                                      | Target's roles                                                      |                                                                 |
| `player.getPermissions`        | target (string)                                      | Target's permissions                                                | List of Strings                                                 |
| `player.getNameColor`          | target (string)                                      | Target's name color                                                 | _RGB Hex Object_ (int, int ,int)                                |
| `player.getPosition`           | target (string)                                      | Target's position                                                   | _Position Object_                                               |
| `player.getGhostBrick`         | target (string)                                      | Target's ghost brick                                                | {targetGrid, location(_Location_), orientation}                 |
| `player.getPaint`              | target (string)                                      | Target's current paint selection                                    | {materialIndex, materialAlpha, material, color)}                |
| `player.getTemplateBounds`     | target (string)                                      | Target's template/selection bounds                                  | {minBound, maxBound, Center}                                    |
| `player.getTemplateBoundsData` | target (string)                                      | Target's template/selection as brs-js save data                     | _Brick Object_                                                  |
| `player.loadSaveData`          | {target, data, offX, offY, offZ}                     | Loads brs-js save data to the targets clipboard                     |                                                                 |
| `player.loadDataAtGhostBrick`  | {target, data, rotate=true, offX, offY, offZ, quiet} | Loads brs-js save data at the target's selection bounds             |                                                                 |
| `plugin.get`                   | target (string)                                      | Gets info on the target plugin                                      | Object                                                          |
| `plugin.emit`                  | [target (string), event (string), ...args (any)]     | Emit a custom event to the target plugin                            |                                                                 |

### Plugin Methods (You implement these)

| Method               | Arguments                                                                                                                        | Description                                                  | Required |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| `init`               | config object                                                                                                                    | Returns a start result, called on plugin start               | &#9745;  |
| `stop`               | _none_                                                                                                                           | Returns _something_, called on plugin stop                   | &#9745;  |
| `bootstrap`          | [{ omegga info (`host`, `version`, etc) }]                                                                                       | Run when plugin is started for base data                     |          |
| `plugin:players:raw` | [[... [player `name`, `id`, `controller`, `state`]]]                                                                             | Lists players on the server                                  |          |
| `plugin:emit`        | [event, from, ...args]                                                                                                           | Fired when anotehr plugin sends an event                     |          |
| `line`               | [brickadiaLog string]                                                                                                            | A brickadia console log                                      |          |
| `start`              | [{map}]                                                                                                                          | On brickadia server start                                    |          |
| `host`               | [{name, id}]                                                                                                                     | When the host is detected                                    |          |
| `version`            | [-1 or the CL number]                                                                                                            | When the version is detected                                 |          |
| `unauthorized`       | _none_                                                                                                                           | On brickadia server fails an auth check                      |          |
| `join`               | [{name, id, state, controller}]                                                                                                  | Run when a player joins                                      |          |
| `leave`              | [{name, id, state, controller}]                                                                                                  | Run when a player leaves                                     |          |
| `cmd:command`        | [playerName, ...args]                                                                                                            | Runs when a player runs a `/command args`                    |          |
| `chatcmd:command`    | [playerName, ...args]                                                                                                            | Runs when a player runs a `!command args`                    |          |
| `chat`               | [playerName, message]                                                                                                            | Runs when a player sends a chat message                      |          |
| `interact`           | {brick_asset: string;player: { id: string; name: string; controller: string; pawn: string };position: [number, number, number];} | Runs when a player clicks a brick with an interact component |          |
| `mapchange`          | [{map}]                                                                                                                          | Runs when the map changes                                    |          |
| `autorestart`        | [autorestart config]                                                                                                             | Runs server has an autorestart scheduled                     |          |

### Folder Structure

In a `plugins` directory create the following folder structure:

- `plugins/myPlugin` - plugin folder (required)
- `plugins/myPlugin/doc.json`
- `plugins/myPlugin/omegga_plugin` - executable plugin file (required)

### `omegga_plugin` (example, node javascript)

```javascript
#!/usr/bin/env node

const readline = require('readline');
const { EventEmitter } = require('events');
const {
  JSONRPCServer,
  JSONRPCServerAndClient,
  JSONRPCClient,
} = require('json-rpc-2.0');

// events
const ev = new EventEmitter();

// stdio handling
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

// rpc "server and client" for responding/receiving messages
const rpc = new JSONRPCServerAndClient(
  new JSONRPCServer(),
  // the client outputs JSON to console
  new JSONRPCClient(async blob => console.log(JSON.stringify(blob)))
);

// on stdin, pass into rpc
rl.on('line', line => {
  try {
    rpc.receiveAndSend(JSON.parse(line));
  } catch (e) {
    console.error(e);
  }
});

// regexes for matching brickadia console logs
const GENERIC_LINE_REGEX =
  /^(\[(?<date>\d{4}\.\d\d.\d\d-\d\d.\d\d.\d\d:\d{3})\]\[\s*(?<counter>\d+)\])?(?<generator>\w+): (?<data>.+)$/;
const LOG_LINE_REGEX =
  /\[(?<date>\d{4}\.\d\d.\d\d-\d\d.\d\d.\d\d:\d{3})\]\[\s*(?<counter>\d+)\](?<rest>.*)$/;

ev.on('line', line => {
  const logMatch = line.match(LOG_LINE_REGEX);
  if (!logMatch) return;
  const {
    groups: { rest },
  } = logMatch;
  const dataMatch = rest.match(GENERIC_LINE_REGEX);
  if (dataMatch) ev.emit('logData', dataMatch.groups);
  else ev.emit('logLine', rest);
});

// list of players
let players;

// get a player by name
const getPlayer = name => players.find(p => p.name === name);

// watch console logs for a pattern, then remove the listener
function watch(exec, pattern) {
  return new Promise(resolve => {
    function listener(line) {
      const match = line.match(pattern);
      // listener removes itself on a match
      if (match) {
        ev.off('logLine', listener);
        resolve(match.groups);
      }
    }
    // add the listener
    ev.on('logLine', listener);

    // run the console command
    rpc.notify('writeln', exec);
  });
}

// get a player's position
async function getPlayerPos(name) {
  const player = getPlayer(name);
  if (!player) return;

  // get player position from player controller
  const pawnRegExp = new RegExp(
    `BP_PlayerController_C .+?PersistentLevel\\.${player.controller}\.Pawn = BP_FigureV2_C'.+?:PersistentLevel.(?<pawn>BP_FigureV2_C_\\d+)'`
  );
  const { pawn } = await watch(
    `GetAll BP_PlayerController_C Pawn Name=${player.controller}`,
    pawnRegExp
  );

  // get player position from pawn
  const posRegExp = new RegExp(
    `CapsuleComponent .+?PersistentLevel\\.${pawn}\\.CollisionCylinder\\.RelativeLocation = \\(X=(?<x>[\\d\\.-]+),Y=(?<y>[\\d\\.-]+),Z=(?<z>[\\d\\.-]+)\\)`
  );
  const { x, y, z } = await watch(
    `GetAll SceneComponent RelativeLocation Name=CollisionCylinder Outer=${pawn}`,
    posRegExp
  );

  return [x, y, z].map(Number);
}

// emit a console log
const log = (...args) => rpc.notify('log', args.join(' '));

// when available players updates - plugin:players:raw is emitted
rpc.addMethod('plugin:players:raw', ([playerArr]) => {
  // update the players list
  players = playerArr.map(p => ({
    name: p[0],
    id: p[1],
    controller: p[2],
    state: p[3],
  }));
});

// ping command
rpc.addMethod('chatcmd:ping', ([name, ...args]) => {
  rpc.notify('broadcast', `pong @ ${name} + ${args.length} args`);
});

// player position command
rpc.addMethod('chatcmd:pos', async ([name]) => {
  log('player', name, 'requests position');
  const [x, y, z] = await getPlayerPos(name);
  rpc.notify('broadcast', `<b>${name}</> is at ${x} ${y} ${z}`);
});

// pass lines into the event emitter
rpc.addMethod('line', ([line]) => {
  ev.emit('line', line);
});

// receive config object in init
rpc.addMethod('init', async ([config]) => ({ registeredCommands: [] }));
rpc.addMethod('stop', async () => 'ok');
```

# Extra Features

## Environment Variables

`omegga` accepts the following environment variables:

- `BRICKADIA_USER` - brickadia auth username (on first start)
- `BRICKADIA_PASS` - brickadia auth password (on first start)
- `BRICKADIA_PORT` - brickadia server port (on config creation)
- `OMEGGA_PORT` - omegga webserver port (on config creation)

## Config

Default config values (including hidden ones)

```yaml
omegga:
  port: 8080 # web-ui port
  webui: true # enable web-ui
  plugins: true # enable plugins
  singleUser: false # disable web-ui auth users
  https: true # enable https for web-ui
  debug: false # debug logging
server:
  port: 7777 # game server port
  map: Plate # map name
  branch: unstable:unstable-server # branch alias:branch name
```
