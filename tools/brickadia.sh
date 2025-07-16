#!/usr/bin/env bash
# runs local brickadia
BIN_DIR=$HOME/.config/omegga/launcher/brickadia-launcher
strip --remove-section=.note.ABI-tag $BIN_DIR/libQt6Core.so.6
export LD_LIBRARY_PATH=$BIN_DIR:$LD_LIBRARY_PATH
exec "$BIN_DIR/main-brickadia-launcher" $@
