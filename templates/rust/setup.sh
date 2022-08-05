#!/usr/bin/env bash

# This script will be run when the plugin is installed...
if command -v cargo; then
  cargo build --release
else
  echo "WARNING: Rust is not installed. This plugin could not be built. It will not work unless it has a bundled binary."
fi

exit 0