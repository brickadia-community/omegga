#!/usr/bin/env bash

# This file automatically downloads the brickadia launcher

TAR_FILE=brickadia-launcher.tar.xz
BRICKADIA_URL=https://static.brickadia.com/launcher/1.4/$TAR_FILE
LAUNCHER_PATH=$HOME/.config/omegga/launcher
FILE=$LAUNCHER_PATH/$TAR_FILE
BINARY_PATH=$LAUNCHER_PATH/brickadia-launcher/main-brickadia-launcher

if ! [[ $(which tar) && $(which wget) ]]; then
  echo ">! Missing dependencies, please run:" >&2
  echo "  apt-get install wget tar" >&2
  echo
  exit 1
fi;

if ! [[ $(which omegga) ]]; then
  echo ">! how on earth are you running this without omegga" >&2
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
