# JSON RPC Plugins

JSON RPC Plugins let you use any language you desire, as long as you can run it from a single executable file. They follow the [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

The server communicates with the plugin by sending messages to `stdin` and expects responses in `stdout`. All `stderr` is printed to the console.

Register custom `/commands` by returning `{registeredCommands: ['foo', 'bar']}` (registers command `/foo` and `/bar`) in the `init` method.

## Omegga Methods (You can access these)

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
| `player.getRoles`              | target (string)                                      | Target's roles                                                      | List of Strings                                                 |
| `player.getPermissions`        | target (string)                                      | Target's permissions                                                | Record<string, boolean>                                         |
| `player.getNameColor`          | target (string)                                      | Target's name color                                                 | _RGB Hex String_                                                |
| `player.getPosition`           | target (string)                                      | Target's position                                                   | [number, number, number] or null                                |
| `player.getPawn`               | target (string)                                      | Target's pawn name                                                  | string or null                                                  |
| `player.getGhostBrick`         | target (string)                                      | Target's ghost brick                                                | {targetGrid, location, orientation}                             |
| `player.getPaint`              | target (string)                                      | Target's current paint selection                                    | {materialIndex, materialAlpha, material, color}                 |
| `player.isCrouched`            | target (string)                                      | Check if target is crouched                                         | boolean                                                         |
| `player.isDead`                | target (string)                                      | Check if target is dead                                             | boolean                                                         |
| `player.getTemplateBounds`     | target (string)                                      | Target's template/selection bounds                                  | {minBound, maxBound, center}                                    |
| `player.getTemplateBoundsData` | target (string)                                      | Target's template/selection as brs-js save data                     | _BRS Object_                                                    |
| `player.clearBricks`           | {target, quiet}                                      | Clears target's bricks                                              |                                                                 |
| `player.loadBricks`            | {target, saveName}                                   | Loads save file to target's clipboard                               |                                                                 |
| `player.loadSaveData`          | {target, data, offX, offY, offZ}                     | Loads brs-js save data to target's clipboard                        |                                                                 |
| `player.loadDataAtGhostBrick`  | {target, data, rotate=true, offX, offY, offZ, quiet} | Loads brs-js save data at target's selection bounds                 |                                                                 |
| `player.kill`                  | target (string)                                      | Kills the target player                                             |                                                                 |
| `player.damage`                | {target, amount}                                     | Damages target by amount                                            |                                                                 |
| `player.heal`                  | {target, amount}                                     | Heals target by amount                                              |                                                                 |
| `player.giveItem`              | {target, item}                                       | Gives target an item                                                |                                                                 |
| `player.takeItem`              | {target, item}                                       | Removes item from target                                            |                                                                 |
| `player.setTeam`               | {target, teamIndex}                                  | Sets target's team                                                  |                                                                 |
| `player.setMinigame`           | {target, index}                                      | Adds target to minigame at index                                    |                                                                 |
| `player.setScore`              | {target, minigameIndex, score}                       | Sets target's score in minigame                                     |                                                                 |
| `player.getScore`              | target (string)                                      | Gets target's score in minigame                                     | number                                                          |
| `player.setLeaderboard`        | {target, key, value}                                 | Sets leaderboard value for target                                   |                                                                 |
| `player.getLeaderboard`        | target (string)                                      | Gets leaderboard value for target                                   | number or null                                                  |
| `plugin.get`                   | target (string)                                      | Gets info on the target plugin                                      | Object                                                          |
| `plugin.emit`                  | [target (string), event (string), ...args (any)]     | Emit a custom event to the target plugin                            |                                                                 |

## Plugin Methods (You implement these)

| Method               | Arguments                                                                                                                        | Description                                                                                                                                                                          | Required |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `init`               | config object                                                                                                                    | Returns a start result, called on plugin start                                                                                                                                       | &#9745;  |
| `stop`               | _none_                                                                                                                           | Returns _something_, called on plugin stop                                                                                                                                           | &#9745;  |
| `bootstrap`          | [{ omegga info (`host`, `version`, etc) }]                                                                                       | Run when plugin is started for base data                                                                                                                                             |          |
| `plugin:players:raw` | [[... [player `username`, `displayName`, `id`, `controller`, `state`]]]                                                                             | Lists players on the server                                                                                                                                                          |          |
| `plugin:emit`        | [event, from, ...args]                                                                                                           | Fired when another plugin sends an event                                                                                                                                             |          |
| `line`               | [brickadiaLog string]                                                                                                            | A brickadia console log                                                                                                                                                              |          |
| `start`              | [{map}]                                                                                                                          | On brickadia server start                                                                                                                                                            |          |
| `host`               | [{name, id}]                                                                                                                     | When the host is detected                                                                                                                                                            |          |
| `version`            | [-1 or the CL number]                                                                                                            | When the version is detected                                                                                                                                                         |          |
| `unauthorized`       | _none_                                                                                                                           | On brickadia server fails an auth check                                                                                                                                              |          |
| `join`               | [{name, id, state, controller}]                                                                                                  | Run when a player joins                                                                                                                                                              |          |
| `leave`              | [{name, id, state, controller}]                                                                                                  | Run when a player leaves                                                                                                                                                             |          |
| `cmd:command`        | [playerName, ...args]                                                                                                            | Runs when a player runs a `/command args`                                                                                                                                            |          |
| `chatcmd:command`    | [playerName, ...args]                                                                                                            | Runs when a player runs a `!command args`                                                                                                                                            |          |
| `chat`               | [playerName, message]                                                                                                            | Runs when a player sends a chat message                                                                                                                                              |          |
| `interact`           | {brick_asset: string;player: { id: string; name: string; controller: string; pawn: string };position: [number, number, number];} | Runs when a player clicks a brick with an interact component. `data` is parsed JSON if `line` (from interact component) starts with "json:{"your": "json"}`. Uses interact log field |          |
| `event:NAME`         | [&gt;player from click&lt;, ...args]                                                                                             | Runs when an interact component has `event:NAME: arg1,arg2,arg\,3,                                                                                                                   |          |
| `mapchange`          | \[{map}\]                                                                                                                        | Runs when the map changes                                                                                                                                                            |          |
| `autorestart`        | [autorestart config]                                                                                                             | Runs server has an autorestart scheduled                                                                                                                                             |          |
| `minigamejoin`       | {player: {name, id}; minigameName: string}                                                                                       | **Deprecated as of EA3.** Runs when a player joins a minigame. Note that minigameName is not unique between minigames. minigameName will be null if player leaves all minigames. This will run before `join` |          |
| `wirelog`            | [raw string]                                                                                                                     | Runs when a `[Wire Graph]` log line is emitted. `raw` is the text after the `[Wire Graph] ` prefix                                                                                    |          |
| `wirecmd:command`    | [...args]                                                                                                                        | Runs when a `[Wire Graph]` log starts with `command args`. `command` is lowercased; args are the remaining space-separated words                                                     |          |

## Folder Structure

In a `plugins` directory create the following folder structure:

- `plugins/myPlugin` - plugin folder (required)
- `plugins/myPlugin/doc.json`
- `plugins/myPlugin/omegga_plugin` - executable plugin file (required)

## `omegga_plugin` (example, node javascript)

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

## See also

- [Plugin structure](../plugins/) for `doc.json`, `plugin.json`, config, and the store
- [Events](../api/events.md) for what each event carries
- [Plugin metrics](../metrics.md#plugin-metrics) for exporting your own Prometheus metrics
