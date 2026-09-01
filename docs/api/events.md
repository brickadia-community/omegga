# Events

Omegga reads console logs and emits events. Plugins hook these and run their own
code in reaction.

| Event | Arguments | Trigger |
| --- | --- | --- |
| `*` | `event`, `...args` | Any event is emitted |
| `line` | `line` | A line of Brickadia console output |
| `closed` | _none_ | The Brickadia server process closed |
| `exit` | _none_ | The Brickadia server exited |
| `start` | `{map}` | The server finished auth |
| `host` | `{id, name}` | The host was detected on server start |
| `version` | `version` | The game CL was detected |
| `unauthorized` | _none_ | The server failed an auth check |
| `mapchange` | `{map}` | The map changed |
| `autorestart` | [`AutoRestartConfig`](types.md#autorestartconfig) | An autorestart is scheduled |
| `server:starting` | _none_ | Omegga is starting the game |
| `server:stopping` | _none_ | Omegga is stopping the game |
| `server:stopped` | _none_ | The game stopped |
| `join` | [`OmeggaPlayer`](player.md) | A player joined |
| `leave` | [`OmeggaPlayer`](player.md) | A player left |
| `kick` | `name`, `kicker`, `reason` | A player was kicked |
| `ban` | `name`, `kicker`, `reason`, `duration` | A player was banned |
| `chat` | `name`, `message` | A player sent a chat message |
| `cmd` | `command`, `name`, `...args` | A player ran `/command args`. `command` is lowercased, `args` are the remaining space-separated words |
| `cmd:command` | `name`, `...args` | Same, with the command built into the event name |
| `chatcmd` | `command`, `name`, `...args` | Same as `cmd`, for `!command` |
| `chatcmd:command` | `name`, `...args` | Same as `cmd:command`, for `!command` |
| `interact` | [`BrickInteraction`](types.md#brickinteraction) | A player clicked a brick with an interact component |
| `event:NAME` | `player`, `...args` | An interact component's message was `event:NAME:arg1,arg2`. Escape a literal comma as `\,` |
| `wirelog` | `raw` | A `[Wire Graph]` log line, without the prefix |
| `wirecmd` | `command`, `...args` | A `[Wire Graph]` log that starts with `command args` |
| `wirecmd:command` | `...args` | Same, with the command built into the event name |
| `minigamejoin` | `{player: {name, id}, minigameName}` | **Deprecated as of EA3.** A player joined a minigame. `minigameName` is not unique, and is null when the player leaves all minigames. Runs before `join` |
| `plugin:players:raw` | `string[][]` | Players joined or left. Raw player info, so RPC plugins can track who is online |
| `plugin:status` | `name`, `plugin` | A plugin loaded, unloaded, started, or stopped |

## Node plugin usage

The [Omegga](omegga.md) object is an event emitter with an `Omegga.on(event, fn)`
that returns the `Omegga`, so calls chain.

```js
Omegga.on('start', () => {
  // run on server start
});
```

```js
Omegga
  .on('chatcmd:ping', (name, ...args) => {
    Omegga.broadcast(`pong @ ${name} + ${args.length} args`);
  })
  .on('chatcmd:pos', async name => {
    const [x, y, z] = await Omegga.getPlayer(name).getPosition();
    Omegga.broadcast(`<b>${name}</> is at ${x} ${y} ${z}`);
  });
```

Deregister with `Omegga.off('name', fn)` or `Omegga.removeAllListeners('name')`.
**Be careful with `removeAllListeners` on non-cmd events**, as it can deregister
omegga's own.

[Node VM plugins](../plugins/safe.md) do not need to clean up, because the VM
goes away with the plugin. [Node plugins](../plugins/unsafe.md) do:

```js
class Plugin {
  constructor(omegga) {
    this.omegga = omegga;

    // bind, or `this.foo()` inside exampleCallback will throw
    this.exampleCallback = this.exampleCallback.bind(this);
  }

  init() {
    this.omegga
      .on('chatcmd:ping', /* code */)
      .on('chat', this.exampleCallback);
  }

  exampleCallback() { /* code */ }

  stop() {
    this.omegga
      .removeAllListeners('chatcmd:ping')
      .off('chat', this.exampleCallback);
  }
}
```

## RPC plugin usage

[RPC plugins](../plugins/jsonrpc.md) receive events as methods of the same name,
with all arguments in an array.

```js
// ping command
rpc.addMethod('chatcmd:ping', ([name, ...args]) => {
  rpc.notify('broadcast', `pong @ ${name} + ${args.length} args`);
});

// player position command
rpc.addMethod('chatcmd:pos', async ([name]) => {
  const [x, y, z] = await getPlayerPos(name);
  rpc.notify('broadcast', `<b>${name}</> is at ${x} ${y} ${z}`);
});
```
