# Containers

Release tags publish an image to `ghcr.io/brickadia-community/omegga`.

To run that image under a Pterodactyl panel instead of directly, see
[Pterodactyl](guides/pterodactyl.md). Wings imposes its own user, working
directory, and console behaviour, and the egg in `docker/pterodactyl` handles
them.

```sh
docker run -it --rm \
  -v omegga-home:/home/steam \
  -v "$PWD/server:/server" \
  -p 8080:8080 -p 7777:7777/udp \
  -e BRICKADIA_TOKEN -e OMEGGA_PORT=8080 -e BRICKADIA_PORT=7777 \
  -e PUID="$(id -u)" -e PGID="$(id -g)" \
  ghcr.io/brickadia-community/omegga
```

Generate a hosting token at https://brickadia.com/account/tokens. Without one omegga falls back to an interactive auth prompt, which needs a tty: it stops there under `docker run -it`, and exits with the token URL when there is no tty to prompt on. Set `OMEGGA_NONINTERACTIVE=true` to get that same refusal on a host that does allocate a tty but cannot answer an arrow-key prompt. Arguments are passed through, so `omegga --debug` and `bash` both work in place of the default command. Omegga handles `SIGINT` and `SIGTERM`, so ctrl+c and `docker stop` shut down gracefully - add `--init` if you also want zombie reaping.

Omegga is baked into the image, so it updates by pulling a new one rather than through npm:

```sh
docker pull ghcr.io/brickadia-community/omegga:latest
docker compose pull && docker compose up -d # or, under compose
```

`latest` moves with every release, so pin a version like `:1.14.0` if you would rather choose when that happens. Nothing pulls on its own - `podman auto-update` and watchtower are the usual ways to automate it.

The game is not in the image. It updates in place inside the volume with `omegga --update` or `/update`, and steamcmd keeps itself up to date. Setting the container's command to `omegga --update` (`command: omegga --update` under compose) checks on every start, at the cost of not starting at all when Steam is unreachable, rather than running the version already installed.

## Compose

```yaml
services:
  omegga:
    image: ghcr.io/brickadia-community/omegga:latest
    restart: unless-stopped
    stdin_open: true
    tty: true
    env_file: .env
    ports:
      - '${OMEGGA_PORT}:${OMEGGA_PORT}/tcp'
      - '${BRICKADIA_PORT}:${BRICKADIA_PORT}/udp'
    volumes:
      - home:/home/steam
      - ./server:/server

volumes:
  home:
```

```sh
# .env - read for the ${...} above, and passed to the container
BRICKADIA_TOKEN=...
OMEGGA_PORT=8080
BRICKADIA_PORT=7777
PUID=1000
PGID=1000
```

`compose run --rm --service-ports omegga` attaches a tty, so ctrl+c goes to omegga. With `compose up` it goes to compose, which stops the container instead.

## Volumes

- `/home/steam` - the Brickadia install, steamcmd, and auth files. Keep it on a named volume or the game is downloaded again every time the container is recreated.
- `/server` - the omegga working directory: `omegga-config.yml`, `data`, and `plugins`. Bind mount it to edit them from the host.

## Ports

Set them with `OMEGGA_PORT` and `BRICKADIA_PORT` rather than editing the config file, so one value drives both the server and the port mapping. They override the config, though `server.port` still has to be present in it. See [Environment Variables](env.md) for the rest.

Brickadia reports its configured port to the master server, so a published port has to be the same number the server runs on. Never map `-p 7778:7777/udp`.

## Metrics

`METRICS_ENABLED=true` with `METRICS_BIND=0.0.0.0` serves the [Prometheus
endpoint](metrics.md) on the container's own network interface, where a scraper
on the same compose network reaches it by service name without the port being
published at all. `metrics.token` has no environment variable, so it belongs in
`omegga-config.yml` on the mounted `/server`.

[Metrics](metrics.md#the-whole-stack-in-compose) has a compose file with omegga,
Prometheus, and VictoriaMetrics together, and the config files that go with it.

## File Ownership

`PUID` and `PGID` decide who owns what omegga writes into a bind-mounted `/server`; set them to your own `id -u` and `id -g`. `PUID=0` runs as root instead and leaves root-owned files behind on the host.

## Building

The `Dockerfile` builds omegga on top of `gameservermanagers/steamcmd`, with node from nvm.

```sh
# the omegga in this checkout
docker build -t omegga .

# or a release off npm, where OMEGGA_VERSION is an npm version
docker build -t omegga --target npm --build-arg OMEGGA_VERSION=1.14.0 .
```

`OMEGGA_VERSION` is required and has to be an exact version. There is deliberately no `latest` default: that layer is cached on its command text, so `latest` would never invalidate it - rebuilds would keep reinstalling whichever version was current the first time, and only `--no-cache` would get past it.

## Podman

`podman build`, `podman run`, and `podman compose` take the same arguments and read the same compose file. Two things differ:

- Rootless podman maps the container's root to your own user, so `PUID=0` is what leaves bind-mounted files owned by you - the opposite of the advice above. Keeping the container's unprivileged user maps it to a subuid instead, and `/server` ends up owned by an id you need `podman unshare` to touch. To stay unprivileged inside the container, `--userns=keep-id:uid=1000,gid=1000` maps you onto the image's `steam` user.
- On SELinux systems bind mounts need a relabel: `-v "$PWD/server:/server:Z"`.
