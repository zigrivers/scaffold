#!/usr/bin/env bats

# Regression guard: agent-facing docs must not contain the literal
# string "P0/P1/P2", which would re-introduce the hardcoded threshold
# this work removed (see docs/superpowers/specs/2026-04-28-mmr-fix-threshold-config-design.md).
#
# Allowlist: CHANGELOG.md (historical entries), docs/ (frozen design docs
# and historical content), and tests/ (this file references the pattern
# explicitly to enforce against it). Severity-tier definitions in JSON
# schemas inside prompts use the pipe-separated form `P0|P1|P2|P3`,
# which does NOT match this guard's slash-separated pattern.

ROOT="$BATS_TEST_DIRNAME/.."

@test "no agent-facing doc contains literal P0/P1/P2" {
    cd "$ROOT"
    # Search across CLAUDE.md and content/, exclude CHANGELOG and tests
    matches=$(grep -rn 'P0/P1/P2' \
        --include='*.md' \
        CLAUDE.md content/ \
        2>/dev/null || true)
    if [ -n "$matches" ]; then
        echo "Found hardcoded P0/P1/P2 in agent-facing docs:"
        echo "$matches"
        echo ""
        echo "Replace with threshold-relative language:"
        echo "  'findings at or above \`fix_threshold\`'"
        echo "  or 'blocking finding(s)'"
        return 1
    fi
}

@test "guard does not flag pipe-separated severity definitions" {
    cd "$ROOT"
    # Sanity check: ensure the JSON-schema enum form is still allowed
    pipes=$(grep -r 'P0|P1|P2|P3' content/ 2>/dev/null | head -1 || true)
    [ -n "$pipes" ]
}
