#!/bin/bash
# Validate YAML frontmatter in command .md files
# Usage: ./scripts/validate-frontmatter.sh <file1.md> [file2.md ...]
#
# Checks that each file has YAML frontmatter (--- delimited)
# with a required 'description' field.
#
# Exit codes:
#   0 - All files valid
#   1 - Validation failure or file not found
#   2 - Usage error (no arguments)

set -euo pipefail

if [[ $# -eq 0 ]]; then
    echo "Usage: $(basename "$0") <file1.md> [file2.md ...]" >&2
    exit 2
fi

errors=0

for file in "$@"; do
    if [[ ! -f "${file}" ]]; then
        echo "Error: ${file} not found" >&2
        errors=1
        continue
    fi

    # Extract frontmatter between first pair of --- delimiters
    frontmatter=$(awk '/^---$/ { count++; next } count == 1 { print } count >= 2 { exit }' "${file}")

    if [[ -z "${frontmatter}" ]]; then
        echo "Error: ${file} — no YAML frontmatter found" >&2
        errors=1
        continue
    fi

    if ! echo "${frontmatter}" | grep -q '^description:'; then
        echo "Error: ${file} — missing 'description' field in frontmatter" >&2
        errors=1
        continue
    fi

    # detect: block sanity (D4) — must declare all:/any:, and every list item
    # must be exactly one path: or cmd: check (timeout: continuation lines are
    # indented deeper and pass through).
    if echo "${frontmatter}" | grep -q '^detect:'; then
        detect_block=$(echo "${frontmatter}" | awk '/^detect:/{flag=1; next} flag && /^[^ ]/{flag=0} flag {print}')
        if ! echo "${detect_block}" | grep -qE '^  (all|any):'; then
            echo "Error: ${file} — detect: must declare all: or any:" >&2
            errors=1
            continue
        fi
        if echo "${detect_block}" | grep -E '^    - ' | grep -qvE '^    - (path|cmd): '; then
            echo "Error: ${file} — detect: list items must be 'path:' or 'cmd:' checks" >&2
            errors=1
            continue
        fi
    fi
done

exit "${errors}"
