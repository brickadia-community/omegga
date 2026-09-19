# List available recipes
default:
    @just --list

build:
    npm run build
    npm run build:frontend

dist:
    npm run dist

# Everything CI runs: linters, both tsconfigs, tests, and generated API docs
check:
    npm run lint
    npm run typecheck
    CI=true npm test
    npm run docs:check

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

# Preview the CHANGELOG section the release workflow puts in the release body
notes *ARGS:
    tools/release-notes.sh {{ ARGS }}

# Announce a release to DISCORD_WEBHOOK_URL (`just announce --dry-run` to preview)
announce *ARGS:
    tools/discord-release.mjs {{ ARGS }}

# Pushing a `v*` tag only *stages* the release; it is promoted on npmjs.com.
# This publishes directly instead, which needs an npm OTP. `prepublishOnly`
# builds what the package ships, so neither path can upload an unbuilt module.

# Publish to npm, the last step of a release
publish:
    npm publish
