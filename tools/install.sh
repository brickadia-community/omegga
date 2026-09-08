#!/usr/bin/env bash
# Checks what this machine already has, offers to install the rest, and installs
# omegga as the user running it.
#
#   curl -fsSL https://omegga.brickadia.dev/install.sh | bash
#
# The docs build publishes this file at that URL; it is also readable straight
# from the repo at raw.githubusercontent.com/brickadia-community/omegga/master/
# tools/install.sh.
#
# Nothing is installed without being offered first, so it is safe to run on a
# machine that already has node, and safe to run twice.

# `sh install.sh` bypasses the shebang and fails later with errors that read as
# omegga's fault ("can't cd to ."), so it is turned away here while the script
# is still parseable by a POSIX shell.
if [ -z "${BASH_VERSION:-}" ]; then
  echo ">! run this with bash, not sh:  bash install.sh" >&2
  exit 1
fi

set -euo pipefail

# Omegga needs node 23 or newer (package.json "engines"). 24 is what the install
# docs walk through and the release line omegga is tested against.
#
# The OMEGGA_ prefix and the absence of readonly are both load-bearing: this
# script sources nvm.sh into its own shell, nvm declares NODE_VERSION and
# NVM_VERSION as locals, and `local` against a readonly name fails quietly
# enough that `nvm install 24` installs the newest node instead.
OMEGGA_MIN_NODE_MAJOR=23
OMEGGA_NVM_VERSION=v0.40.3
OMEGGA_NODE_VERSION=24

ASSUME_YES=0
DRY_RUN=0

say()  { printf '>> %s\n' "$*"; }
warn() { printf '>! %s\n' "$*" >&2; }
die()  { printf '>! %s\n' "$*" >&2; exit 1; }

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

# Prompts read from the terminal rather than stdin. Under `curl ... | bash` the
# script itself is stdin, and reading answers from there would swallow the rest
# of the script and run half an installer.
ask() {
  local prompt="$1" reply
  if [[ $ASSUME_YES == 1 ]]; then
    say "$prompt [Y/n] y"
    return 0
  fi
  if [[ ! -r /dev/tty ]]; then
    warn "no terminal to ask on, and --yes was not given: assuming no"
    return 1
  fi
  read -r -p ">> $prompt [Y/n] " reply < /dev/tty || return 1
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

# The path this script was read from, or nothing when it came down a pipe.
# Continuing as another user needs a real file to hand them.
self_path() {
  if [[ -f ${BASH_SOURCE[0]} ]]; then
    readlink -f "${BASH_SOURCE[0]}"
  fi
}

# The flags this run was given, to pass on to a run as another user.
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

# lib32 is the odd one out: it is a library rather than a command, so the
# package manager is asked about it instead of PATH.
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
        # Unknown distro: steamcmd needs the 32-bit loader, so look for that
        # rather than for a package name that may not exist.
        *) [[ -e /lib/ld-linux.so.2 || -e /lib32/ld-linux.so.2 ]] ;;
      esac ;;
    *) command -v "$1" >/dev/null ;;
  esac
}

# Package names providing a dependency on this family, space separated.
dep_packages() {
  case "$FAMILY:$1" in
    debian:toolchain) echo build-essential ;;
    fedora:toolchain) echo gcc gcc-c++ make ;;
    arch:toolchain)   echo base-devel ;;
    arch:python3)     echo python ;;
    debian:cabundle|arch:cabundle) echo ca-certificates ;;
    # Fedora ships no bundle file at any legacy path, only p11-kit's hashed
    # directory, so no package fixes this one: install_dependencies links it.
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
      warn "unrecognised distro, so these package names are a guess."
      warn "install this distro's equivalent of: ${packages[*]}"
      ask "continue without them?" || exit 1
    else
      sudo_cmd=()
      if [[ $EUID -ne 0 ]]; then
        command -v sudo >/dev/null ||
          die "sudo is not installed. As root, install: ${packages[*]}"
        sudo_cmd=(sudo)
      fi

      # Arch ships the 32-bit repository disabled, and steamcmd is 32-bit, so
      # enabling it is part of installing that dependency rather than a separate
      # concern. Dropping the package is survivable: everything but steamcmd works.
      if [[ $FAMILY == arch ]] && printf '%s\n' "${missing[@]}" | grep -qx lib32 &&
         ! grep -q '^\[multilib\]' /etc/pacman.conf; then
        if ask "enable the multilib repository in /etc/pacman.conf, for 32-bit steamcmd?"; then
          "${sudo_cmd[@]}" sed -i '/^#\[multilib\]/,/^#Include/ s/^#//' /etc/pacman.conf
        else
          warn "skipping lib32-gcc-libs. steamcmd cannot run until multilib is on."
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

      say "missing packages: ${packages[*]}"
      if ask "install them with: ${install_cmd[*]} ?"; then
        case "$FAMILY" in
          debian) "${sudo_cmd[@]}" apt-get update ;;
          # -Sy alone leaves a partial upgrade, where a newly installed package
          # links against libraries this system does not have yet.
          arch)   "${sudo_cmd[@]}" pacman -Syu --noconfirm ;;
        esac
        "${install_cmd[@]}"
      else
        warn "continuing without them. omegga may fail to build or to start."
      fi
    fi
  fi

  link_ca_bundle
}

# Fedora has no CA bundle file at any legacy path, only p11-kit's hashed
# directory, and no package puts one there. steamcmd reads one path and calls an
# empty trust store being offline, so the game download fails on an otherwise
# perfect install.
link_ca_bundle() {
  local bundle=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
  if [[ $FAMILY != fedora ]] || [[ -e /etc/ssl/certs/ca-certificates.crt ]]; then
    return 0
  fi
  if [[ ! -f $bundle ]]; then
    warn "no trust bundle at $bundle. steamcmd will not be able to download."
    return 0
  fi
  warn "this distro ships no /etc/ssl/certs/ca-certificates.crt, which is the"
  warn "only place steamcmd looks for CA certificates. Without it the game"
  warn "download fails as 'Steamcmd needs to be online'."
  if ask "link it to $bundle?"; then
    as_root ln -sfn "$bundle" /etc/ssl/certs/ca-certificates.crt
  else
    warn "leaving it. steamcmd cannot download the server until that path exists."
  fi
}

# Installing as root is the most common way to end up with an unusable install:
# npm puts the package in root's home, the game server refuses to run as root,
# and everything omegga writes afterwards is root-owned.
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
    read -r -p ">> name for the new user [brickadia]: " reply < /dev/tty || true
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
    # Without a password the account cannot be logged into again once this
    # shell closes, so ask while there is still a terminal to ask on.
    if [[ $ASSUME_YES != 1 && -r /dev/tty ]]; then
      passwd "$new_user" < /dev/tty || warn "no password set. run: passwd $new_user"
    else
      warn "no password set for $new_user. run: passwd $new_user"
    fi
  fi

  if [[ -z $self ]]; then
    die "now run this again as $new_user:  su - $new_user  and re-run the install command"
  fi
  # Installing the system packages here, while this shell is still root, is
  # what makes the new account usable: it has no password yet, so sudo would
  # have nothing to authenticate with. Everything left to do as them (nvm, npm)
  # happens inside their own home and needs no root at all.
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
node_major=0
if [[ -n $node_bin ]]; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi
node_ok=0
if [[ $node_major -ge $OMEGGA_MIN_NODE_MAJOR ]]; then node_ok=1; fi

# The package that owns a file, or nothing when no package does. An nvm node
# is owned by nobody, which is how the two are told apart.
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

# A node installed by the distro puts its global packages under /usr, where a
# non-root `npm i -g` cannot write. That is the "which npm says /bin/npm" case
# in the install docs, and nvm is the way out of it.
npm_prefix=""
node_writable=0
if [[ $node_ok == 1 ]]; then
  npm_prefix="$(npm prefix -g 2>/dev/null || true)"
  if [[ -n $npm_prefix && -w $npm_prefix ]]; then node_writable=1; fi
fi

# Packages that would keep putting their own node and npm on PATH after nvm is
# in place. An nvm-managed node is not one of them, so it is never listed.
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

status() { printf '   %-11s %-38s [%s]\n' "$1" "$2" "$3"; }

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

if [[ $DRY_RUN == 1 ]]; then
  say "dry run, nothing installed"
  exit 0
fi

install_dependencies

install_node=0
if [[ $node_ok == 1 && $node_writable == 1 ]]; then
  say "using the node already installed, $("$node_bin" -v)"
elif [[ $node_ok == 1 ]]; then
  warn "node $("$node_bin" -v) is installed, but its global packages live in"
  warn "$npm_prefix, which you cannot write to. Installing omegga there would"
  warn "take root, and an omegga installed by root does not work."
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

  # nvm is a shell function, not a program: it exists only in a shell that has
  # sourced it. Its installer edits the shell rc files, which does nothing for
  # the shell already running. nvm.sh is not written to survive `set -eu`,
  # hence the relaxed scope around it.
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
  # A default alias that resolves to nothing is the failure that only shows up
  # later: this shell has node, and the next login shell has none.
  [[ $default_version != N/A ]] ||
    die "nvm's default alias does not resolve, so a new shell would find no node"
  say "node $("$node_bin" -v) from $node_bin"
fi

# Only offered once nvm's node is working: a machine that has had its distro
# node taken away and gained nothing is worse off than one with an old node.
remove_distro_node() {
  if [[ ${#distro_node_packages[@]} -eq 0 || $install_node != 1 ]]; then
    return 0
  fi
  warn "node also comes from the ${distro_node_packages[*]} package. Left in"
  warn "place its npm keeps winning on PATH for anything that does not load"
  warn "nvm, which is the 'which npm says /bin/npm' failure in the docs."

  if [[ $EUID -ne 0 ]] && ! command -v sudo >/dev/null; then
    warn "no sudo here. As root: remove ${distro_node_packages[*]}"
    return 0
  fi

  # apt takes reverse dependencies with it, and on a desktop that can be a long
  # list, so it is shown before anything is agreed to.
  if [[ $FAMILY == debian ]]; then
    local removed
    # a simulated purge marks packages Purg or Remv depending on whether their
    # configuration goes too; both are packages that would leave the machine
    removed="$(as_root apt-get -s purge "${distro_node_packages[@]}" 2>/dev/null |
      awk '/^(Remv|Purg) / {print "     " $2}')"
    if [[ -n $removed ]]; then
      say "removing it would also remove:"
      printf '%s\n' "$removed"
    fi
  fi

  if ! ask "remove ${distro_node_packages[*]}?"; then
    warn "leaving it. If npm misbehaves later, this is the first thing to undo."
    return 0
  fi

  case "$FAMILY" in
    debian) as_root apt-get purge -y "${distro_node_packages[@]}" ;;
    fedora) as_root dnf remove -y "${distro_node_packages[@]}" ;;
    arch)   as_root pacman -Rns --noconfirm "${distro_node_packages[@]}" ;;
  esac

  # The shell remembers where node was, and it is not there any more.
  hash -r 2>/dev/null || true
  node_bin="$(command -v node || true)"
  if [[ -z $node_bin ]]; then
    die "removing ${distro_node_packages[*]} took nvm's node off PATH too"
  fi
  say "node is now $("$node_bin" -v) from $node_bin"
}

remove_distro_node

command -v npm >/dev/null || die "npm is missing, so node is not usable"

say "installing omegga"
npm i -g omegga

version="$(omegga --version 2>/dev/null || true)"
[[ -n $version ]] ||
  die "omegga installed but will not run. https://omegga.brickadia.dev/troubleshooting.html"

say "omegga $version installed"
if [[ $install_node == 1 ]]; then
  say "node came from nvm, so open a new shell before using omegga in this one"
fi
cat <<'EOF'

   mkdir ~/myServer && cd ~/myServer
   omegga

The first start downloads Brickadia through SteamCMD and prints a one-time link
to claim the web UI. https://omegga.brickadia.dev/running.html
EOF
