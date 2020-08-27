# Omegga

Similar to [n42k's brikkit](https://github.com/n42k/brikkit), wraps brickadia's server console to provide interactivity via plugins.

## Running

Omegga depends on node v12+ and the brickadia linux launcher.

Before running, `npm start -- config` needs to be run to generate brickadia config.

At the moment, Omegga is far from complete and is run via `node test.js` in the project folder.

Eventually it will be able to be run in any directory via `omegga` and configured with `omegga config` or a website.

## Plugins

Plugins are going to be able to be developed in more languages in the future but at the moment are currently limited to javascript.

In a `plugins` directory create the following folder structure:

* `plugins/myPlugin` - plugin folder
* `plugins/myPlugin/omegga.main.js` - js plugin main file
* `plugins/myPlugin/doc.json` - plugin information
* `plugins/myPlugin/disable.omegga` - empty file only present if the plugin should be disabled

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
    this.omega
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
