# API

What a plugin can reach. The [Omegga](omegga.md), [Player](player.md),
[Plugin](plugin.md), and [Types](types.md) pages are generated from the
declarations in [`src/plugin.ts`](https://github.com/brickadia-community/omegga/blob/master/src/plugin.ts),
which is also what ships as `omegga.d.ts` for typescript plugins.

| | |
| --- | --- |
| [Omegga](omegga.md) | the server: players, bricks, saves, chat, minigames |
| [Player](player.md) | one player: position, roles, paint, clipboard |
| [Plugin](plugin.md) | what a plugin class implements, and its `config`, `store`, and `metrics` |
| [Events](events.md) | what omegga emits as the server runs |
| [Types](types.md) | the shapes the above return |
| [Log parsing](log-parsing.md) | reading console output omegga does not already parse |

[JSON RPC plugins](../plugins/jsonrpc.md) reach the same functionality through
method names rather than these interfaces; that page has its own table.

Save data is [brs-js](https://github.com/brickadia-community/brs-js#save-object)
`SaveData`.
