#!/usr/bin/env bash

if uname -r | grep Microsoft > /dev/null; then
  echo "WSL1"
elif [ -d /run/WSL ]; then
  echo "WSL2"
else
  echo "LINUX"
fi
