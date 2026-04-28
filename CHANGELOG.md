# Changelog

## Latest

Add new changes here as they are implemented

## 1.5.0 - 2026-04-28

- Add configurable terminal timestamps via `terminal.timestamp` in config (uses [dateformat](https://www.npmjs.com/package/dateformat) syntax)
- Refactor config validation to use zod schemas
- Censor credentials and passwords in verbose config logging
- (For Staff) Add `omegga steamlogin` command for interactive Steam Guard authentication
- (For Staff) Steam downloads now use cached credentials (username only); if login fails, automatically prompts for password and Steam Guard code, then retries the download
- (For Staff) `STEAM_PASSWORD` env var is now optional — password is prompted interactively when needed
- Replace `api.steamcmd.net` update checker with local SteamCMD-based `app_info_update` + `app_status`
- Add `/updatecheck` (`/uc`, `/check`) terminal command to check for updates without updating
- Web UI: show update status subheader on server page, spinner on update check button
- Web UI: increase default dashboard widget size
- Add `/exit`, `/quit`, `/close` aliases for `/stop`
- Use game engine's "command does not exist" error for unknown command detection instead of a hardcoded command list

## 1.4.1 - 2026-03-10

- Add crash auto-restart: detect engine crashes via stderr/stdout and automatically restart, with a new "Restart on Crash" toggle in the web UI (default Enabled, may not catch every crash yet)
- Improve SteamCMD error handling: decode `EAppState` flags on update failure and redact credentials from error messages
- Add pluginEvents to unsafe node plugins
- Forward game server stderr as `err` events on the wrapper (used by crash detection)
- Suppress Node.js `DEP0040` deprecation warning in `bin/omegga`

## 1.4.0 - 2026-02-01

- Added `.env` support for loading env into your server. Put it next to your `omegga-config.yml` to be loaded on startup
- Env for steamcmd, `STEAM_USERNAME`, for devs to run omegga on internal builds
- Added `Player.getLeaderboard(key: string): Promise<number>` and `Player.setLeaderboard(key: string, value: integer)` to interact with player leaderboard values
- Added missing player functions to JSONRPC plugins
- Updated vm2 to 3.10.3. This includes **tiny breaking changes**, which is why this is a bump from 1.3.0 to 1.4.0
- Note: Promises inside safe plugins are weird imitation Promises that are not `instanceof Promise`

## 1.3.0 - 2025-12-12

- #80 update builtin command list with commands from EA2 (thanks @consoleSkunk)
- #77 support for loadBefore/loadAfter/loadPriority and dependencies for plugins (thanks @Commander Nick)
- #79 switch from webpack to vite for building backend, setup test environment
- **In-game BRS features are effectively deprecated or already removed.** Plugins that readSaveData/loadSaveData/interact with BRS should be considered broken.

## 1.2.9 - 2025-08-05

- Fix player.getPaint having a 1/NumPlayers chance of working

## 1.2.8 - 2025-08-04

- Fix ui crash from linkify-react/linkifyjs violating semantic versioning
- Add more weapon class types (ty pleasant peasant)

## 1.2.7 - 2025-08-03

- Update brs-js to support seats/weights/various components that had strange types

## 1.2.6 - 2025-07-25

- Fix steamcmd install check for archlinux (ty voximity)
- Fix config dir creation (ty banhathome on gh)
- Fix error message on server restore with player saving enabled
- Fix auto restart causing hang when saving world

## 1.2.5 - 2025-07-21

- Added a minimal brdb parser for reading [only] owner data from worlds
- Added a sortable owner section to the world view's side panel

## 1.2.4 - 2025-07-20

- Fix kicking players with web ui crashing omegga

## 1.2.3 - 2025-07-19

- Refactored a lot of `require()`s into imports (and removed some dynamic ones)
- Added env `PACKAGE_NOTIFIER` - When set to `false`, disables the npm update notifier
- Added env `STEAM_NOTIFIER` - When set to `false`, disables the SteamCMD update notifier
- Added env `SKIP_STEAMCMD_PROMPT` - When set to `true`, agrees to installing SteamCMD without prompting
- Omegga now runs with node's builtin `--enable-source-maps` rather than the ancient unmaintained `source-map-support` package

## 1.2.2 - 2025-07-19

- Fix missing displayName meta in web-ui for join messages

## 1.2.1 - 2025-07-19

- Use display names in terminal chat, chat history, and chat widget (hover in the ui for usernames)
- Add display names to name history
- Fix missing auto-scroll in home page chat widget
- Fix styling in login modal
- Type fixes for getPlayers list
- Fix Omegga.saveWorld and Omegga.saveWorldAs erroring when there are no minigames

## 1.2.0 - 2025-07-18

### Web UI
- New Worlds View (with save, load, saveas, load revision, create new, set default world)
- Added Check for Updates to Web UI
- Ported the entire UI from Vue to React
- Added rounded corners everywhere

### Worlds
- Server start and restart load a "default world"
- Removed save bricks/environment/minigames auto restart config
- Added Save World auto restart config

### Updater (SteamCMD only)
- Added a manual and automatic update features to the server view in the Web UI
- Added Automatic check for steam updates on startup

### Terminal
- Added `/restart` - restarts the server without a warning and loads the default world
- Added `/update` - updates the server using SteamCMD
- Added `/worlds use <world>` to set the default world
- `/worlds` commands now actually check for success

## 1.1.2 - 2025-07-16

- Fixes for running in wsl (ty aware!)
- Fix Player.getGhostBrick (ty aware!)
- Fix Player.getTemplateBounds (ty aware!)
- Fix always attempting to install old launcher on startup
- More verbose logging for token checking
- Cleaner launch auth check code

## 1.1.1 - 2025-07-16

- Fixes for launching without steam or brickadia-installer
- Use `BRICKADIA_TOKEN` instead of `BRICKADIA_AUTH_TOKEN` for env based token setups

## 1.1.0 - 2025-07-16

- Drop support for alpha
- Add /worlds terminal command and world apis to Omegga
- Add display names to player data
- Support downloading the server from steamcmd
- Support using the game server binary directly without any launcher
- Support hosting tokens
- Updated for brs v14
- !commands and /commands use player username instead of display name
- Interact components properly use username
- Selector bounds still broken

## 1.0.40 - 2023-12-19

- Another possible fix for web UI login errors (only seems to break on the NPM published versions of omegga?)

## 1.0.39 - 2023-12-19

- Recommend node 20 over node 18
- Bump `ttypescript` to fix TS compilation errors
- Bump `socket.io`, `express`, and `express-session` to fix web UI login errors
- Bump `pem` to fix SSL cert generation errors on node 20
- Fix crashes related to `Player#getPawn()` (@Critical Floof)

## 1.0.38 - 2023-09-10

- brs-js fix for a bug that caused a crash for unexpected negative numbers - by @Critical Floof

## 1.0.37 - 2023-04-23

- Minor fix to some booleans being undefined instead of false

## 1.0.36 - 2023-04-21

- Add support for node extensions in safe plugins (.node extension)

## 1.0.35 - 2023-04-20

- Fix that weird brs-js bug where it would die if your brick color wasn't an array
- Remove the need to install `build-essential` (probably the number one omegga install nuisance)

## 1.0.32 - 2023-03-17

- `npm audit fix` and brs-js update for smaller package size

## 1.0.31 - 2022-12-23

- More updated packages for building with the node 18 migration

## 1.0.30 - 2022-12-16

- Update some packages so building works on node 18, shouldn't have any impact on node 16

## 1.0.29 - 2022-11-21

- Remove `package-lock.json` from `.gitignore` (this means if a dep updates a minor version, it won't update it for us and break/fix anything)

## 1.0.28 - 2022-07-26

- `omegga get-config <pluginName> [configName]` - Gets a config for a plugin. If `configName` is omitted, returns all config values. -Maggiful
- `omegga set-config <pluginName> [configName] [configValue]` - Sets a config for a plugin. If `configValue` is omitted, the config will be reset. If `configName` is omitted, the entire plugin config will be reset. -Maggiful
- Fixes for when server is closed via SIGTERM/SIGINT (Ctrl+C) -Maggiful

## 1.0.27 - 2022-07-17

- `/plugins` command in-game now has case-insensitive searching -Maggiful
- `minigamejoin` event that is fired when a player joins a minigame, leaves a minigame (joins GLOBAL), or spawns -Maggiful
- `getMinigames` now has an `index` on each minigame object (index lookup code by Aware)

## 1.0.26 - 2022-07-03

- Increase typescript plugin code performance by transpiling in production mode
- Make source maps actually work so you can easily tell where code errors from typescript plugins

## 1.0.25 - 2022-06-17

- Fix `Omegga.getEnvironmentData` using wrong tempCounter, causing errors

## 1.0.24 - 2022-05-24

- Add even more logging to safe plugin errors

## 1.0.23 - 2022-05-24

- Add more logging for safe plugin and event errors

## 1.0.22 - 2022-05-24

- Fix Player.setMinigame with -1 index not letting players leave minigames

## 1.0.21 - 2022-05-22

- Attempt to fix timeout error on server save
- Add verbose log to watcher timeout rejection

## 1.0.20 - 2022-05-17

- Adjusted the timeouts for `getTemplateBounds`, `getPaint`, `getGhostBrick` to prevent timeouts before information would be pulled

## 1.0.19 - 2022-05-10

- Add `OMEGGA_UTIL.brick.getAbsoluteSize(brick, brick_assets)`: returns the brick's absolute size, accounting for its orientation

## 1.0.18 - 2022-05-10

- Add display name parser (`convertDisplayName` in `OMEGGA_UTIL.brick`)
- Add `brick_asset` and `brick_size` to BrickInteraction
- Fix `/plugins reload <plugins>` rescanning, not all plugins are being reloaded so we can't rescan

## 1.0.17 - 2022-05-10

- Fix minigames not loading sometimes
- Fix minigames loading out of order

## 1.0.16 - 2022-05-06

- Fix writing saves with unicode in component data

## 1.0.15 - 2022-05-06

- Fix reading saves with unicode in component data

## 1.0.14 - 2022-05-01

- Terminal commands overhaul, plus some new goodies
  - `/plugins install <...plugin names>` installs plugins while the server is running
  - `/plugins load <...plugin names>` loads unloaded/disabled plugins
  - `/plugins unload <...plugin names>` unloads loaded plugins
  - `/plugins reload [...plugin names]` reloads all plugins, or the plugins given
  - `/plugins enable <...plugin names>` enables some plugins
  - `/plugins disable <...plugin names>` disables any enabled/loaded plugins
- Fixed `setup.sh` and `omegga_plugin` not properly having +x file mode

## 1.0.13 - 2022-04-30

- Cache ts-plugin builds for faster plugin loading

## 1.0.12 - 2022-04-29

- Use webpack to bundle typescript safe plugin code. This will let you import typescript files from typescript plugins! Small chance of breaking plugins.

## 1.0.11 - 2022-04-28

- Fix template `.gitignore`s to include `package-lock.json` for node plugins
- Fix rust template scripts (`setup.sh` to build, `omegga_plugin` to point at correct binary)

## 1.0.10 - 2022-04-26

- Add `rust` as a template for `omegga init-plugin`
- Cleanup template internals

## 1.0.9 - 2022-04-25

- Allow write save data to be compatible with read save data output
- Fix OMEGGA_UTIL.time.debounce arg types

## 1.0.8 - 2022-04-24

- player.getScore(minigameIndex)
- player.setScore(minigameIndex, score)
- player.setTeam(teamIndex)
- player.setMinigame(minigameIndex)
- Omegga.getEnvironmentData()
- Omegga.readEnvironmentData(presetName)
- on('interact') now has `message`, `error` (when json fails parsing), `json` (for `json:{"data": "foo"}` in interact)
- on('event:NAME', (player:{id,name}, a, b, c)) for `event:NAME:a,b,c` in interact
- Update brs-js to have new interact fields

## 1.0.7 - 2022-04-20

- Fix loadDataOnPlayer not working on names with spaces

## 1.0.6 - 2022-04-20

- Fix missing `debounce` in `OMEGGA_UTIL.time`

## 1.0.5 - 2022-04-20

- Make plugin-init an alias for init-plugin
- Fix plugin-init cutting off first 7 characters of new plugin name
- Fix null pointer in getMinigames

## 1.0.3 & 1.0.4 - 2022-04-19

- Fix DataCloneError on arrays and objects -aware
- Fix omegga.d.ts trying to dynamically import brs-js
- Add weapon classname autocompletes to giveItem/takeItem
- Remove some no longer needed dependencies

## 1.0.2 - 2022-04-18

- Fix omegga.d.ts not copying (fixes typescript plugin init)

## 1.0.1 - 2022-04-18

- Fix omegga.d.ts not copying (I think)
- Load bricks after environment/minigames

## 1.0.0 - 2022-04-17 [breaking changes]

- **Migrated codebase to TypeScript** (thank you voximity, aware)
- Add support for TypeScript safe plugins (omegga.plugin.ts), transpiles from TypeScript on plugin load. **TypeScript plugins get autocomplete for everything :)**
- Support for saving and clearing regions of bricks
- Support for **uploading bricks to a player's clipboard**
- Player killing and damaging
- Adding/removing items from player inventories
- **Brick click interaction events** (on('interact')) event for bricks with the new interact component
- Environment reset, saving, and loading
- Minigame reset, next round, ending, saving, and loading
- MiddlePrint (`Omegga.middlePrint(target, message)`)
- `Omegga init-plugin` command for generating plugin templates
- **Automatic Server Restarts** with minigame, environment, brick, and player position persistence

## 0.1.85 - 2022-01-18

- Throttle updates on watched json files to fix a playerNameCache bug on player join

## 0.1.84 - 2022-01-10

- Address colors.js FOSS controversy (set colors.js to 1.4.0)

## 0.1.83 - 2021-12-13

- Fix using broken nedb-promises-session-store -aware

## 0.1.82 - 2021-11-03

- Add /back to default command list

## 0.1.81 - 2021-11-03

- Switch from `nedb-promise` to `nedb-promises` & add auto compacting to database -Smallguy
- Fix the "14 vulnerabilities" message
- Fix clearbricks creating an error in some cases

## 0.1.80 - 2021-11-03

- Fix a missing option chain that caused configs without branches to error
- Reduced the number of "Done!" messages on launch&patch

## 0.1.79 - 2021-10-28

- Add getServerStatus, getMinigames, getHostId RPC methods -Zombie_Striker

## 0.1.78 - 2021-10-25

- Fix getSaves rpc method returning wrong values -Zombie_Striker

## 0.1.77 - 2021-10-21

- WSL1 now forces the server to run in single thread mode to avoid freezing when players die/bricks clear/bricks load
- wsl2binds plugin is recommended at server start
- New `wsl` util to detect wsl version (1, 2, or 0 for neither)

## 0.1.76 - 2021-10-14

- Fix version lookup error -voximity
- Fix invalid require in lib

## 0.1.75 - 2021-10-13

- Fixed the safe plugin bug involving a vm2 update, will be auto fixed when they release a newer version
- Omegga.version is now a number (-1 or the CL version #) -x
- Linter changes

## 0.1.74 - 2021-10-13

- Properly close server on auth failed

## 0.1.73 - 2021-10-11

- Auth now uses branch from a config file
- Log which branch is used in verbose mode
- Should be able to run omegga as root (in containers) now with branch `unstable-server`
- Default branch specified in config is now `main-server`

## 0.1.72 - 2021-10-09

- Kick/ban/clearbricks from web ui and terminal
- Space map in map list
- Updated emoji list

## 0.1.71 - 2021-10-07

- Remove broken padding in plugin cli commands

## 0.1.70 - 2021-10-07

- Fix `interactjs` preventing omegga from installing ... round 2

## 0.1.69 - 2021-10-06

- Fix a bug with the `BRICKADIA_PORT` env flag

## 0.1.68 - 2021-10-06

- Use `BRICKADIA_PORT` if it exists on config init for setting brickadia port, also `OMEGGA_PORT` for web ui respectively

## 0.1.67 - 2021-10-06

- Auth via `BRICKADIA_USER` and `BRICKADIA_PASS` env in `omegga` command
- Added `-u` and `-p` to `omegga auth`

## 0.1.66 - 2021-09-30

- Fix `omegga auth` not properly reading arguments
- Fix `omegga auth -l` not having correct location for auth files
- Add `omegga auth -u email -p password`
- Fix `omegga auth --verbose`
- Fix `omegga auth` not properly failing on invalid credentials

## 0.1.65 - 2021-09-30

- Fix in getSaveData -aware
- In `omegga auth` removed `--clean` and `--force` in favor of `--global|-g` to remove global auth files and `--local|-l` to remove local auth files
- Minor plugin cli refactor

## 0.1.64 - 2021-09-07

- Fix invalid git branch check on `omegga update`

## 0.1.63 - 2021-09-07

- js moment

## 0.1.62 - 2021-09-07

- Plugin interop fix for safe plugins
- Plugin install now checks if a folder has a doc.json before complaining about the directory already existing

## 0.1.61 - 2021-08-30

- Plugin interop by voximity
- Plugins can now use `main` branch instead of `master` (mildly untested)
- Fix missing newline at end of `omegga check`

## 0.1.60 - 2021-08-23

- `player.get` and `player.getRoles` rpc methods -vox

## 0.1.58/0.1.59 - 2021-08-22

- `"emitConfig": "fileName.json"` option in `plugin.json` to emit config -vox

## 0.1.57 - 2021-08-21

- voximity added the following methods for RPC plugins (adding room for more performant rust driven plugins):
  - player.getPermissions
  - player.getNameColor
  - player.getPosition
  - player.getGhostBrick
  - player.getPaint
  - player.getTemplateBounds
  - player.getTemplateBoundsData
  - player.loadDataAtGhostBrick

## 0.1.56 - 2021-08-19

- Use brs-js 2.0.0 (may break some plugins)
- Add note about `git` requirement for `omegga install` command

## 0.1.55 - 2021-07-27

- Fix replace static.brickadia's 1.4 launcher with bundled one (same launcher, brickadia.com just doesn't host it anymore)

## 0.1.54 - 2021-06-18

- Fix errors I created

## 0.1.53 - 2021-06-18

- Fix auth page creating errors in console

## 0.1.52 - 2021-06-18

- Fix `omegga install <plugin>`

## 0.1.51 - 2021-06-15

- Fix `getAllPlayerPositions` for dead players -voximity

## 0.1.50 - 2021-05-19

- Add `getPlayerPosition`, `getAllPlayerPositions` to rpc plugin api -voximity

## 0.1.49 - 2021-05-18

- Fix stdio rpc plugins not even loading (oops)
- Add `OMEGGA_UTIL.brs` for access to `brs-js` without needing to require new deps

## 0.1.48 - 2021-04-08

- Fix safe plugins erroring because code was loading as a buffer
- Added `omegga auth --local` to clear auth data in the current omegga data path
- Clearing all auth data can be done with `omegga auth -cl`

## 0.1.47 - 2021-03-31

- Fix `OMEGGA_UTIL` not being available in `require`'d files -aware
- Role type for plugin config -aware

## 0.1.45 - 2021-03-17

- Fix an issue with `omegga install` not working on urls
- Hopefully more helpful errors with node safe plugins

## 0.1.44 - 2021-03-04

- Allow plugins with spaces in their names to load save data
- Fix an unnecessary worker.terminate() in vm plugins

## 0.1.43 - 2021-03-03

- brs-v10 support
- Fixed interactjs's dev breaking his package.json for hundreds of projects

## 0.1.39 - 2021-02-17

- Somewhat fix async errors node vm plugins from creating multiple workers

## 0.1.38 - 2021-02-16

- Fix event emitter warning if you have a LOT of plugins
- Fix store.wipe() not properly wiping all stored items

## 0.1.37 - 2021-02-14

- Updated brs-js, 4x faster reads (12s -> 3s for 2 mil bricks)

## 0.1.36 - 2021-02-14

- Fix postinstall not running after updates

## 0.1.35 - 2021-02-14

- Fix postinstall setup.sh not running

## 0.1.34 - 2021-02-14

- Fix plugin.json validation semver check

## 0.1.33 - 2021-02-14

- New brick utils for rotating groups of bricks, checking brick sizes/bounds, setting brick ownership, etc -aware
- New player methods for getting ghost brick, paint color/material, template bounds, template bricks -aware
- Ability to load bricks at the player's ghost brick (prefabs incoming??) -aware
- New CLI features to install and update plugins without git (`omegga install gh:mraware/fillcan`) -cake
- Update readme with "wsl2 support" (`omegga install gh:meshiest/wsl2binds`) -cake
- Optional `setup.sh` can be provided to be run when a plugin is installed via `omegga install` -cake

## 0.1.32 - 2021-02-05

- Update dependencies to support next brs version

## 0.1.31 - 2021-01-11

- New map detection code (`Omegga.currentMap` field, `mapchange` event, `Omegga.changeMap()` method, `server.map` config option) - aware
- Unsafe plugin fixes for unloading plugins with newly deleted files -aware
- Unsafe plugins can now modify a global `Player` for other unsafe plugins - aware
- Fix list configs wanting to be reset to default despite being default already

## 0.1.30 - 2021-01-06

- New plugin config `list`, `enum`, and `players` option types
- Player search now prioritizes exact match
- NOTE: Plugins that overwrite existing configs with different types may experience issues until the config is re-written

## 0.1.29 - 2021-01-05

- Fix unsafe plugins not disrequiring all dependencies

## 0.1.28 - 2021-01-01

- Fixed linear to sRGB conversion math
- Fixed saveBricks timeouts bugged for no bricks (aware)
- Fixed unsafe plugin commands not properly registering (aware)

## 0.1.27 - 2020-12-31

- Fixed color channel rounding (vox)
- Fixed getSaveData + loadSaveData timing out (aware)
- Add a `/kill` command to kill the server process without closing omegga console
- Minor vm plugin error handing improvements
- `Omegga.config` now available in vm plugins

## 0.1.26 - 2020-12-26

- Added optional return object to plugin `init()` method, allowing the passing of `{registeredCommands: ['foo', 'bar']}` to register commands `/foo`, `/bar`, etc.
- Added custom missing command message
- Added `/plugins` (new `!help`, will replace in the future)
- Renamed the `!help` in `!help` to `/plugins`
- Removed some a4 checks

## 0.1.25 - 2020-12-22

- Fix bans with negative durations not counting as permas
- Allow readSaveData to ignore bricks (when parsing saves)
- Update emoji list for chat parser

## 0.1.24 - 2020-12-22

- Fixed banlist null pointer

## 0.1.23 - 2020-12-21

- Remember that perma bans exist

## 0.1.22 - 2020-12-21

- Fixed issues with `\` and `"` in chat sanitization
- jsdoc for a few main parts of the code
- Banned users filter in web-ui

## 0.1.21 - 2020-12-20

- Now show launcher download progress
- Potentially error codes when auth fails
- Keanu's "auth fixes" which might be placebo (but placebos work)
- DARK MODE on web ui when your OS prefers dark mode
- Also got rid of some a4 garbage

## 0.1.20 - 2020-12-19

- Make omegga only kill the server process when the server "dies for real" rather than "pretending to die" by printing everything a dying server would print

## 0.1.19 - 2020-12-19

- Minor change that increases allowed lag for detecting player position (for people without god hardware)

## 0.1.18 - 2020-12-19

- Fix Omegga.whisper breaking with spaced names (fixes lazyrules bug)

## 0.1.17 - 2020-12-18

- Fix new plugin config fields being non-default when they get added
- Fix `!help plugin` potentially having too-long command lists
- Fix null pointer in plugin errors for plugins missing `doc.json` file (plugins are called "unnamed plugin")

## 0.1.16 - 2020-12-18

- Prevent !help from killing the server

## 0.1.15 - 2020-12-18

- More logging!!!!

## 0.1.14 - 2020-12-18

- Fix permissions on the scripts in `tools/` (breaks on some linuxes)

## 0.1.13 - 2020-12-18

- a5 preparation fixes
- Fix a cache error that cutezyash was having
- Fix an error where the brickadia process didn't always close
