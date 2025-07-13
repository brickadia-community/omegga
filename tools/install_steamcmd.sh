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
has_lib32gcc="yes" # sorry anyone not running arch/debian
lib32gcc_dep="lib32gcc-s1"
pkg_manager="apt-get install"

# check if lib32-gcc-libs is installed in arch linux
if [[ -f /etc/arch-release ]]; then
  lib32gcc_dep="lib32-gcc-libs"
  pkg_manager="pacman -S"
  has_lib32gcc=$(dpkg -s lib32-gcc-libs >/dev/null 2>&1 && echo "yes" || echo "no")
fi

# check if lib32gcc-s1 exists in debian/ubuntu
if [[ -f /etc/debian_version ]] || [[ -f /etc/lsb-release ]]; then
  lib32gcc_dep="lib32gcc-s1"
  pkg_manager="apt-get install"
  has_lib32gcc=$(dpkg -s lib32gcc-s1 >/dev/null 2>&1 && echo "yes" || echo "no")
fi


if ! [[ $has_tar && $has_wget && $has_lib32gcc == "yes" ]]; then
  wget_dep="wget "
  tar_dep="tar "
  if [[ $has_tar ]] then tar_dep=""; fi
  if [[ $has_wget ]] then wget_dep=""; fi
  if [[ $has_lib32gcc == "yes" ]] then lib32gcc_dep=""; fi

  echo ">! Missing dependencies, please run:" >&2
  echo "  sudo $pkg_manager $wget_dep$tar_dep_$lib32gcc_dep" >&2
  echo
  exit 1
fi;

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
