# List available recipes
default:
    @just --list

build:
    npm run build
    npm run build:frontend

dist:
    npm run dist

REMOTE := env_var_or_default("REMOTE", "origin")

# Tag the version in package.json and push it, refusing to move an existing tag
tag:
    tools/tag.sh {{ REMOTE }}
