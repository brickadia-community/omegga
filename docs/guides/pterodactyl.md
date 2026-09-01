# Pterodactyl

[Pterodactyl](https://pterodactyl.io/) runs game servers as Docker containers
managed by a web panel. An egg tells it how to install and run one.
[`docker/pterodactyl/egg-omegga.json`](https://github.com/brickadia-community/omegga/blob/master/docker/pterodactyl/egg-omegga.json)
in this repository is that egg for Omegga.

It runs the published image, so Omegga updates by changing the image tag rather
than reinstalling. Brickadia is not in the image; Omegga downloads it through
steamcmd on first start, into the server's own volume.

Setting one up takes three steps:

1. [Import the egg](#importing-the-egg) into a nest.
2. [Create a server](#creating-a-server) from it, with two allocations.
3. [Set a hosting token](#the-hosting-token)

## Importing the egg

The panel has no CLI or API for importing eggs, so this is a UI operation:

1. Download the egg [here](https://raw.githubusercontent.com/brickadia-community/omegga/master/docker/pterodactyl/egg-omegga.json) or with `curl`:

   ```sh
   curl -LO https://raw.githubusercontent.com/brickadia-community/omegga/master/docker/pterodactyl/egg-omegga.json
   ```

2. **Admin > Nests > Import Egg**
3. Upload `egg-omegga.json` and pick a nest (create a "Brickadia" nest if you
   do not have one).

Both `PTDL_v1` and `PTDL_v2` are accepted by current panels; this egg is
`PTDL_v2`.

## Creating a server

Omegga needs **two ports**, so the server needs two allocations:

| Allocation | Protocol | Used for |
|---|---|---|
| primary | UDP | Brickadia. `SERVER_PORT` drives `BRICKADIA_PORT` |
| second | TCP | the Omegga web UI. Set `OMEGGA_PORT` to this port |

Wings publishes each allocation on both TCP and UDP, so one allocation per
number is enough. They cannot share a number: Brickadia reports its configured
port to the master server, so the published port has to be the port it runs on.

Assign both on the server's **Network** tab, then set `OMEGGA_PORT` on the
**Startup** tab to the second one. The egg cannot do this for you: an egg
variable can hold a port number but cannot create the allocation.

Give the server at least 2-4 GB of disk for the Brickadia install, plus room
for worlds and plugins. The node has to be declared large enough in the panel
too, or the server cannot be placed on it.

### The hosting token

`BRICKADIA_TOKEN` is required. Generate one at
<https://brickadia.com/account/tokens> and paste it into **Brickadia hosting
token** on the Startup tab.


Once authentication succeeds the token is stored in the volume
(`.config/omegga/global_auth_token`), so it survives restarts and reinstalls of
the container. The egg adds that path to the file denylist to keep it out of
the file manager.

## Variables

| Variable | Default | Notes |
|---|---|---|
| `BRICKADIA_TOKEN` | none | Required. Hosting token from brickadia.com/account/tokens |
| `OMEGGA_PORT` | `8080` | Web UI port; must match a second allocation |
| `OMEGGA_FLAGS` | empty | Extra flags: `--update`, `--verbose`, `--debug` |
| `METRICS_ENABLED` | `false` | Prometheus endpoint; needs a third allocation |
| `METRICS_BIND` | `0.0.0.0` | Must be `0.0.0.0` to be reachable outside the container |
| `METRICS_PORT` | `9000` | Metrics port |
| `PUID` | `0` | Do not change; see [Why `PUID=0`](#why-puid0) |
| `OMEGGA_NONINTERACTIVE` | `true` | Hidden. Refuse auth prompts the console cannot answer |
| `SKIP_STEAMCMD_PROMPT` | `true` | Hidden. Do not change |
| `PACKAGE_NOTIFIER` | `false` | Hidden. Omegga comes from the image, not npm |
| `STEAM_NOTIFIER` | `false` | Hidden |

`--update` in `OMEGGA_FLAGS` checks Steam for a Brickadia update on every
start. It keeps the game current at the cost of not starting at all when Steam
is unreachable.

Debug logging goes through `OMEGGA_FLAGS=--debug`, not the `BRICKADIA_DEBUG`
environment variable. Omegga treats that variable as set-or-unset, so the
string `"false"` would enable it, and Pterodactyl materialises every declared
variable into the environment, with no way to leave one unset.

## Ports in the config file

The egg drives ports through `BRICKADIA_PORT` and `OMEGGA_PORT` in the
environment, which override `omegga-config.yml`. It also keeps the two port
keys in the file itself in sync with the allocations, so the web UI and
`omegga info` report the ports the server is really on.

Everything else in `omegga-config.yml` is yours: edit it from the file manager
or the web UI. The egg only touches `server.port` and `omegga.port`.

## Web UI over HTTPS

Omegga's web UI defaults to `https` with a self-signed certificate, so browsers
warn on first visit. To use a real certificate, put a reverse proxy in front of
the allocation and see [HTTPS with a real certificate](https.md).

## Stopping

The egg stops the server by sending `SIGINT` (`^C`), which Omegga handles
gracefully. Its startup is considered complete when it logs
`Server has started`.

## Limitations

- The published image is **amd64 only**. Omegga will not run on ARM nodes.
- SFTP reaches the server volume, but the Brickadia install lives in `$HOME`
  inside the same volume and is large; avoid syncing it wholesale.
- The first start downloads Brickadia before the server becomes usable. The
  console shows steamcmd progress during this; it is not stuck.

## Why `PUID=0`

Wings runs an egg's install script as the install image's **own default user**,
and mounts the script from a root-owned `0700` directory. The Omegga image's
entrypoint drops privileges to its unprivileged `steam` user, which then cannot
read the script:

```
bash: /mnt/install/install.sh: Permission denied
```

`PUID=0` tells the entrypoint not to drop, which is the documented way to keep
it as root (see [Containers](../containers.md#file-ownership)).

It has no effect on the server container. Wings sets the container user
explicitly there, so the entrypoint sees a non-root uid and execs straight
through without reading `PUID` at all. Wings also chowns the server volume to
that user on start, so the root-owned files the install script leaves behind
are corrected before Omegga ever runs.

The entrypoint's Pterodactyl branch deliberately does not apply here: install
scripts arrive as an explicit `bash /mnt/install/install.sh` with `STARTUP` set
as well, and have to run as given rather than being replaced by the startup
command.
