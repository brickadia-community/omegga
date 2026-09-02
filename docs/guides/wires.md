# In-game wire integration

Circuits and plugins each know things the other cannot reach. A circuit reacts
within a tick, keeps running when no plugin is loaded, and can see every brick
and entity it is wired to. A plugin outlives the world, holds a database, talks
to the network, and remembers every player who has ever joined. Neither can do
the other's job.

The server console log joins the two. A circuit prints a line and omegga turns
it into an event; omegga writes a chat command and a circuit's handler fires.
Both directions are plain text, so the only thing the two sides have to agree on
is the wording of the line.

The in-game examples here are written in
[Wirescript](https://wirescript.brickadia.dev/), which compiles to circuits, but
nothing below depends on it. `PrintToConsole` is the **Print to Console** gate
and `on ChatCommand` is the **Chat Command** event gate, so a hand-wired circuit
integrates exactly the same way. Internally the game calls a circuit a wire
graph, which is why its log lines and omegga's event names say so.

## The two directions

| Direction | In the circuit | In the plugin |
| --- | --- | --- |
| circuit to plugin | `PrintToConsole("shop.buy alice sword")` | `wirecmd:shop.buy` fires with `'alice'`, `'sword'` |
| plugin to circuit | `on ChatCommand("shopgrant")` fires | `writeln('Chat.Command /shopgrant alice sword')` |

## From a circuit to a plugin

The Print to Console gate writes its text to the server log behind a
`[Wire Graph]` tag:

```
[2026.09.01-00.25.19:276][18]LogBrickadia: [Wire Graph] shop.buy alice sword
```

Omegga turns every such line into three [events](../api/events.md):

| Event | Arguments for the line above |
| --- | --- |
| `wirelog` | `'shop.buy alice sword'` |
| `wirecmd` | `'shop.buy'`, `'alice'`, `'sword'` |
| `wirecmd:shop.buy` | `'alice'`, `'sword'` |

```js
Omegga.on('wirecmd:shop.buy', (userId, item) => {
  console.log(userId, 'wants a', item);
});
```

How a line becomes arguments:

- **The command word is lowercased, the arguments are not.** Everything up to
  the first space is the command, folded to lower case; the rest is passed
  through verbatim.
- **There is no quoting.** The rest of the line is split on spaces and that is
  all. `PrintToConsole("say hello world")` arrives as two arguments, not one.
  Keep values space-free, or listen on `wirelog` and parse the line yourself.
- **A trailing space produces one empty argument.** `"probe.id "` arrives as
  `wirecmd:probe.id` with `['']`, which is what an interpolated value that
  turned out to be empty looks like.
- **Dots are allowed in a command word.** A `shop.` prefix keeps a build's
  commands from colliding with another plugin's, and `wirecmd:shop.buy` is a
  perfectly good event name.

`wirelog` is the escape hatch for anything that is not command-shaped: a JSON
blob, a fixed-width status line, or a value you want whole rather than split.

## From a plugin to a circuit

`Chat.Command` runs a slash command as the server, which fires the Chat Command
event gate in any loaded circuit that registered that name:

```js
Omegga.writeln(`${Omegga.Console.Chat.Command} /shopgrant ${userId} ${item}`);
```

Use `Omegga.Console.Chat.Command` rather than a literal string. The game renamed
its console commands with a `br.` prefix, and
[`Console`](../api/omegga.md#omeggalike) resolves whichever name the running
version wants.

What to expect from it:

- **The controller is empty.** When a player types the command, the gate's
  `controller` output is that player. When the server issues it, nothing is
  bound, and `GetUserId()` and `GetUserName()` both return empty strings. If the
  circuit needs to know who it is acting for, pass the id as an argument.
- **The argument string arrives whole.** The gate's `arguments` output is
  everything after the command name as a single string, so the circuit splits it
  itself with `Split(" ")`.
- **Quote an argument to preserve its spacing.** Unquoted, runs of whitespace
  collapse to one space and the ends are trimmed. Quoted, the spacing survives,
  though the quotes themselves are stripped before the circuit sees the string.
  Escape any `"` and `\` inside the value.
- **Nothing reports failure.** A command no circuit registered logs
  `Command x does not exist` in the game log, but omegga only raises
  `unknownCommand` for commands a *player* typed, so a plugin's own writes fail
  silently. Lines of 512 characters or more are refused by omegga with a warning
  and never reach the game, and the `Chat.Command /name ` prefix counts toward
  that.

## Both halves see the same slash command

A command a circuit registers is an ordinary chat command, so when a player
types `/buy sword` the circuit's handler and omegga's
[`cmd:buy`](../api/events.md) event both fire, off the same keystroke and with
no ordering guarantee between them. That is useful when the plugin wants to log
or rate-limit what the build is doing, and a nuisance when two handlers each
think they own the command. Pick one owner per name.

Commands the server issues itself do not produce that log line, so a plugin
writing `Chat.Command` never triggers its own `cmd:` handler and cannot loop.

## A shop terminal

Split down the middle: the circuit owns the doors and the props, the plugin owns
the wallet. The wallet has to be a plugin, because a balance must survive a
server restart and a circuit's variables do not.

The round trip is four hops. A player runs `/buy sword`, the circuit asks omegga
whether they can afford it, omegga takes the money, and the circuit delivers.

### The circuit

Custom events do the fan-out inside the circuit. `SendCustomEvent` names a
channel and carries up to eight typed values to every matching
`on CustomEvent` receiver, which keeps the console-facing code separate from the
code that acts on the result.

```wirescript
/// Shop terminal: the circuit runs the doors, an Omegga plugin runs the wallet.

// Who asked for what, keyed by the buyer's persistent user id. Omegga answers
// by id, and this is how that answer finds its way back to a player.
var pending: Map<string, controller>

// A player types `/buy sword`. Park them and hand the request to the till.
on ChatCommand("buy", "Buy an item from the shop") -> (buyer, arguments) {
  let id = buyer.GetUserId()
  pending.set(id, buyer)
  SendCustomEvent("shop.request", id, arguments)
}

// The till speaks to Omegga: one line, command word first, space separated.
on CustomEvent("shop.request") -> (id: string, item: string) {
  PrintToConsole("shop.buy ${id} ${item}")
}

// Omegga answers `Chat.Command /shopgrant <userid> <item>` once it has taken
// the money. Anything it refuses, it whispers about itself.
on ChatCommand("shopgrant") -> (_, arguments) {
  let parts = arguments.Split(" ")
  if parts.Found {
    SendCustomEvent("shop.dispense", parts.Left, parts.Right)
  }
}

// The dispenser, kept separate from the parsing above so the same delivery
// runs whether the grant came from Omegga or a test button on the build.
on CustomEvent("shop.dispense") -> (id: string, item: string) {
  let g = pending.get(id)
  if g.Found {
    g.Value.ShowChatMessage('bought <b>${item}</>')
    pending.remove(id)
  }
}
```

`pending` is what makes the reply routable. Omegga answers with a user id
because that is the only player handle that survives the trip through text, and
the map turns it back into the `controller` the circuit needs.

Item names have to be single words here, for the reason given above: the circuit
passes `arguments` through to the console line unexamined, so a `/buy long
sword` would reach the plugin as two arguments rather than one item. A shop with
multi-word items would validate the name in the circuit, or send an item index
instead of a name.

### The plugin

```ts
import OmeggaPlugin, { OL, PS, PC } from 'omegga';

type Config = { currency: string };
type Storage = Record<`balance.${string}`, number>;

// what the shop stocks, and what each item costs
const PRICES: Record<string, number> = { sword: 10, shield: 25, potion: 3 };

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;

  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
  }

  // `shop.buy <userid> <item>`: the circuit is asking whether this player can
  // afford the item. The wallet lives here because it has to survive a restart.
  async onBuy(userId: string, item: string) {
    const price = PRICES[item];
    if (price == null) {
      this.omegga.whisper(userId, `the shop does not stock <b>${item}</>`);
      return;
    }

    const key = `balance.${userId}` as const;
    const balance = (await this.store.get(key)) ?? 0;
    if (balance < price) {
      this.omegga.whisper(
        userId,
        `<b>${item}</> costs ${price} ${this.config.currency}, you have ${balance}`,
      );
      return;
    }

    await this.store.set(key, balance - price);

    // hand it back to the circuit: this fires `on ChatCommand("shopgrant")`
    this.omegga.writeln(
      `${this.omegga.Console.Chat.Command} /shopgrant ${userId} ${item}`,
    );
  }

  async init() {
    this.omegga.on('wirecmd:shop.buy', (userId, item) => {
      this.onBuy(userId, item).catch(err =>
        console.error('shop.buy failed:', err),
      );
    });
  }

  async stop() {}
}
```

Refusals are whispered straight from the plugin rather than handed back to the
circuit, because the plugin already has chat and the circuit would only be
relaying. `whisper` resolves a user id and quietly does nothing if the player has
left, so a player who disconnects mid-purchase needs no special case.

### The trace

One `/buy sword`, with the buyer's user id written as `alice` rather than the
uuid it really is:

```
         player types /buy sword
circuit  on ChatCommand("buy")            send shop.request
circuit  on CustomEvent("shop.request")   PrintToConsole("shop.buy alice sword")
    log  LogBrickadia: [Wire Graph] shop.buy alice sword
 plugin  wirecmd:shop.buy                 10 taken from alice's balance
 plugin  writeln(Chat.Command /shopgrant alice sword)
circuit  on ChatCommand("shopgrant")      send shop.dispense
circuit  on CustomEvent("shop.dispense")  ShowChatMessage, clear pending
```

Every step but the two `log`/`writeln` hops stays inside its own half, which is
what makes each half testable on its own.

## Practical notes

**Custom events cost a tick.** An `on CustomEvent` receiver fires on the tick
*after* its `SendCustomEvent` runs, so each hop through a channel adds one
frame. That is invisible next to the console round trip, which is at minimum a
frame out and a frame back plus however long the plugin takes, but it matters if
a circuit fans a value through several channels before printing it.

**Print deliberately.** Every Print to Console gate writes to the server log on
every execution. A gate inside a Clock handler or on a per-tick chain will fill
the log and give omegga a line to parse each time. Print on state changes, not
on ticks.

**The log is not private.** Anything a circuit prints lands in the server log and
reaches every plugin listening on `wirelog`. Send ids and item names, not
anything you would not want another plugin to read.

**Test the plugin half without the game.** Both directions are text, so a
handler registered on `wirecmd:shop.buy` can be driven straight from a test by
emitting the event, and the outgoing side is just a string handed to `writeln`.

## See also

- [Events](../api/events.md) for `wirelog`, `wirecmd`, `interact`, and `event:NAME`
- [Log parsing](../api/log-parsing.md) for matchers and watchers, when a console
  line needs handling that `wirecmd` does not cover
- [Node VM plugins](../plugins/safe.md) for the plugin scaffolding the example omits
- [Wirescript docs](https://wirescript.brickadia.dev/) for the in-game language
