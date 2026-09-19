#!/usr/bin/env bash

# Prints one version's section of CHANGELOG.md: the heading text on the first
# line, a blank line, then the body.
#
# The release workflow reads this, so a version the changelog does not mention
# fails here rather than publishing a release with an empty body.
#
# Headings carry the release date, which GitHub already shows, so the workflow
# titles the release after the tag and uses only --body from here.
#
# Usage: tools/release-notes.sh [version] [--title|--body]
#
# `version` defaults to package.json's, which is the version `just tag` is about
# to tag, so `just notes` previews exactly what the next release will say.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

VERSION=""
WHAT="all"
for arg in "$@"; do
    case "$arg" in
        --title|--body) WHAT="$arg" ;;
        "") ;;
        -*)
            echo "!> unknown option '${arg}' (expected --title or --body)" >&2
            exit 1
            ;;
        *) VERSION="$arg" ;;
    esac
done
[ -n "$VERSION" ] || VERSION="$(node -p 'require("./package.json").version')"

# tags are `v1.19.0` but the changelog headings are not, so a tag name works here
VERSION="${VERSION#v}"

# The heading is matched on the version followed by end-of-line or a space, so
# `## 1.1.0` never matches a lookup for `1.1` and `## 1.10.0 - ...` never
# matches one for `1.1.0`.
SECTION="$(
    awk -v ver="$VERSION" '
        { sub(/\r$/, "") }  # CHANGELOG.md may be checked out CRLF
        index($0, "## ") == 1 {
            if (found) exit
            rest = substr($0, 4)
            if (rest == ver || index(rest, ver " ") == 1) { found = 1; print rest; next }
        }
        found { print }
    ' CHANGELOG.md
)"

if [ -z "$SECTION" ]; then
    echo "!> CHANGELOG.md has no '## ${VERSION}' section" >&2
    exit 1
fi

TITLE="$(printf '%s\n' "$SECTION" | head -n 1)"
# Trim the blank lines the section picks up on either side of the body, so the
# release body does not open or close with whitespace.
BODY="$(printf '%s\n' "$SECTION" | tail -n +2 | sed -e '/./,$!d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')"

if [ -z "$BODY" ]; then
    echo "!> the '## ${VERSION}' section of CHANGELOG.md is empty" >&2
    exit 1
fi

case "$WHAT" in
    --title) printf '%s\n' "$TITLE" ;;
    --body)  printf '%s\n' "$BODY" ;;
    all)     printf '%s\n\n%s\n' "$TITLE" "$BODY" ;;
esac
