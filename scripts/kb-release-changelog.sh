#!/bin/bash
# Emit an updated CHANGELOG.md (to stdout) with a new dated knowledge-freshness
# release block inserted directly under the `## [Unreleased]` heading.
#
# Reads the refreshed knowledge entry slugs on stdin (one per line); they are
# de-duplicated and sorted for a deterministic, reviewable list. The block mirrors
# the existing "Knowledge freshness refresh (N entries)" house style.
#
# Pure: reads the changelog file and stdin, writes the result to stdout. The
# caller is responsible for writing it back.
#
# Bash 3.2+ compatible (no associative arrays).
#
# Usage:
#   printf '%s\n' api-design database-design \
#     | bash scripts/kb-release-changelog.sh \
#         --version 3.35.0 --date 2026-06-14 --kb-version 0.1.20 \
#         --changelog CHANGELOG.md

set -euo pipefail

version=""
date=""
kb_version=""
changelog=""

while [ $# -gt 0 ]; do
  case "$1" in
    --version) version="$2"; shift 2 ;;
    --date) date="$2"; shift 2 ;;
    --kb-version) kb_version="$2"; shift 2 ;;
    --changelog) changelog="$2"; shift 2 ;;
    *) echo "kb-release-changelog: unknown arg: $1" >&2; exit 2 ;;
  esac
done

for required in version date kb_version changelog; do
  eval "val=\$$required"
  if [ -z "$val" ]; then
    echo "kb-release-changelog: --${required//_/-} is required" >&2
    exit 2
  fi
done

if [ ! -f "$changelog" ]; then
  echo "kb-release-changelog: changelog not found: $changelog" >&2
  exit 1
fi

# Read, trim, drop blanks, de-dupe, sort the entry slugs.
sorted=()
while IFS= read -r line; do
  trimmed="$(printf '%s' "$line" | tr -d '[:space:]')"
  [ -n "$trimmed" ] && sorted+=("$trimmed")
done < <(sort -u)

if [ "${#sorted[@]}" -eq 0 ]; then
  echo "kb-release-changelog: no entry slugs on stdin" >&2
  exit 2
fi

n="${#sorted[@]}"
if [ "$n" -eq 1 ]; then noun="entry"; else noun="entries"; fi

# Build a backticked, Oxford-comma list on a single line.
list=""
i=0
for s in "${sorted[@]}"; do
  i=$((i + 1))
  bt="\`$s\`"
  if [ "$i" -eq 1 ]; then
    list="$bt"
  elif [ "$i" -eq "$n" ]; then
    if [ "$n" -eq 2 ]; then list="$list and $bt"; else list="$list, and $bt"; fi
  else
    list="$list, $bt"
  fi
done

block="## [$version] — $date

### Changed

- **Knowledge freshness refresh ($n $noun).** Refreshed against current upstream sources with measured review/retrieval dates and source hashes: $list. KB \`VERSION\` → $kb_version."

# Insert the block immediately after the first `## [Unreleased]` heading.
# A shell loop (not `awk -v`) so the multi-line block is portable to macOS awk,
# which rejects embedded newlines in a -v variable.
inserted=0
while IFS= read -r cl_line || [ -n "$cl_line" ]; do
  printf '%s\n' "$cl_line"
  if [ "$inserted" -eq 0 ] && [ "$cl_line" = "## [Unreleased]" ]; then
    printf '\n%s\n' "$block"
    inserted=1
  fi
done < "$changelog"

if [ "$inserted" -eq 0 ]; then
  echo "kb-release-changelog: no ## [Unreleased] heading found in $changelog" >&2
  exit 1
fi
