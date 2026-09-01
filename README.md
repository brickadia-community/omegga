# Omegga

**[Documentation](https://omegga.brickadia.dev/)** ·
[Discord](https://discord.gg/UcdwTYhS75)

Omegga wraps [Brickadia](https://brickadia.com/)'s server console to provide interactivity and utility via plugins along with a web interface for managing your server.

Omegga can do things like:

- Automatically update/restart your server
- Manage your worlds from a web interface and load a world on startup/restart
- Chat with players while not on the server
- Read chat history with timestamps
- See kick and ban history
- Configure plugins from a web interface
- Manage permissions and multi-user role based access to the above features on a web ui

Omegga plugins can do things like:

- Interface with in-game wires and react to in-game wire events
- Add custom chat !commands and /commands
- Respond to and send chat messages
- Load bricks onto a player's template
- Load/Clear regions of bricks, entities
- Damage/heal players
- Give/remove weapons to players
- Change the environment
- Teleport players, detect player's positions
- Grant players roles
- Detect when a brick with an interact component is clicked

## Screenshots

[<img src="https://i.imgur.com/AqJF2T0.png" width="256"/>](https://i.imgur.com/AqJF2T0.png)
[<img src="https://i.imgur.com/vGjKoB6.png" width="256"/>](https://i.imgur.com/vGjKoB6.png)
[<img src="https://i.imgur.com/EhT1GBR.png" width="256"/>](https://i.imgur.com/EhT1GBR.png)
[<img src="https://i.imgur.com/PLwgVlx.png" width="256"/>](https://i.imgur.com/PLwgVlx.png)
[<img src="https://i.imgur.com/bCnQ5Pb.png" width="256"/>](https://i.imgur.com/bCnQ5Pb.png)

## Install

Omegga runs on linux, including the [Windows Subsystem for Linux](docs/install/wsl.md). **Do not install or run it as root**; if `whoami` prints "root", [create a new user](docs/install/linux.md#creating-a-new-user) first.

```sh
# update what's installed, then install what omegga needs
sudo apt update && sudo apt upgrade
sudo apt install curl git build-essential python3 wget tar openssl lib32gcc-s1

# download nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# activate nvm
. ~/.nvm/nvm.sh

# install node version 24
nvm install 24

# install omegga
npm i -g omegga
```

Then make a folder for your server and start it:

```sh
mkdir myServer && cd myServer
omegga
```

Omegga will prompt for credentials as necessary and only stores the auth tokens brickadia generates on login. **Omegga does not store your password**.

To run it in a container instead, see [Containers](docs/containers.md). For the long version, including troubleshooting, see [Installing](docs/install/README.md).

## Documentation

Everything below is also published as a book at
**<https://omegga.brickadia.dev/>**.

| Setting up | |
| --- | --- |
| [Installing](docs/install/README.md) | [linux](docs/install/linux.md), [WSL](docs/install/wsl.md), or a [container](docs/containers.md) |
| [Running](docs/running.md) | starting a server and keeping it updated |
| [Configuration](docs/config.md) | `omegga-config.yml`, field by field |
| [Environment variables](docs/env.md) | what omegga reads from the environment |
| [Troubleshooting](docs/troubleshooting.md) | when it does not start |
| [Uninstalling](docs/uninstall.md) | removing omegga and the game |

| Plugins | |
| --- | --- |
| [Plugins](docs/plugins/README.md) | structure, `doc.json`, config, and the plugin store |
| [Installing plugins](docs/plugins/installing.md) | `omegga install`, updating, removing |
| [Node VM plugins](docs/plugins/safe.md) | the default plugin type |
| [Node plugins](docs/plugins/unsafe.md) | unsafe plugins with raw access to omegga |
| [JSON RPC plugins](docs/plugins/jsonrpc.md) | plugins in any language |

| API | |
| --- | --- |
| [Omegga](docs/api/omegga.md) | the server |
| [Player](docs/api/player.md) | one player |
| [Plugin](docs/api/plugin.md) | `config`, `store`, `metrics` |
| [Events](docs/api/events.md) | what omegga emits as the server runs |
| [Log parsing](docs/api/log-parsing.md) | console output omegga does not already parse |

| Operating a server | |
| --- | --- |
| [Metrics](docs/metrics.md) | the Prometheus endpoint and the web UI dashboards |
| [Web UI permissions](docs/permissions.md) | roles and scopes |
| [HTTPS](docs/guides/https.md) | a real certificate, with Caddy or nginx |
| [Running on another machine](docs/guides/remote.md) | ssh, file sharing, several omeggas |

## Contributing

```sh
git clone https://github.com/brickadia-community/omegga.git && cd omegga
npm i
npm link      # run this checkout as the `omegga` command
npm run dist  # build the web ui, omegga's typescript, and omegga.d.ts
```

`npm run lint`, `npm run typecheck`, and `npm test` are what CI runs. The API
pages under `docs/api` are generated from the JSDoc in `src/`; run
`npm run docs:api` after changing those comments.
