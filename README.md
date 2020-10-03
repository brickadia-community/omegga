# Omegga

Similar to [n42k's brikkit](https://github.com/n42k/brikkit), wraps brickadia's server console to provide interactivity via plugins.

## Install

Omegga depends on node v12+ and the **brickadia linux launcher** which is not available publicly at the moment. You can run omegga in the Windows Subsystem for Linux or on an actual linux install.

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

Omegga will prompt for credentials as necessary and only stores the auth tokens brickadia generates on login.

# Planned Features

  * [ ] web interface
    * [ ] enable/disable plugins live
    * [ ] manage plugins config, perhaps by iframe
    * [ ] chat with players
    * [ ] view recent console logs
    * [ ] view server status
  * [ ] metrics
    * [ ] bricks over time charts
    * [ ] player online time tracking
    * [ ] chat logs
    * [ ] chats/hour tracking
  * [ ] plugins in other languages via websocket connection
  * [ ] sandboxed node plugins (more secure, more stable)
  * [ ] plugin installation by `omegga install gh@user/repo`
  * [ ] plugin updates by `omegga update`
  * [ ] server config bundling (making it easier to transfer configs)

# Plugins

Plugins are located in the `plugins` directory in an omegga config folder

Plugins are going to be able to be developed in more languages in the future but at the moment are currently limited to javascript.

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
* `plugins/myPlugin/doc.json` - plugin information (optional)
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
