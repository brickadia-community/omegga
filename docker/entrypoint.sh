#!/usr/bin/env bash
# Runs omegga as the unprivileged `steam` user the base image ships.
#
# Bind mounts keep their host uid/gid, so PUID/PGID remap the container user to
# match them - otherwise omegga can't write to a mounted /server.
set -euo pipefail

# `docker run omegga --debug` should pass flags to omegga, not exec them
if [[ $# -eq 0 || ${1:0:1} == '-' ]]; then
  set -- omegga "$@"
fi

# Pterodactyl runs this image without overriding the entrypoint, command, or
# working directory: it passes the command it wants in STARTUP and mounts the
# server's volume at /home/container, so the image has to adopt all three
# itself. STARTUP holds a shell command with {{VAR}} placeholders naming other
# environment variables.
#
# Only the default command is replaced. Install scripts arrive as an explicit
# `bash /mnt/install/install.sh` with STARTUP set as well, and those have to run
# as given.
if [[ -n ${STARTUP:-} && -d /home/container && $# -eq 1 && $1 == omegga ]]; then
  export HOME=/home/container
  cd "$HOME"

  # {{VAR}} -> ${VAR} for the bash -c below to expand: no eval, no envsubst.
  startup=${STARTUP//\{\{/\$\{}
  startup=${startup//\}\}/\}}

  echo ">> Starting: ${startup}" >&2
  set -- bash -c "$startup"
fi

# already dropped by `docker run --user`, nothing to remap
if [[ $(id -u) -ne 0 ]]; then
  exec "$@"
fi

current_uid=$(id -u steam)
current_gid=$(id -g steam)
desired_uid=${PUID:-$current_uid}
desired_gid=${PGID:-$current_gid}

# PUID=0 stays root. Brickadia and steamcmd both tolerate it, but everything
# written into a bind mount then belongs to root on the host.
if [[ $desired_uid -eq 0 ]]; then
  exec "$@"
fi

if [[ $desired_gid != "$current_gid" ]]; then
  echo ">> Remapping steam group ${current_gid} -> ${desired_gid}" >&2
  groupmod -o -g "$desired_gid" steam
fi

if [[ $desired_uid != "$current_uid" ]]; then
  echo ">> Remapping steam user ${current_uid} -> ${desired_uid}" >&2
  usermod -o -u "$desired_uid" steam
fi

# docker creates missing mount points as root and a fresh named volume comes up
# root-owned, so the directories omegga writes to have to be claimed here. Only
# the mount points, never recursively - a Brickadia install is tens of GB and
# chowning it every start would dominate startup.
for dir in "$HOME" "$HOME/.config" "$HOME/.config/omegga" /server; do
  mkdir -p "$dir" 2>/dev/null || true
  [[ -d $dir ]] || continue
  if [[ $(stat -c %u:%g "$dir") != "$desired_uid:$desired_gid" ]]; then
    chown "$desired_uid:$desired_gid" "$dir"
  fi
done

exec gosu steam:steam "$@"
