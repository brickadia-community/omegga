#!/usr/bin/env bash

# This file automatically downloads steamcmd

TAR_FILE=steamcmd_linux.tar.gz
STEAMCMD_URL=https://steamcdn-a.akamaihd.net/client/installer/$TAR_FILE
STEAMCMD_PATH=$HOME/.config/omegga/steam
FILE=$STEAMCMD_PATH/$TAR_FILE
STEAMCMD=$STEAMCMD_PATH/steamcmd.sh

has_global_steamcmd=$(which steamcmd 2>/dev/null)
if [[ -f $has_global_steamcmd ]]; then
  # create a steamcmd.sh that runs the global steamcmd
  mkdir -p $STEAMCMD_PATH
  # check if STEAMCMD already exists
  if [[ -f $STEAMCMD ]]; then
    echo ">> Steamcmd already exists at $STEAMCMD, skipping global steamcmd setup"
    exit 0
  fi

  # use a heredoc
  cat <<'EOF' > $STEAMCMD
#!/usr/bin/env bash
exec steamcmd "$@"
EOF
  chmod +x $STEAMCMD
  echo ">> Using global steamcmd at $has_global_steamcmd"
  exit 0
fi

has_tar=$(which tar)
has_wget=$(which wget)

# steamcmd is a 32-bit binary, so it needs 32-bit gcc libraries under whatever
# name and package manager this distro uses. ID_LIKE covers the derivatives.
distro=""
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  case " ${ID:-} ${ID_LIKE:-} " in
    *" arch "*)                           distro="arch" ;;
    *" fedora "*|*" rhel "*|*" centos "*) distro="fedora" ;;
    *" debian "*|*" ubuntu "*)            distro="debian" ;;
  esac
fi

case "$distro" in
  arch)
    lib32gcc_dep="lib32-gcc-libs"
    pkg_manager="pacman -S"
    has_lib32gcc=$(pacman -Q lib32-gcc-libs >/dev/null 2>&1 && echo "yes" || echo "no")
    ;;
  fedora)
    lib32gcc_dep="glibc.i686 libgcc.i686 libstdc++.i686"
    pkg_manager="dnf install"
    has_lib32gcc=$(rpm -q libgcc.i686 >/dev/null 2>&1 && rpm -q libstdc++.i686 >/dev/null 2>&1 && echo "yes" || echo "no")
    ;;
  debian)
    lib32gcc_dep="lib32gcc-s1"
    pkg_manager="apt-get install"
    has_lib32gcc=$(dpkg -s lib32gcc-s1 >/dev/null 2>&1 && echo "yes" || echo "no")
    ;;
  *)
    # An unrecognised distro gets the benefit of the doubt rather than a wrong
    # package name: steamcmd will say so itself if the libraries are missing.
    lib32gcc_dep=""
    pkg_manager="<your package manager>"
    has_lib32gcc="yes"
    ;;
esac

if ! [[ $has_tar && $has_wget && $has_lib32gcc == "yes" ]]; then
  wget_dep="wget "
  tar_dep="tar "
  if [[ $has_tar ]]; then tar_dep=""; fi
  if [[ $has_wget ]]; then wget_dep=""; fi
  if [[ $has_lib32gcc == "yes" ]]; then lib32gcc_dep=""; fi

  echo ">! Missing dependencies, please run:" >&2
  echo "  sudo $pkg_manager $wget_dep$tar_dep$lib32gcc_dep" >&2
  echo
  exit 1
fi;

# steamcmd's own OpenSSL reads the trust store from this one path and reports an
# empty one as being offline, which sends people looking at their network for a
# missing symlink. Fedora ships no bundle file at any legacy path.
#
# Stopping here rather than warning: steamcmd retries instead of giving up when
# it cannot verify anything, so carrying on looks like omegga hanging on first
# start.
CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
EXTRACTED_BUNDLE=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
if [[ ! -e $CA_BUNDLE ]]; then
  echo ">! $CA_BUNDLE is missing. steamcmd reads CA certificates from that" >&2
  echo ">! path, and without it every download fails as 'Steamcmd needs to be" >&2
  echo ">! online to update'." >&2
  if [[ -f $EXTRACTED_BUNDLE ]]; then
    echo ">! Point it at the bundle this system already has:" >&2
    echo "  sudo ln -s $EXTRACTED_BUNDLE $CA_BUNDLE" >&2
    echo >&2
    exit 1
  fi
  echo ">! Install your distro's ca-certificates package." >&2
  echo >&2
fi

if [[ -f $STEAMCMD ]]; then
  echo ">> Steamcmd already installed, checking for updates..."
  $STEAMCMD +login anonymous +quit
  exit 0
fi

mkdir -p $STEAMCMD_PATH

if [[ -f $FILE ]]; then
  echo ">> Steamcmd tar already downloaded!"
else
  echo ">> Downloading steamcmd tar"
  wget $STEAMCMD_URL -P $STEAMCMD_PATH
fi

if [[ -f $STEAMCMD ]]; then
  echo ">> Steamcmd already installed!"
else
  echo ">> Extracting steamcmd tar"
  tar xf $FILE -C $STEAMCMD_PATH
fi

echo ">> Checking steamcmd for updates..."
$STEAMCMD +login anonymous +quit
