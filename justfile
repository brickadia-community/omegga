# List available recipes
default:
    @just --list

build:
    npm run build
    npm run build:frontend

dist:
    npm run dist

# the version .github/workflows/docs.yml builds the published book with
MDBOOK_VERSION := "0.5.4"

# Build the docs book into ./book (`just mdbook serve` previews with live reload)
mdbook *ARGS='build':
    @command -v mdbook >/dev/null || { \
      echo "mdbook not installed. cargo install mdbook --version {{ MDBOOK_VERSION }}" >&2; \
      echo "or grab a binary from https://github.com/rust-lang/mdBook/releases" >&2; \
      exit 1; }
    mdbook {{ ARGS }}

REMOTE := env_var_or_default("REMOTE", "origin")

# Tag the version in package.json and push it, refusing to move an existing tag
tag:
    tools/tag.sh {{ REMOTE }}
