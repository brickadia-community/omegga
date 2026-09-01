# syntax=docker/dockerfile:1

# Usage, volumes, ports, and PUID/PGID: see the Docker section of README.md

ARG STEAMCMD_TAG=ubuntu-24.04
ARG NODE_VERSION=24
ARG NVM_VERSION=v0.40.3

# ----------------------------------- base -----------------------------------
# The steamcmd image supplies steamcmd (omegga downloads Brickadia through it),
# gosu, and an unprivileged `steam` user at uid 1000.
FROM gameservermanagers/steamcmd:${STEAMCMD_TAG} AS base
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG NODE_VERSION
ARG NVM_VERSION
ENV DEBIAN_FRONTEND=noninteractive \
    NVM_DIR=/usr/local/nvm

# git: omegga installs plugins by cloning them
# build-essential, python3: node-gyp, for better-sqlite3 and native plugin deps
# curl, ca-certificates: fetching nvm and node
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      python3 \
 && rm -rf /var/lib/apt/lists/*

# omegga needs node >=23 and ubuntu ships 18, so node comes from nvm. The
# installed version is symlinked to a fixed path so PATH never encodes it.
RUN mkdir -p "$NVM_DIR" \
 && curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash \
 && source "$NVM_DIR/nvm.sh" \
 && nvm install "$NODE_VERSION" \
 && nvm alias default "$NODE_VERSION" \
 && ln -s "$NVM_DIR/versions/node/$(nvm version default)" /usr/local/node \
 && nvm cache clear \
 && printf 'export NVM_DIR=%s\n[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n' \
      "$NVM_DIR" > /etc/profile.d/nvm.sh
ENV PATH=/usr/local/node/bin:$PATH

# ----------------------------------- build -----------------------------------
# Packs the working tree into the same tarball `npm publish` would produce.
FROM base AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm run dist \
 && mkdir -p /out \
 && npm pack --pack-destination /out \
 && mv /out/omegga-*.tgz /out/omegga.tgz

# ---------------------------------- runtime ----------------------------------
FROM base AS runtime
LABEL org.opencontainers.image.title="omegga" \
      org.opencontainers.image.description="Brickadia server wrapper" \
      org.opencontainers.image.source="https://github.com/brickadia-community/omegga" \
      org.opencontainers.image.licenses="MIT"

# omegga keeps the game install, steamcmd, and auth tokens under $HOME
ENV HOME=/home/steam
COPY docker/entrypoint.sh /usr/local/bin/omegga-entrypoint
WORKDIR /server

# web ui, brickadia, prometheus metrics (only served when metrics.enabled)
EXPOSE 8080/tcp 7777/udp 9000/tcp

ENTRYPOINT ["/usr/local/bin/omegga-entrypoint"]
CMD ["omegga"]

# ------------------------------------ npm ------------------------------------
# OMEGGA_VERSION is a required, exact npm version. It has no default because
# this layer is cached on its command text: a `latest` here would never
# invalidate, and rebuilds would keep reinstalling whichever version was
# current the first time it ran rather than the newest one.
FROM runtime AS npm
ARG OMEGGA_VERSION
# a root-owned ~/.npm would leave `omegga install <plugin>` unable to cache
RUN test -n "$OMEGGA_VERSION" \
      || { echo 'build arg OMEGGA_VERSION is required' >&2; exit 1; } \
 && npm_config_cache=/tmp/npm-cache npm i -g "omegga@${OMEGGA_VERSION}" \
 && rm -rf /tmp/npm-cache

# ----------------------------------- local -----------------------------------
# Last stage, so a `docker build .` with no --target builds this one.
FROM runtime AS local
RUN --mount=type=bind,from=build,source=/out/omegga.tgz,target=/tmp/omegga.tgz \
    npm_config_cache=/tmp/npm-cache npm i -g /tmp/omegga.tgz \
 && rm -rf /tmp/npm-cache
