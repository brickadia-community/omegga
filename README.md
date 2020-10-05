# Omegga

Similar to [n42k's brikkit](https://github.com/n42k/brikkit), wraps brickadia's server console to provide interactivity via plugins.

## Install

Omegga depends on Node v12+ ([windows](https://nodejs.org/en/download/), [ubuntu/deb](https://github.com/nodesource/distributions/blob/master/README.md#installation-instructions)) and the **brickadia linux launcher** which is not available publicly at the moment. You can run omegga in the Windows Subsystem for Linux or on an actual linux install.

Omegga is can be installed as a global npm package

    npm i -g omegga

Alternatively, you can use a development/local omegga

    # clone omegga
    git clone https://github.com/brickadia-community/omegga.git && cd omegga

    # point development omegga to global npm bin
    npm link

## Running

To start a server, simply type the following in a linux shell after install:

    omegga

Omegga will prompt for credentials as necessary and only stores the auth tokens brickadia generates on login. **Omegga does not store your password**

## Screenshots

![Generic omegga screenshot](https://i.imgur.com/AqJF2T0.png)

# Planned Features

  * [ ] web interface
    * [ ] reload plugins
    * [ ] enable/disable plugins live
    * [ ] manage plugins config, perhaps by iframe
    * [ ] chat with players
    * [ ] view recent console logs
    * [ ] view server status
  * [x] terminal interface
    * [x] reload plugins
    * [x] chat with players
    * [x] view recent console logs
    * [x] view server status
  * [ ] metrics
    * [ ] bricks over time charts
    * [ ] player online time tracking
    * [ ] chat logs
    * [ ] chats/hour tracking
  * [ ] plugins in other languages via websocket connection
    * [ ] LogWrangler impl for other languages
    * [ ] events sent through thread
  * [ ] sandboxed node plugins (more secure, more stable)
    * [x] running in own thread (worker)
    * [x] running in own vm
    * [x] can `require`
    * [x] partial omegga spec (events, some features)
    * [ ] full omegga spec
    * [ ] _good_ access restrictions (ask user for permission)
  * [ ] plugin installation by `omegga install gh@user/repo`
  * [ ] plugin updates by `omegga update`
  * [ ] server config bundling (making it easier to transfer configs)
    * [ ] omegga.server.json
      * [ ] list of installed omegga plugins, versions, and download urls
      * [ ] list of roles, bans, role assignments

# Plugins

Plugins are located in the `plugins` directory in an omegga config folder

Plugins are going to be able to be developed in more languages in the future but at the moment are currently limited to javascript.

## Node VM Plugins

Node VM Plugins are what you should be using. They are run inside a VM inside a Worker. This means when they crash, they do not crash the whole server and they can in the future have locked down permissions (disable filesystem access, etc).

These plugins receive a "proxy" reference to `omegga` and have limited reach for what they can touch.

At the moment, the following omegga methods are **missing**: `getSaves, writeSaveData, readSaveData, loadSaveData, getSaveData`

### Globals

  * `OMEGGA_UTIL` - access to the `src/util/index.js` module
  * `Omegga` - access to the "proxy" omegga
  * `console.log` - and other variants (console.error, console.info) print specialized output to console

### Folder Structure

In a `plugins` directory create the following folder structure:

* `plugins/myPlugin` - plugin folder (required)
* `plugins/myPlugin/omegga.plugin.js` - js plugin main file (required)
* `plugins/myPlugin/doc.json` - plugin information (required)
* `plugins/myPlugin/access.json` - plugin access information (required, but doesn't have to have anything right now). this will contain what things the vm will need to access
* `plugins/myPlugin/disable.omegga` - empty file only present if the plugin should be disabled (optional)

### `omegga.plugin.js` (example)

```javascript
class PluginName {
  // the constructor also contains an omegga if you don't want to use the global one
  constructor(omegga) {
    this.omegga = omegga;
    console.info('constructed my plugin!');
  }

  init() {
    Omegga
      .on('chatcmd:ping', (name, ...args) => {
        Omegga.broadcast(`pong @ ${name} + ${args.length} args`);
      })
      .on('chatcmd:pos', async name => {
        const [x, y, z] = await Omegga.getPlayer(name).getPosition();
        Omegga.broadcast(`<b>${name}</> is at ${x} ${y} ${z}`);
      });
  }

  stop() {
    // any remove events are not necessary because the VM removes the code
  }
}

module.exports = PluginName;
```

### `doc.json` (example)

```json
{
  "name": "My Plugin",
  "description": "Example Plugin",
  "author": "cake",
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


## Node Plugins

Node plugins are effectively `require`'d into omegga. They have the potential to crash the entire service through uncaught exceptions and also can be insecure. Develop and run these at your own risk - your server stability may suffer.

These plugins receive a direct reference to the `omegga` that wraps the brickadia server. As a result, they can directly modify how omegga runs.

Cleanup is important as code can still be running after the plugin is unloaded resulting in strange and undefined behavior. Make sure to run `clearInterval` and `clearTimeout`

### Globals

  * `OMEGGA_UTIL` - access to the `src/util/index.js` module

### Folder Structure

In a `plugins` directory create the following folder structure:

* `plugins/myPlugin` - plugin folder (required)
* `plugins/myPlugin/omegga.main.js` - js plugin main file (required)
* `plugins/myPlugin/doc.json` - plugin information (required)
* `plugins/myPlugin/disable.omegga` - empty file only present if the plugin should be disabled (optional)

### `omegga.main.js` (example)

```javascript
class PluginName {
  constructor(omegga) {
    this.omegga = omegga;
  }

  init() {
    this.omegga
      .on('chatcmd:ping', (name, ...args) => {
        this.omegga.broadcast(`pong @ ${name} + ${args.length} args`);
      })
      .on('chatcmd:pos', async name => {
        const [x, y, z] = await this.omegga.getPlayer(name).getPosition();
        this.omegga.broadcast(`<b>${name}</> is at ${x} ${y} ${z}`);
      });
  }

  stop() {
    this.omegga
      .removeAllListeners('chatcmd:ping')
      .removeAllListeners('chatcmd:pos');
  }
}

module.exports = PluginName;
```

### `doc.json` (example)

```json
{
  "name": "My Plugin",
  "description": "Example Plugin",
  "author": "cake",
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
