#!/usr/bin/env bash

# This file automatically downloads steamcmd

TAR_FILE=steamcmd_linux.tar.gz
STEAMCMD_URL=https://steamcdn-a.akamaihd.net/client/installer/$TAR_FILE
STEAMCMD_PATH=$HOME/.config/omegga/steam
FILE=$STEAMCMD_PATH/$TAR_FILE
STEAMCMD=$STEAMCMD_PATH/steamcmd.sh

has_tar=$(which tar)
has_wget=$(which wget)
has_lib32gcc=$(dpkg -s lib32gcc-s1 >/dev/null 2>&1 && echo "yes" || echo "no")

if ! [[ $has_tar && $has_wget && $has_lib32gcc == "yes" ]]; then
  wget_dep="wget "
  tar_dep="tar "
  lib32gcc_dep="lib32gcc-s1"
  if [[ $has_tar ]] then tar_dep=""; fi
  if [[ $has_wget ]] then wget_dep=""; fi
  if [[ $has_lib32gcc == "yes" ]] then lib32gcc_dep=""; fi

  echo ">! Missing dependencies, please run:" >&2
  echo "  sudo apt-get install $wget_dep$tar_dep_$lib32gcc_dep" >&2
  echo
  exit 1
fi;

if ! [[ $(which omegga) ]]; then
  echo ">! how on earth are you running this without omegga" >&2
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
