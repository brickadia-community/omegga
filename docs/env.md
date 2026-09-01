# Environment Variables

These can be set in your shell or in a `.env` file the same directory as a `omegga-config.yml` file.

`omegga` accepts the following environment variables:

- `BRICKADIA_TOKEN` - Specify hosting token instead of using config (generate one at https://brickadia.com/account/tokens)
- `BRICKADIA_USER` - Brickadia auth username (on first start)
- `BRICKADIA_PASS` - Brickadia auth password (on first start)
- `BRICKADIA_PORT` - Brickadia server port (default `7777`); overrides `server.port` from the config
- `OMEGGA_PORT` - omegga webserver port (default `8080`); overrides `omegga.port` from the config
- `OMEGGA_UI_HOST` - host shown in the "Web UI available at" log message (default `127.0.0.1`)
- `METRICS_ENABLED` - Serve the prometheus metrics endpoint; overrides `metrics.enabled` from the config
- `METRICS_BIND` - Address the metrics endpoint binds to (default `127.0.0.1`); overrides `metrics.bind`
- `METRICS_PORT` - Metrics endpoint port (default `9000`); overrides `metrics.port`
- `BRICKADIA_DIR` - Override the need to use steamcmd and point to a Brickadia install directory (eg. `/home/<USER>/.config/omegga/steam_installs/main/Brickadia`)
- `STEAM_INSTALLS_DIR` - Set where omegga installs brickadia via steamcmd (default `~/.config/omegga/steam_installs`)
- `STEAM_APP_ID` - Set the Steam App ID for Brickadia (default `3017590`)
- `STEAM_USERNAME` - Set the Steam username for downloading Brickadia via steamcmd. Run `omegga steamlogin` to authenticate with Steam Guard
- `STEAM_PASSWORD` - (Optional) Steam password; if not set, you will be prompted interactively
- `VERBOSE` - Set to `true` to enable verbose logging, equivalent to the `--verbose` flag (default `false`)
- `PACKAGE_NOTIFIER` - When set to `false`, disables the npm update notifier
- `STEAM_NOTIFIER` - When set to `false`, disables the SteamCMD update notifier
- `SKIP_STEAMCMD_PROMPT` - When set to `true`, agrees to installing SteamCMD without prompting
- `BRICKADIA_DEBUG` - Set to `true` to enable debug logging, equivalent to the `--debug` flag (default `false`)
- `OMEGGA_NONINTERACTIVE` - Set to `true` to fail instead of prompting for authentication. Defaults to `true` when stdin is not a terminal; set it explicitly on hosts that provide a terminal that cannot answer a prompt, such as a game panel console that only submits whole lines
