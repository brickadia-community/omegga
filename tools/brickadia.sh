#!/usr/bin/env bash
# runs local brickadia
BIN_DIR=/home/$USER/.config/omegga/launcher/brickadia-launcher
export LD_LIBRARY_PATH=$BIN_DIR:$LD_LIBRARY_PATH
exec "$BIN_DIR/main-brickadia-launcher" $@
