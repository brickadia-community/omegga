#!/usr/bin/env bash

# This file tags the version in package.json and pushes it. It never moves an
# existing tag - if the version is already tagged, bump package.json instead.
#
# Usage: tools/tag.sh [remote]  (default: origin)

set -euo pipefail

REMOTE="${1:-${REMOTE:-origin}}"

cd "$(git rev-parse --show-toplevel)"

VERSION="$(node -p 'require("./package.json").version')"
TAG="v${VERSION}"

# the tag has to point at a commit, not at whatever is lying around
if [ -n "$(git status --porcelain)" ]; then
    echo "!> working tree is dirty, commit before tagging ${TAG}" >&2
    exit 1
fi

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
    echo "!> ${TAG} already exists locally" >&2
    exit 1
fi

# 0 found, 2 absent, anything else means the remote could not be read - do not
# tag on an unknown remote state, the push would just fail afterwards
set +e
git ls-remote --exit-code --tags "$REMOTE" "refs/tags/${TAG}" >/dev/null 2>&1
REMOTE_CHECK=$?
set -e
case "${REMOTE_CHECK}" in
    0)
        echo "!> ${TAG} already exists on ${REMOTE}" >&2
        exit 1
        ;;
    2) ;;
    *)
        echo "!> could not reach ${REMOTE} to check for ${TAG}" >&2
        exit 1
        ;;
esac

git tag -a "${TAG}" -m "${TAG}"
git push "$REMOTE" "${TAG}"
echo ">> pushed ${TAG} ($(git rev-parse --short HEAD))"
