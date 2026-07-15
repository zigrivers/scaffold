#!/usr/bin/env bats
# The shipped bd-claim smoke test (spec §12 / §9) must pass against the installed
# bd (or skip cleanly when bd is absent). Runs the resolved template as a project
# would; the script self-isolates in a temp DB, so this never touches real beads.

load fixtures/agent-ops/resolve-template.bash

TEMPLATE="$BATS_TEST_DIRNAME/../content/assets/agent-ops/git/bd-claim-smoke-test.sh.tmpl"

setup() {
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export WORK="$RESOLVED_TMPDIR/smoke-$$"
    mkdir -p "$WORK"
    resolve_agent_ops_template "$TEMPLATE" "$WORK/bd-claim-smoke-test.sh"
}

teardown() { rm -rf "$WORK"; }

@test "bd-claim smoke test PASSes against the installed bd (skips if bd absent)" {
    command -v bd >/dev/null 2>&1 || skip "bd not installed"
    run "$WORK/bd-claim-smoke-test.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"PASS"* || "$output" == *"SKIP"* ]]
}

@test "bd-claim smoke test SKIPs cleanly (exit 0) when bd is not on PATH" {
    local shimdir="$WORK/shim"
    mkdir -p "$shimdir"
    # Provide only the interpreter; deliberately omit bd so the guard fires first.
    ln -s "$(command -v bash)" "$shimdir/bash"
    run env -i PATH="$shimdir" HOME="$WORK" bash "$WORK/bd-claim-smoke-test.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"SKIP"* ]]
}
