# Log parsing

To tackle the issue of parsing brickadia console logs, the LogWrangler was created. It wrangles logs into a manageable form. 

It's important to note that some console commands will take longer to run when there are more players on the server and some watchers may time out or run slower.

## Terminology

|Term|Definition|
|-|-|
|Pattern|A function or [Regex](https://en.wikipedia.org/wiki/Regular_expression) that matches a brickadia server log|
|Matcher|Given a pattern and a callback, a matcher will execute the callback every time a log matches the pattern|
|Watcher|Given a pattern, a watcher will wait for a log to match the pattern and resolve with the matched line|
|Log Line|A line of the brickadia server log|
|Log Chunk|A block of logs that match the same pattern with incremental indices|
|Log Array|A LogChunk with items after each matched chunk line|

## Watch Log Chunk

When running console commands, it's helpful to be able to parse large blocks of uniform data. The `Omegga.watchLogChunk(cmd, pattern, options)` method does just that.

This method is a helper method for a [watcher](#watchers).

If nothing is matched within the configured time, the promise rejects. Otherwise, it resolves with an array of the matched results.

Check out the [commandInjector](https://github.com/brickadia-community/omegga/blob/master/src/omegga/commandInjector.js) for some example usage of `watchLogChunk` and `watchLogArray`.

### `Omegga.watchLogChunk(cmd, pattern, options) -> Promise<Array<Results>>`

### Arguments

|Name|Type|Description|
|-|-|-|
|cmd|`string`|Brickadia console command to run|
|pattern|`RegExp` or `function`|returns non-null or matches when a log line is matched. The result is the added to the promise result|
|options|`object`|Options to configure the watcher|


### Options

Options are an object of `{optionName: optionValue}` based on the below table.

|Name|Type|Default|Description|
|-|-|-|-|
|`first`|`string` or `function`|_none_|Determines if this is the first log line in the log chunk. If `first` is set to `'index'`, the chunk will start when the `index` capture group of the `pattern` argument is `'0'`. If `first` is a function, the chunk will start when the function returns true|
|`last`|`function`|_none_|Same as `last` option in `addWatcher` (below)|
|`afterMatchDelay`|`number`|`10`|Same as `afterMatchDelay` option in `addWatcher` (below)|
|`timeoutDelay`|`number`|`100`|Same as `timeoutDelay` option in `addWatcher` (below)|

### Example Preferred Console Logs

The following is the result of the console command: `GetAll BRPlayerState PlayerNamePrivate`

    [2021.02.16-23.52.46:582][320]0) BP_PlayerState_C /Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerState_C_2147482508.PlayerNamePrivate = cake
    [2021.02.16-23.52.46:582][320]1) BP_PlayerState_C /Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerState_C_2147482402.PlayerNamePrivate = cake
    [2021.02.16-23.52.46:582][320]2) BP_PlayerState_C /Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerState_C_2147482287.PlayerNamePrivate = cake


## Watch Log Array

Watch Log Array is useful for parsing console output that is multi dimensional (A result for each player, and each result has multiple entries). This method is an extension of Watch Log Chunk.

If nothing is matched within the configured time, the promise rejects. Otherwise, it resolves with an array of the matched results.

Check out the [commandInjector](https://github.com/brickadia-community/omegga/blob/master/src/omegga/commandInjector.js) for some example usage of `watchLogChunk` and `watchLogArray`.

### `Omegga.watchLogArray(cmd, itemPattern, memberPattern) -> Promise<Array>`

### Output Format

```js
[{
  item: /* capture group from the match of itemPattern */,
  members: [
     /* array of capture groups from the match of memberPattern */ 
  ],
}, /* ... */ ]
````

### Arguments

|Name|Type|Description|
|-|-|-|
|`cmd`|`string`|Brickadia console command to run|
|`itemPattern`|`RegExp`|A regex to match the top level items. Must have an `(?<index>)` capture group. Information is extracted via capture groups.|
|`memberPattern`|`RegExp`|A regex to match the bottom level logs. |

### Example Preferred Console Logs

The following is the result of the console command: `GetAll BP_Ruleset_C MemberStates`

**Note:** the two spaces before `  0:` and `  1:` are _tabs_ in the game output.

    [2021.02.16-23.53.27:331][701]0) BP_Ruleset_C /Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_Ruleset_C_2147482516.MemberStates =
    [2021.02.16-23.53.27:331][701]  0: BP_PlayerState_C'/Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerState_C_2147482508'
    [2021.02.16-23.53.27:331][701]  1: BP_PlayerState_C'/Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerState_C_2147482402'
    [2021.02.16-23.53.27:331][701]1) BP_Ruleset_C /Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_Ruleset_C_2147482167.MemberStates =
    [2021.02.16-23.53.27:331][701]  0: BP_PlayerState_C'/Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerState_C_2147482287'

The following code will extract Rulesets (minigames) as items with PlayerStates (clients) as members. `BP_Ruleset_C` no longer exists on current builds; the shape of the parse is what the example is for:

```js
const ruleMembersRegExp = /^(?<index>\d+)\) BP_Ruleset_C (.+):PersistentLevel.(?<ruleset>BP_Ruleset_C_\d+)\.MemberStates =$/;
const playerStateRegExp = /^\t(?<index>\d+): BP_PlayerState_C'(.+):PersistentLevel\.(?<state>BP_PlayerState_C_\d+)'$/;
Omegga.watchLogArray('GetAll BP_Ruleset_C MemberStates', ruleMembersRegExp, playerStateRegExp)
  .then(console.log)
  .catch(console.error)
````

## Matchers

Matchers are used by Omegga to trigger events. You can find the matchers omegga uses in the [src/omegga/matchers](https://github.com/brickadia-community/omegga/tree/master/src/omegga/matchers) directory.

These are less useful for plugins that use existing triggers and more useful for adding new core features to Omegga.

### `Omegga.addMatcher(pattern, callback) -> deregister function`

### Arguments

|Name|Type|Description|
|-|-|-|
|`pattern`|`RegExp` or `function`|returns non-null or matches when a log line is matched. The result is the arguments to the callback|
|`callback`|`function`|Function to run when the pattern matches|

## Watchers

Watchers are used when waiting for something to produce console output.

If nothing is matched within the configured time, the promise rejects.

### `Omegga.addWatcher(pattern, options) -> Promise<Result of Pattern>`

### Arguments

|Name|Type|Description|
|-|-|-|
|`pattern`|`RegExp` or `function`|returns non-null or matches when a log line is matched. The result is the return value of the promise|
|`options`|`object`|Options to configure the watcher|

### Options

Options are an object of `{optionName: optionValue}` based on the below table.

|Name|Type|Default|Description|
|-|-|-|-|
|`timeoutDelay`|`number`|`50`|Milliseconds before the watcher rejects|
|`bundle`|`boolean`|`false`|If bundle is set to true, it returns all matches after the timeout ends rather than resolving (can't be used with delay 0) |
|`debounce`|`bool`|`false`|(used with bundle) Waits extra time after each match before timing out|`afterMatchDelay`|`number`|`0`|(used with debounce) Indicates to run a new timeout after the first match|
|`last`|`function`|_none_|(used with bundle) A function run on the log line. if it returns true, the watcher resolves early|
|`exec`|`function`|_none_|A function run after the watcher is created|

Here is an example options object:

```js
  {
    timeoutDelay: 50,
    bundle: false,
    debounce: false,
    afterMatchDelay: 0,
    exec: () => Omegga.writeln('Chat.Broadcast "Hello"')
  }
```
