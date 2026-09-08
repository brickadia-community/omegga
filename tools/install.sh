#!/usr/bin/env bash
# Installs omegga and whatever it needs, as the user running it.
#
#   curl -fsSL https://omegga.brickadia.dev/install.sh | bash
#
# The docs build publishes this file at that URL. Nothing happens without being
# asked about first, and running it twice is fine.

# `sh install.sh` skips the shebang and dies later with confusing errors
# ("can't cd to ."). Catch it here, while sh can still parse the file.
if [ -z "${BASH_VERSION:-}" ]; then
  echo ">! run this with bash, not sh:  bash install.sh" >&2
  exit 1
fi

set -euo pipefail

# Omegga needs node 23 or newer (package.json "engines"). 24 is what the docs
# install and what omegga is tested against.
#
# Prefixed, and not readonly, on purpose: this script sources nvm.sh, nvm uses
# NODE_VERSION and NVM_VERSION as its own locals, and `local` on a readonly
# name fails quietly enough that `nvm install 24` installs the newest node.
OMEGGA_MIN_NODE_MAJOR=23
OMEGGA_NVM_VERSION=v0.40.3
OMEGGA_NODE_VERSION=24

ASSUME_YES=0
DRY_RUN=0

# Per stream, so a redirected log does not collect escape codes because the
# other stream happens to be a terminal.
GREEN='' YELLOW='' RED='' OFF_OUT='' OFF_ERR=''
if [[ -z ${NO_COLOR:-} && ${TERM:-dumb} != dumb ]]; then
  if [[ -t 1 ]]; then GREEN=$'\e[32m' YELLOW=$'\e[33m' OFF_OUT=$'\e[0m'; fi
  if [[ -t 2 ]]; then RED=$'\e[31m' OFF_ERR=$'\e[0m'; fi
fi

say()  { printf '%s>>%s %s\n' "$GREEN" "$OFF_OUT" "$*"; }
warn() { printf '%s>!%s %s\n' "$RED" "$OFF_ERR" "$*" >&2; }
die()  { warn "$*"; exit 1; }

usage() {
  cat <<'EOF'
usage: install.sh [--yes] [--dry-run] [--node-version N]

  -y, --yes           take the recommended answer to every question, so it
                      needs no terminal (for containers and CI)
  -n, --dry-run       report what is missing and stop
      --node-version  install this node major through nvm instead of the default
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)       ASSUME_YES=1; shift ;;
    -n|--dry-run)   DRY_RUN=1; shift ;;
    --node-version) OMEGGA_NODE_VERSION="${2:?--node-version needs a major version}"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    *) warn "unknown option: $1"; usage >&2; exit 1 ;;
  esac
done

# Under `curl ... | bash` the script is stdin, so reading answers from stdin
# would eat the rest of it. Prompts go to /dev/tty instead.
ask() {
  local prompt="$1" reply
  if [[ $ASSUME_YES == 1 ]]; then
    say "$prompt [Y/n] y"
    return 0
  fi
  if [[ ! -r /dev/tty ]]; then
    warn "no terminal to ask on and no --yes, so assuming no"
    return 1
  fi
  read -r -p "$GREEN>>$OFF_OUT $prompt [Y/n] " reply < /dev/tty || return 1
  [[ -z $reply || $reply == [yY]* ]]
}

# Assumes sudo exists when not already root; the dependency install is what
# checks for it.
as_root() {
  if [[ $EUID -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

# Where this script lives, or nothing if it came down a pipe. Handing it to
# another user needs a real file.
self_path() {
  if [[ -f ${BASH_SOURCE[0]} ]]; then
    readlink -f "${BASH_SOURCE[0]}"
  fi
}

# Flags to pass along when re-running as someone else.
forwarded_args() {
  if [[ $ASSUME_YES == 1 ]]; then printf ' --yes'; fi
  if [[ $DRY_RUN == 1 ]]; then printf ' --dry-run'; fi
  printf " --node-version %q" "$OMEGGA_NODE_VERSION"
}

if [[ $(uname -s) != Linux ]]; then
  die "omegga runs on linux. On Windows that means WSL: https://omegga.brickadia.dev/install/wsl.html"
fi

DISTRO_NAME="unknown linux"
FAMILY=unknown
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  DISTRO_NAME="${PRETTY_NAME:-${NAME:-unknown linux}}"
  # ID_LIKE is how a derivative names its parent, so matching it covers Mint,
  # Pop, Rocky, Manjaro and the rest without listing them.
  case " ${ID:-} ${ID_LIKE:-} " in
    *" debian "*|*" ubuntu "*)            FAMILY=debian ;;
    *" fedora "*|*" rhel "*|*" centos "*) FAMILY=fedora ;;
    *" arch "*)                           FAMILY=arch ;;
  esac
fi

if [[ $FAMILY == debian ]]; then
  ADMIN_GROUP=sudo
else
  ADMIN_GROUP=wheel
fi

# lib32 is a library, not a command, so the package manager answers for it.
dep_desc() {
  case "$1" in
    curl)      echo "downloading the nvm installer" ;;
    wget)      echo "downloading steamcmd" ;;
    tar)       echo "extracting steamcmd and the server" ;;
    toolchain) echo "node-gyp, for omegga's native modules" ;;
    python3)   echo "node-gyp" ;;
    lib32)     echo "steamcmd, which is a 32-bit binary" ;;
    cabundle)  echo "steamcmd's TLS trust store" ;;
    git)       echo "plugins (a JS git can stand in)" ;;
    openssl)   echo "https for the web UI (http without it)" ;;
  esac
}

dep_present() {
  case "$1" in
    toolchain)
      command -v cc >/dev/null && command -v c++ >/dev/null && command -v make >/dev/null ;;
    # steamcmd reads CA certificates from this one path and nowhere else
    cabundle) [[ -e /etc/ssl/certs/ca-certificates.crt ]] ;;
    lib32)
      case "$FAMILY" in
        debian) dpkg -s lib32gcc-s1 >/dev/null 2>&1 ;;
        fedora) rpm -q libgcc.i686 >/dev/null 2>&1 && rpm -q libstdc++.i686 >/dev/null 2>&1 ;;
        arch)   pacman -Q lib32-gcc-libs >/dev/null 2>&1 ;;
        # unknown distro: look for the 32-bit loader, not a package name
        *) [[ -e /lib/ld-linux.so.2 || -e /lib32/ld-linux.so.2 ]] ;;
      esac ;;
    *) command -v "$1" >/dev/null ;;
  esac
}

# Packages that provide a dependency here, space separated.
dep_packages() {
  case "$FAMILY:$1" in
    debian:toolchain) echo build-essential ;;
    fedora:toolchain) echo gcc gcc-c++ make ;;
    arch:toolchain)   echo base-devel ;;
    arch:python3)     echo python ;;
    debian:cabundle|arch:cabundle) echo ca-certificates ;;
    # Fedora has no bundle file to install, only p11-kit's hashed directory;
    # link_ca_bundle handles it
    fedora:cabundle) ;;
    debian:lib32)     echo lib32gcc-s1 ;;
    fedora:lib32)     echo glibc.i686 libgcc.i686 libstdc++.i686 ;;
    arch:lib32)       echo lib32-gcc-libs ;;
    *) echo "$1" ;;
  esac
}

DEPS=(curl wget tar toolchain python3 lib32 cabundle git openssl)

missing=()
check_dependencies() {
  missing=()
  for dep in "${DEPS[@]}"; do
    dep_present "$dep" || missing+=("$dep")
  done
}

install_dependencies() {
  if [[ ${#missing[@]} -gt 0 ]]; then
    packages=()
    for dep in "${missing[@]}"; do
      read -r -a pkgs <<< "$(dep_packages "$dep")"
      if [[ ${#pkgs[@]} -gt 0 ]]; then packages+=("${pkgs[@]}"); fi
    done

    if [[ ${#packages[@]} -eq 0 ]]; then
      : # nothing this package manager can supply; the fixups below cover it
    elif [[ $FAMILY == unknown ]]; then
      warn "unknown distro, so these names are a guess. install this system's"
      warn "equivalent of: ${packages[*]}"
      ask "continue without them?" || exit 1
    else
      sudo_cmd=()
      if [[ $EUID -ne 0 ]]; then
        command -v sudo >/dev/null ||
          die "sudo is not installed. As root, install: ${packages[*]}"
        sudo_cmd=(sudo)
      fi

      # Arch keeps 32-bit packages in multilib, which ships disabled. Skipping
      # it only costs steamcmd; the rest of omegga still works.
      if [[ $FAMILY == arch ]] && printf '%s\n' "${missing[@]}" | grep -qx lib32 &&
         ! grep -q '^\[multilib\]' /etc/pacman.conf; then
        if ask "enable multilib in /etc/pacman.conf? steamcmd is 32-bit"; then
          "${sudo_cmd[@]}" sed -i '/^#\[multilib\]/,/^#Include/ s/^#//' /etc/pacman.conf
        else
          warn "skipping lib32-gcc-libs, so steamcmd will not run"
          keep=()
          for p in "${packages[@]}"; do
            if [[ $p != lib32-gcc-libs ]]; then keep+=("$p"); fi
          done
          packages=("${keep[@]}")
        fi
      fi

      case "$FAMILY" in
        debian) install_cmd=("${sudo_cmd[@]}" apt-get install -y "${packages[@]}") ;;
        fedora) install_cmd=("${sudo_cmd[@]}" dnf install -y "${packages[@]}") ;;
        arch)   install_cmd=("${sudo_cmd[@]}" pacman -S --needed --noconfirm "${packages[@]}") ;;
      esac

      say "Required packages: ${packages[*]}"
      if ask "Okay to run: ${install_cmd[*]}?"; then
        case "$FAMILY" in
          debian) "${sudo_cmd[@]}" apt-get update ;;
          # -Sy alone leaves a partial upgrade, where a newly installed package
          # links against libraries this system does not have yet.
          arch)   "${sudo_cmd[@]}" pacman -Syu --noconfirm ;;
        esac
        "${install_cmd[@]}"
      else
        warn "going on without them. omegga may not build or start."
      fi
    fi
  fi

  link_ca_bundle
}

# Fedora has no CA bundle file at any legacy path, only p11-kit's hashed
# directory, and no package provides one. steamcmd reads a single path and
# reports an empty trust store as being offline, so downloads fail.
link_ca_bundle() {
  local bundle=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
  if [[ $FAMILY != fedora ]] || [[ -e /etc/ssl/certs/ca-certificates.crt ]]; then
    return 0
  fi
  if [[ ! -f $bundle ]]; then
    warn "no trust bundle at $bundle, so steamcmd cannot download"
    return 0
  fi
  warn "steamcmd reads CA certificates from /etc/ssl/certs/ca-certificates.crt"
  warn "and nowhere else, and this system has no file there. Downloads fail"
  warn "with 'Steamcmd needs to be online' until it does."
  if ask "link it to $bundle?"; then
    as_root ln -sfn "$bundle" /etc/ssl/certs/ca-certificates.crt
  else
    warn "left alone. steamcmd will not be able to download the server."
  fi
}

# Installing as root leaves a broken setup: npm puts omegga in root's home, the
# game server will not run as root, and everything omegga writes is root-owned.
if [[ $EUID -eq 0 ]]; then
  self=$(self_path) || true

  if [[ -n ${SUDO_USER:-} && $SUDO_USER != root ]]; then
    warn "this was run with sudo. omegga installs into your own home, not root's."
    if [[ -n $self ]] && ask "re-run it as $SUDO_USER?"; then
      # shellcheck disable=SC2046  # deliberately word-split: no flags, no args
      exec sudo -u "$SUDO_USER" -H bash "$self" $(forwarded_args)
    fi
    die "run it again without sudo, as $SUDO_USER"
  fi

  warn "you are root. omegga must not be installed or run as root."
  new_user=brickadia
  if [[ $ASSUME_YES != 1 && -r /dev/tty ]]; then
    read -r -p "$GREEN>>$OFF_OUT name for the new user [brickadia]: " reply < /dev/tty || true
    if [[ -n ${reply:-} ]]; then new_user="$reply"; fi
  fi
  ask "create user '$new_user' and continue as them?" ||
    die "create a non-root user and run this again as them: https://omegga.brickadia.dev/install/linux.html#creating-a-new-user"

  if id -u "$new_user" >/dev/null 2>&1; then
    say "user $new_user already exists"
  else
    useradd -m -s /bin/bash "$new_user"
    if getent group "$ADMIN_GROUP" >/dev/null; then
      usermod -aG "$ADMIN_GROUP" "$new_user"
    fi
    say "created $new_user"
    # No password means no way back into the account once this shell closes,
    # so ask for one while a terminal is still here.
    if [[ $ASSUME_YES != 1 && -r /dev/tty ]]; then
      passwd "$new_user" < /dev/tty || warn "no password set. run: passwd $new_user"
    else
      warn "no password set for $new_user. run: passwd $new_user"
    fi
  fi

  if [[ -z $self ]]; then
    die "now run this again as $new_user:  su - $new_user  and re-run the install command"
  fi
  # Install the system packages while this shell is still root. The new account
  # has no password yet, so its sudo would have nothing to authenticate with,
  # and everything left to do (nvm, npm) happens inside its own home anyway.
  if [[ $DRY_RUN != 1 ]]; then
    check_dependencies
    install_dependencies
  fi

  target="/home/$new_user/install-omegga.sh"
  install -o "$new_user" -g "$new_user" -m 0755 "$self" "$target"
  say "continuing as $new_user"
  exec su - "$new_user" -c "bash $(printf %q "$target")$(forwarded_args)"
fi

check_dependencies

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
have_nvm=0
if [[ -s "$NVM_DIR/nvm.sh" ]]; then have_nvm=1; fi

node_bin="$(command -v node || true)"

# A shell that has not sourced nvm.sh sees none of nvm's node, so without this
# a second run would offer to install a node that is already there, and would
# never find an omegga installed under it.
nvm_sourced=0
if [[ -z $node_bin && $have_nvm == 1 ]]; then
  set +eu
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  set -eu
  node_bin="$(command -v node || true)"
  if [[ -n $node_bin ]]; then nvm_sourced=1; fi
fi

node_major=0
if [[ -n $node_bin ]]; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi
node_ok=0
if [[ $node_major -ge $OMEGGA_MIN_NODE_MAJOR ]]; then node_ok=1; fi

omegga_bin="$(command -v omegga || true)"
omegga_version=""
if [[ -n $omegga_bin ]]; then
  omegga_version="$("$omegga_bin" --version 2>/dev/null || true)"
fi

# The package owning a file, or nothing. An nvm node belongs to no package,
# which is how the two are told apart.
package_owning() {
  local direct="$1" resolved
  resolved="$(readlink -f "$direct" 2>/dev/null || echo "$direct")"
  case "$FAMILY" in
    debian) { dpkg -S "$direct" || dpkg -S "$resolved"; } 2>/dev/null |
              head -1 | cut -d: -f1 ;;
    fedora) { rpm -qf --queryformat '%{NAME}\n' "$direct" ||
              rpm -qf --queryformat '%{NAME}\n' "$resolved"; } 2>/dev/null | head -1 ;;
    arch)   { pacman -Qoq "$direct" || pacman -Qoq "$resolved"; } 2>/dev/null | head -1 ;;
  esac
}

# A distro node puts global packages under /usr, where `npm i -g` needs root.
# That is the "which npm says /bin/npm" case in the install docs.
npm_prefix=""
node_writable=0
if [[ $node_ok == 1 ]]; then
  npm_prefix="$(npm prefix -g 2>/dev/null || true)"
  if [[ -n $npm_prefix && -w $npm_prefix ]]; then node_writable=1; fi
fi

# Packages that would keep their own node and npm on PATH after nvm is in
# place. A node under NVM_DIR belongs to no package, so it never lands here.
distro_node_packages=()
if [[ -n $node_bin && $node_bin != "$NVM_DIR"/* ]]; then
  for candidate in "$node_bin" "$(command -v npm || true)"; do
    if [[ -z $candidate ]]; then continue; fi
    owner="$(package_owning "$candidate")"
    if [[ -n $owner ]] &&
       ! printf '%s\n' "${distro_node_packages[@]}" | grep -qx "$owner"; then
      distro_node_packages+=("$owner")
    fi
  done
fi

status() {
  local state="$3" colour=''
  case "$state" in
    ok) colour="$GREEN" ;;
    install|replace|manual) colour="$YELLOW" ;;
  esac
  printf '   %-11s %-38s %s[%s]%s\n' "$1" "$2" "$colour" "$state" "$OFF_OUT"
}

say "system"
if [[ $FAMILY == unknown ]]; then
  status os "$DISTRO_NAME" "manual"
else
  status os "$DISTRO_NAME" "ok"
fi
status user "$(id -un), not root" ok
if grep -qi microsoft /proc/version 2>/dev/null; then
  status wsl "see the wsl2binds plugin once installed" note
fi

say "dependencies"
for dep in "${DEPS[@]}"; do
  if dep_present "$dep"; then
    status "$dep" "$(dep_desc "$dep")" ok
  else
    status "$dep" "$(dep_desc "$dep")" install
  fi
done

say "node"
if [[ $node_ok == 1 && $node_writable == 1 ]]; then
  status node "$("$node_bin" -v) at $node_bin" ok
elif [[ $node_ok == 1 ]]; then
  status node "$("$node_bin" -v), $npm_prefix not writable" replace
elif [[ -n $node_bin ]]; then
  if [[ ${#distro_node_packages[@]} -gt 0 ]]; then
    status node "$("$node_bin" -v) from ${distro_node_packages[*]}, too old" replace
  else
    status node "$("$node_bin" -v), older than v$OMEGGA_MIN_NODE_MAJOR" install
  fi
else
  status node "not installed" install
fi
if [[ $have_nvm == 1 ]]; then
  status nvm "$NVM_DIR" ok
else
  status nvm "not installed" -
fi

say "omegga"
if [[ -n $omegga_version ]]; then
  status omegga "$omegga_version at $omegga_bin" ok
elif [[ -n $omegga_bin ]]; then
  status omegga "installed at $omegga_bin, but will not run" replace
else
  status omegga "not installed" install
fi

if [[ $DRY_RUN == 1 ]]; then
  say "dry run, nothing installed"
  exit 0
fi

install_dependencies

install_node=0
if [[ $node_ok == 1 && $node_writable == 1 ]]; then
  say "using node $("$node_bin" -v)"
elif [[ $node_ok == 1 ]]; then
  warn "node $("$node_bin" -v) puts global packages in $npm_prefix, which"
  warn "only root can write to, and omegga installed by root does not work."
  if ask "install node $OMEGGA_NODE_VERSION through nvm instead? (recommended)"; then
    install_node=1
  fi
else
  if ask "install node $OMEGGA_NODE_VERSION through nvm? (recommended)"; then
    install_node=1
  fi
fi

if [[ $install_node == 0 && $node_ok == 0 ]]; then
  die "omegga needs node $OMEGGA_MIN_NODE_MAJOR or newer. Install one and run this again."
fi

if [[ $install_node == 1 ]]; then
  if [[ $have_nvm == 0 ]]; then
    say "installing nvm $OMEGGA_NVM_VERSION"
    command -v curl >/dev/null || die "curl is needed to download nvm"
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/$OMEGGA_NVM_VERSION/install.sh" | bash
  fi
  [[ -s "$NVM_DIR/nvm.sh" ]] || die "nvm did not install to $NVM_DIR"

  # nvm is a shell function, not a program, so it only exists in a shell that
  # sourced nvm.sh. Its installer edits the rc files, which does nothing for a
  # shell already running. nvm.sh does not survive `set -eu`, hence the +eu.
  set +eu
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$OMEGGA_NODE_VERSION"
  nvm alias default "$OMEGGA_NODE_VERSION"
  default_version="$(nvm version default)"
  set -eu

  node_bin="$(command -v node || true)"
  [[ -n $node_bin ]] || die "node is still not on PATH after installing it"
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [[ $node_major -ge $OMEGGA_MIN_NODE_MAJOR ]] ||
    die "nvm installed node $node_major, which is older than $OMEGGA_MIN_NODE_MAJOR"
  if [[ $OMEGGA_NODE_VERSION =~ ^[0-9]+$ && $node_major != "$OMEGGA_NODE_VERSION" ]]; then
    warn "asked nvm for node $OMEGGA_NODE_VERSION and it installed $node_major"
  fi
  # A dangling default alias only bites later: node works in this shell, and
  # the next login shell has none.
  [[ $default_version != N/A ]] ||
    die "nvm's default alias points at nothing, so a new shell would have no node"
  say "node $("$node_bin" -v) from $node_bin"
fi

# Only after nvm's node works. Removing the old one first risks leaving the
# machine with no node at all.
remove_distro_node() {
  if [[ ${#distro_node_packages[@]} -eq 0 || $install_node != 1 ]]; then
    return 0
  fi
  warn "node also comes from ${distro_node_packages[*]}. Left in place, its npm"
  warn "wins on PATH in any shell that has not loaded nvm."

  if [[ $EUID -ne 0 ]] && ! command -v sudo >/dev/null; then
    warn "no sudo here. As root: remove ${distro_node_packages[*]}"
    return 0
  fi

  # apt takes reverse dependencies with it, which on a desktop can be a long
  # list, so show it before asking.
  if [[ $FAMILY == debian ]]; then
    local removed
    # -s marks lines Purg or Remv depending on whether config files go too;
    # either way the package leaves
    removed="$(as_root apt-get -s purge "${distro_node_packages[@]}" 2>/dev/null |
      awk '/^(Remv|Purg) / {print "     " $2}')"
    if [[ -n $removed ]]; then
      say "removing it would also remove:"
      printf '%s\n' "$removed"
    fi
  fi

  if ! ask "remove ${distro_node_packages[*]}?"; then
    warn "left in place. if npm acts up later, remove it then."
    return 0
  fi

  case "$FAMILY" in
    debian) as_root apt-get purge -y "${distro_node_packages[@]}" ;;
    fedora) as_root dnf remove -y "${distro_node_packages[@]}" ;;
    arch)   as_root pacman -Rns --noconfirm "${distro_node_packages[@]}" ;;
  esac

  # bash caches command paths, and node just moved.
  hash -r 2>/dev/null || true
  node_bin="$(command -v node || true)"
  if [[ -z $node_bin ]]; then
    die "removing ${distro_node_packages[*]} took nvm's node off PATH too"
  fi
  say "node is now $("$node_bin" -v) from $node_bin"
}

remove_distro_node

command -v npm >/dev/null || die "npm is missing, so node is not usable"

if [[ -n $omegga_version ]]; then
  say "updating omegga, currently $omegga_version"
else
  say "installing omegga"
fi
npm i -g omegga

version="$(omegga --version 2>/dev/null || true)"
[[ -n $version ]] ||
  die "omegga installed but will not run. https://omegga.brickadia.dev/troubleshooting.html"

if [[ $version == "$omegga_version" ]]; then
  say "omegga $version, already up to date"
else
  say "omegga $version installed"
fi
echo
# A child process cannot change its parent's PATH, so this shell needs the line
# that does. It goes first, as part of the same block, because running the rest
# without it is the confusing way to find out.
if [[ $install_node == 1 || $nvm_sourced == 1 ]]; then
  printf '   . %s/nvm.sh   # this shell has not loaded nvm yet\n' "$NVM_DIR"
fi
cat <<'EOF'
   mkdir ~/myServer && cd ~/myServer
   omegga

The first start downloads Brickadia through SteamCMD and prints a one-time link
to claim the web UI. https://omegga.brickadia.dev/running.html
EOF
