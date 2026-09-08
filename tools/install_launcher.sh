#!/usr/bin/env bash

# This file automatically downloads the brickadia launcher

TAR_FILE=brickadia-launcher.tar.xz
BRICKADIA_URL=https://github.com/brickadia-community/omegga/raw/old-launcher/$TAR_FILE
LAUNCHER_PATH=$HOME/.config/omegga/launcher
FILE=$LAUNCHER_PATH/$TAR_FILE
BINARY_PATH=$LAUNCHER_PATH/brickadia-launcher/main-brickadia-launcher

if ! [[ $(which tar) && $(which wget) && $(which xz) ]]; then
  # the package holding xz is the only name that moves: xz-utils on Debian and
  # Ubuntu, xz everywhere else
  echo ">! Missing dependencies. Install wget, tar and xz:" >&2
  echo "  Debian/Ubuntu: sudo apt-get install wget tar xz-utils" >&2
  echo "  Fedora:        sudo dnf install wget tar xz" >&2
  echo "  Arch:          sudo pacman -S wget tar xz" >&2
  echo
  exit 1
fi;

if [[ -f $BINARY_PATH ]]; then
  echo ">> Launcher already installed!"
  exit 0
fi

mkdir -p $LAUNCHER_PATH

if [[ -f $FILE ]]; then
  echo ">> Launcher tar already downloaded!"
else
  echo ">> Downloading Brickadia Launcher tar"
  wget $BRICKADIA_URL -P $LAUNCHER_PATH
fi

if [[ -f $BINARY_PATH ]]; then
  echo ">> Launcher already installed!"
else
  echo ">> Extracting Brickadia Launcher tar"
  tar xJf $FILE -C $LAUNCHER_PATH
fi
