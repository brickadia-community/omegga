# Running

It's recommend to create a folder first _before_ starting your server:

```sh
# change "myServer" to "brickadia" or "server" or whatever you want
mkdir myServer && cd myServer

# this will place a folder called "myServer" in your home (cd ~)
```

To start a server, simply type the following in a linux shell after install:

    omegga

Omegga will prompt for credentials as necessary and only stores the auth tokens brickadia generates on login. **Omegga does not store your password**.

The first start downloads Brickadia through SteamCMD. Omegga uses a `steamcmd`
already on `PATH`, or asks before installing its own into
`~/.config/omegga/steam`. Installing one yourself first is optional. Anything
that cannot answer that prompt, like a service manager or a game panel, should
set `SKIP_STEAMCMD_PROMPT=true` to agree in advance.

Omegga runs in the current working directory. To have it always use the same
folder regardless of where you start it, run `omegga config default $(pwd)`.

Once it is up, the web UI is at <https://127.0.0.1:8080> unless you changed
`omegga.port`. See [Configuration](config.md) for what else the server reads on
startup.

## Updating

Omegga will tell you when it's out of date. You can update with this command:

    npm i -g omegga

In a container, pull a new image instead - see [Containers](containers.md).

If don't have automatic update enabled, you can start update the Brickadia server by starting omegga with the `--update` flag:

    omegga --update

Or you can run the `/update` command in the Omegga console, or even update from the Server menu in the web UI.
