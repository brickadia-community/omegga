# Configuration

- CLI config via `omegga config`
- Omegga config is located in a generated `omegga-config.yml`
- Plugin config is managed inside the web-ui's plugins tab.
- Plugin config can also be set with `omegga set-config pluginName configName configValue`
- Plugin config can be fetched with `omegga get-config pluginName`

Every field can also be set with an [environment variable](env.md), which wins
over the file.

Example available `omegga-config.yml` fields

```yaml
omegga:
  port: 8080
  webui: true
  https: true
  debug: false
credentials:
  token: # hosting token can go here instead of global config
  # if you are hosting servers for multiple people
server:
  port: 7777
  map: Plate
  # Specifying a branch will use the old launcher instead of SteamCMD
  # This does not have full auto-updater support yet, though the game will update every time it is restarted
  # branch: release:release-server
terminal:
  # prepend timestamps to terminal output using dateformat syntax
  # see https://www.npmjs.com/package/dateformat for format options
  # timestamp: "HH:MM:ss"             # 14:05:30
  # timestamp: "yyyy-mm-dd"           # 2026-03-10
  # timestamp: "yyyy-mm-dd HH:MM:ss"  # 2026-03-10 14:05:30
  # timestamp: "HH:MM"                # 14:05
  # timestamp: "hh:MM:ss TT"          # 02:05:30 PM
  # timestamp: "[HH:MM:ss]"           # [14:05:30]
```

Note: `BRANCH-server` branches download only server data

## Every field

Default config values, including the ones the generated file leaves out:

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
  # when false, the server launches with -NoRemoteFileAccess
  remoteFiles: true
  # When branch is present, steamcmd is not used. This is for ALPHA only, and Omegga may not work for Brickadia A5 anymore.
  #branch: release:release-server # branch alias:branch name
  steambeta: public # try `unstable`
terminal:
  # prepend timestamps to terminal output (see https://www.npmjs.com/package/dateformat)
  #timestamp: "HH:MM:ss" # e.g. 14:05:30, "[HH:MM:ss]" for [14:05:30]
metrics:
  enabled: false # serve a prometheus metrics endpoint
  bind: 127.0.0.1 # address to bind (the endpoint is unauthenticated by default)
  port: 9000 # metrics port
  path: /metrics # url path to serve on
  #token: hunter2 # when set, scrapes must send `Authorization: Bearer <token>`
  defaultMetrics: true # export standard process_/nodejs_ metrics for omegga
  statusMaxAge: 15 # seconds before a scrape refreshes the cached server status
  plugins: true # let plugins register their own metrics
```

The [metrics](metrics.md) section is documented in full on its own page.
