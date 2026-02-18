#!/usr/bin/env bats

# Tests for scripts/generate-dashboard.sh

SCRIPT="$BATS_TEST_DIRNAME/../scripts/generate-dashboard.sh"

setup() {
    export TMPDIR="${BATS_TEST_TMPDIR:-/tmp}"
    TEST_OUT="$TMPDIR/dashboard-test-$$"
    mkdir -p "$TEST_OUT"
}

teardown() {
    rm -rf "$TEST_OUT"
}

# ─── Exit codes ──────────────────────────────────────────────────

@test "exits 0 with --help" {
    run bash "$SCRIPT" --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"Usage"* ]]
}

@test "exits 0 with --no-open (no .scaffold/ directory)" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
}

@test "exits 0 with --no-open (with .scaffold/ directory)" {
    mkdir -p "$TEST_OUT/project/.scaffold"
    echo '{"completed":["create-prd"],"skipped":["design-system"]}' > "$TEST_OUT/project/.scaffold/config.json"
    run bash -c "cd '$TEST_OUT/project' && bash '$SCRIPT' --no-open --output '$TEST_OUT/dashboard.html'"
    [ "$status" -eq 0 ]
}

# ─── HTML validation ─────────────────────────────────────────────

@test "output file exists and has DOCTYPE" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    [ -f "$TEST_OUT/dashboard.html" ]
    head -1 "$TEST_OUT/dashboard.html" | grep -q '<!DOCTYPE html>'
}

@test "output contains DASHBOARD_DATA" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'DASHBOARD_DATA' "$TEST_OUT/dashboard.html"
}

@test "no external https:// resource references in HTML/CSS" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    # Check <head> and CSS only — JSON data payload may contain URLs from prompt content
    count=$(sed -n '1,/<\/style>/p' "$TEST_OUT/dashboard.html" | grep -c 'https://' || true)
    [ "$count" -eq 0 ]
}

# ─── JSON payload ────────────────────────────────────────────────

@test "--json-only outputs valid JSON" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    echo "$output" | jq . >/dev/null 2>&1
}

@test "JSON payload contains phases array" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    echo "$output" | jq -e '.phases | length > 0' >/dev/null
}

@test "JSON payload contains prompts array" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    echo "$output" | jq -e '.prompts | length > 0' >/dev/null
}

@test "JSON payload contains summary object" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    echo "$output" | jq -e '.summary.total > 0' >/dev/null
}

# ─── Status detection ────────────────────────────────────────────

@test "detects completed from config.json" {
    mkdir -p "$TEST_OUT/project/.scaffold"
    echo '{"completed":["create-prd","tech-stack"],"skipped":[]}' > "$TEST_OUT/project/.scaffold/config.json"
    run bash -c "cd '$TEST_OUT/project' && bash '$SCRIPT' --json-only"
    [ "$status" -eq 0 ]
    completed=$(echo "$output" | jq '[.prompts[] | select(.status == "completed")] | length')
    [ "$completed" -ge 2 ]
}

@test "detects skipped from config.json" {
    mkdir -p "$TEST_OUT/project/.scaffold"
    echo '{"completed":[],"skipped":["design-system"]}' > "$TEST_OUT/project/.scaffold/config.json"
    run bash -c "cd '$TEST_OUT/project' && bash '$SCRIPT' --json-only"
    [ "$status" -eq 0 ]
    skipped=$(echo "$output" | jq '[.prompts[] | select(.status == "skipped")] | length')
    [ "$skipped" -ge 1 ]
}

@test "all pending when no .scaffold/ directory" {
    run bash -c "cd '$TEST_OUT' && bash '$SCRIPT' --json-only"
    [ "$status" -eq 0 ]
    pending=$(echo "$output" | jq '[.prompts[] | select(.status == "pending")] | length')
    total=$(echo "$output" | jq '.prompts | length')
    [ "$pending" -eq "$total" ]
}

# ─── Flags ───────────────────────────────────────────────────────

@test "--no-open does not open browser" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    # If we got here without hanging, --no-open worked
    [ -f "$TEST_OUT/dashboard.html" ]
}

@test "--output writes to specified path" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/custom-output.html"
    [ "$status" -eq 0 ]
    [ -f "$TEST_OUT/custom-output.html" ]
}

@test "--json-only outputs to stdout without HTML" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    # First non-empty character should be { (JSON object)
    first_char=$(echo "$output" | head -1 | cut -c1)
    [ "$first_char" = "{" ]
}

# ─── Theme toggle ────────────────────────────────────────────────

@test "HTML contains theme initialization script" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'scaffold-theme' "$TEST_OUT/dashboard.html"
    grep -q 'data-theme' "$TEST_OUT/dashboard.html"
}

@test "HTML contains toggleTheme function" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'function toggleTheme' "$TEST_OUT/dashboard.html"
}

@test "CSS uses data-theme selector instead of prefers-color-scheme" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q '\[data-theme="dark"\]' "$TEST_OUT/dashboard.html"
    # Should NOT have @media prefers-color-scheme for dark mode tokens
    count=$(grep -c '@media.*prefers-color-scheme.*dark' "$TEST_OUT/dashboard.html" || true)
    [ "$count" -eq 0 ]
}

# ─── Status badges ───────────────────────────────────────────────

@test "HTML contains status-badge elements instead of dots" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'status-badge' "$TEST_OUT/dashboard.html"
}

@test "HTML contains status legend" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'status-legend' "$TEST_OUT/dashboard.html"
}

# ─── Long descriptions ──────────────────────────────────────────

@test "JSON payload contains longDescription for prompts" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    # create-prd should have a non-empty longDescription
    ldesc=$(echo "$output" | jq -r '.prompts[0].longDescription')
    [ -n "$ldesc" ]
    [ "$ldesc" != "null" ]
}

# ─── Prompt content ─────────────────────────────────────────────

@test "JSON payload contains promptContent for prompts" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    # create-prd should have non-empty promptContent
    pcontent=$(echo "$output" | jq -r '.prompts[0].promptContent | length')
    [ "$pcontent" -gt 100 ]
}

@test "HTML contains modal functions" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'function openModal' "$TEST_OUT/dashboard.html"
    grep -q 'function closeModal' "$TEST_OUT/dashboard.html"
    grep -q 'modal-overlay' "$TEST_OUT/dashboard.html"
}

# ─── Beads tasks ─────────────────────────────────────────────────

@test "JSON payload contains beads tasks array" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    echo "$output" | jq -e '.beads.tasks | type == "array"' >/dev/null
}

@test "HTML contains beads filter function" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'function filterBeads' "$TEST_OUT/dashboard.html"
}

@test "JSON uses bd list --all for complete task data" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    # If beads is available, total should include closed tasks
    total=$(echo "$output" | jq '.beads.total')
    closed=$(echo "$output" | jq '.beads.closed')
    # Total should be >= closed (can't have more closed than total)
    [ "$total" -ge "$closed" ]
}

# ─── Bug fix verification ───────────────────────────────────────

@test "beads detection uses config.yaml not directory" {
    # Verify the SKILL.md fix: .beads/config.yaml instead of .beads/ directory
    run grep 'config.yaml' "$BATS_TEST_DIRNAME/../skills/scaffold-pipeline/SKILL.md"
    [ "$status" -eq 0 ]
}

@test "jq enrichment uses captured step variable" {
    # Verify the jq fix: (.step) as $s instead of .step == .step
    run grep 'as \$s' "$BATS_TEST_DIRNAME/../scripts/generate-dashboard.sh"
    [ "$status" -eq 0 ]
}

# ─── Dashboard enhancement: task modals, status tags, filters ────

@test "enriched beads data includes owner and issueType fields" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    # Enriched tasks should have owner, issueType, dependencyCount fields
    echo "$output" | jq -e '.beads.tasks[0] | has("owner", "issueType", "dependencyCount")' >/dev/null
}

@test "enriched beads tasks have deps object with blockedBy and blocks" {
    run bash "$SCRIPT" --json-only
    [ "$status" -eq 0 ]
    echo "$output" | jq -e '.beads.tasks[0].deps | has("blockedBy", "blocks")' >/dev/null
}

@test "HTML contains openBeadModal function" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'function openBeadModal' "$TEST_OUT/dashboard.html"
}

@test "HTML contains relTime function" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'function relTime' "$TEST_OUT/dashboard.html"
}

@test "HTML contains beads status CSS classes" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'st-bead-open' "$TEST_OUT/dashboard.html"
    grep -q 'st-bead-progress' "$TEST_OUT/dashboard.html"
    grep -q 'st-bead-blocked' "$TEST_OUT/dashboard.html"
    grep -q 'st-bead-closed' "$TEST_OUT/dashboard.html"
}

@test "standalone command cards have openModal onclick" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    # Standalone cards are rendered via JS template: openModal(\' + esc(sp.s) + \')
    grep -q "onclick=\"openModal" "$TEST_OUT/dashboard.html"
    # Verify the standalone section's pcard generation includes openModal
    grep -q "openModal.*esc(sp.s)" "$TEST_OUT/dashboard.html"
}

@test "HTML contains priority filter buttons" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'beads-prio-filter' "$TEST_OUT/dashboard.html"
}

@test "HTML contains applyBeadFilters function" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'function applyBeadFilters' "$TEST_OUT/dashboard.html"
}

@test "beads task cards have data-bead-priority attribute" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'data-bead-priority' "$TEST_OUT/dashboard.html"
}

@test "HTML contains bead modal CSS classes" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    grep -q 'bead-meta-grid' "$TEST_OUT/dashboard.html"
    grep -q 'bead-dep-link' "$TEST_OUT/dashboard.html"
}
