#!/usr/bin/env bash
# Verifies gameConfig migration scope. Run before Task 10.
# Uses `git grep -l` against tracked files in the listed paths.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Find all files containing gameConfig (tracked files only)
files=$(git grep -l 'gameConfig' -- 'src/**' 'content/**' 'docs/**' 'README.md' 'CHANGELOG.md' 2>/dev/null || true)
# Count non-empty lines; awk 'NF' filters blanks without the grep exit-code
# noise that `grep -c . || echo 0` introduced (which produced a stray "0\n0"
# on empty input and tripped the numeric comparison below).
file_count=$(printf '%s\n' "$files" | awk 'NF' | wc -l | tr -d ' ')

# Expected: 26 files total. Mismatch requires updating Appendix B of the spec.
EXPECTED_TOTAL=26

echo "Files containing 'gameConfig': $file_count (expected: $EXPECTED_TOTAL)"
echo ""

# Category regexes — keep in sync with the buckets printed below AND the
# uncategorized check at the bottom of this script.
PROD_RE='^src/(types/config|project/adopt|wizard/(wizard|questions)|cli/commands/(adopt|init))\.ts$'
TEST_RE='\.test\.ts$'
SCHEMA_RE='^src/config/schema'
HIST_DOCS_RE='^docs/(superpowers|game-content)'
USER_DOCS_RE='^(README|CHANGELOG)\.md$'

# Categorize
echo "=== Production source (MIGRATE: set both fields for game projects) ==="
echo "$files" | grep -E "$PROD_RE" | grep -v "$TEST_RE" || true
echo ""
echo "=== Test source (MIGRATE: assert both fields) ==="
echo "$files" | grep -E "$TEST_RE" || true
echo ""
echo "=== Schema (NO CHANGE — gameConfig stays in schema per Section 5 R2-rej1) ==="
echo "$files" | grep -E "$SCHEMA_RE" || true
echo ""
echo "=== Historical docs (NO CHANGE) ==="
echo "$files" | grep -E "$HIST_DOCS_RE" || true
echo ""
echo "=== User-facing docs (UPDATE for v3.10) ==="
echo "$files" | grep -E "$USER_DOCS_RE" || true
echo ""

# Detect files that match none of the above buckets. Any such file is a
# signal: either add it to an existing bucket or create a new one.
uncategorized=$(echo "$files" \
  | grep -vE "$PROD_RE" \
  | grep -vE "$TEST_RE" \
  | grep -vE "$SCHEMA_RE" \
  | grep -vE "$HIST_DOCS_RE" \
  | grep -vE "$USER_DOCS_RE" \
  | grep -v '^$' || true)

if [ -n "$uncategorized" ]; then
  echo "ERROR: Uncategorized files with 'gameConfig' references — add them to the appropriate bucket above:"
  echo "$uncategorized" | sed 's/^/  /'
  exit 1
fi

if [ "$file_count" -ne "$EXPECTED_TOTAL" ]; then
  echo "WARNING: count mismatch. Update Appendix B in the spec OR fix the migration."
  exit 1
fi
echo "OK: $file_count files verified matches expected $EXPECTED_TOTAL"
