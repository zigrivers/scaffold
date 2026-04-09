#!/usr/bin/env bash
# Verifies gameConfig migration scope. Run before Task 10.
# Uses git ls-files to respect .gitignore automatically.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Find all files containing gameConfig (tracked files only)
files=$(git grep -l 'gameConfig' -- 'src/**' 'content/**' 'docs/**' 'README.md' 'CHANGELOG.md' 2>/dev/null || true)
file_count=$(echo "$files" | grep -c . || echo 0)

# Expected: 26 files total. Mismatch requires updating Appendix B of the spec.
EXPECTED_TOTAL=26

echo "Files containing 'gameConfig': $file_count (expected: $EXPECTED_TOTAL)"
echo ""

# Categorize
echo "=== Production source (MIGRATE: set both fields for game projects) ==="
echo "$files" | grep -E '^src/(types/config|project/adopt|wizard/(wizard|questions)|cli/commands/(adopt|init))\.ts$' | grep -v '\.test\.ts' || true
echo ""
echo "=== Test source (MIGRATE: assert both fields) ==="
echo "$files" | grep -E '\.test\.ts$' || true
echo ""
echo "=== Schema (NO CHANGE — gameConfig stays in schema per Section 5 R2-rej1) ==="
echo "$files" | grep -E '^src/config/schema' || true
echo ""
echo "=== Historical docs (NO CHANGE) ==="
echo "$files" | grep -E '^docs/(superpowers|game-content)' || true
echo ""
echo "=== User-facing docs (UPDATE for v3.10) ==="
echo "$files" | grep -E '^(README|CHANGELOG)\.md$' || true
echo ""

if [ "$file_count" -ne "$EXPECTED_TOTAL" ]; then
  echo "WARNING: count mismatch. Update Appendix B in the spec OR fix the migration."
  exit 1
fi
echo "OK: $file_count files verified matches expected $EXPECTED_TOTAL"
