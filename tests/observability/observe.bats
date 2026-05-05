#!/usr/bin/env bats

setup() {
    SANDBOX="$(mktemp -d)"
    export SANDBOX
    cd "$SANDBOX"
    git init -q
    git config user.email "t@e.com"
    git config user.name "T"
    git -c init.defaultBranch=main commit --allow-empty -m init -q

    # Write identity directly (not running setup-agent-worktree.sh in these tests).
    mkdir -p .scaffold
    cat > .scaffold/identity.json <<'EOF'
{ "worktree_id": "11111111-1111-4111-8111-111111111111",
  "worktree_label": "primary",
  "created_at": "2026-04-30T14:00:00Z" }
EOF

    BIN="$BATS_TEST_DIRNAME/../../node_modules/.bin/scaffold"
    if [ ! -x "$BIN" ]; then
        BIN="node $BATS_TEST_DIRNAME/../../dist/index.js"
    fi
    export BIN
}

teardown() {
    rm -rf "$SANDBOX"
}

@test "observe event task_claimed appends a JSONL line" {
    run $BIN observe event task_claimed --branch=main --task-id=T-001 --task-title="hello"
    [ "$status" -eq 0 ]
    [ -f .scaffold/activity.jsonl ]
    line="$(cat .scaffold/activity.jsonl)"
    [[ "$line" == *'"type":"task_claimed"'* ]]
    [[ "$line" == *'"task_id":"T-001"'* ]]
    [[ "$line" == *'"task_title":"hello"'* ]]
}

@test "observe progress --json includes the freshly-written event" {
    $BIN observe event task_claimed --branch=main --task-id=T-001 --task-title="hello"
    # Harvest is required for the synthesizer to read the per-worktree ledger.
    $BIN observe harvest --worktree="$SANDBOX"

    run $BIN observe progress --json --since-hours=24
    [ "$status" -eq 0 ]
    [[ "$output" == *'"schema_version":"1.0"'* ]]
    [[ "$output" == *'"task_id":"T-001"'* ]]
    [[ "$output" == *'"in_flight"'* ]]
}

@test "observe event with missing required field exits 2" {
    run $BIN observe event task_claimed --branch=main --task-id=T-001
    [ "$status" -eq 2 ]
}

@test "observe progress prints terminal output by default" {
    $BIN observe event task_claimed --branch=main --task-id=T-031 --task-title="refresh token rotation"
    $BIN observe harvest --worktree="$SANDBOX"

    run $BIN observe progress
    [ "$status" -eq 0 ]
    [[ "$output" == *"build observability — progress"* ]]
    [[ "$output" == *"in flight"* ]]
    [[ "$output" == *"T-031"* ]]
    [[ "$output" == *"availability:"* ]]
}
