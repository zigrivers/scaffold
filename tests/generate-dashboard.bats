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

@test "no external https:// references in output" {
    run bash "$SCRIPT" --no-open --output "$TEST_OUT/dashboard.html"
    [ "$status" -eq 0 ]
    # Should have zero external resource references (data URIs and inline only)
    count=$(grep -c 'https://' "$TEST_OUT/dashboard.html" || true)
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
