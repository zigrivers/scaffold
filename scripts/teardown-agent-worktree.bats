#!/usr/bin/env bats

setup() {
    SANDBOX="$(mktemp -d)"
    export SANDBOX
    cd "$SANDBOX"
    git init -q -b main
    git config user.email "t@e.com"
    git config user.name "T"
    git commit --allow-empty -q -m init
}

teardown() {
    rm -rf "$SANDBOX" "${SANDBOX}-testagent" 2>/dev/null || true
}

TEARDOWN_SCRIPT="$BATS_TEST_DIRNAME/teardown-agent-worktree.sh"

@test "teardown-agent-worktree.sh removes the worktree" {
    git worktree add -b testagent-workspace "${SANDBOX}-testagent" 2>/dev/null
    [ -d "${SANDBOX}-testagent" ]
    run bash "$TEARDOWN_SCRIPT" "${SANDBOX}-testagent"
    [ "$status" -eq 0 ]
    [ ! -d "${SANDBOX}-testagent" ]
}

@test "teardown-agent-worktree.sh deletes the workspace branch" {
    git worktree add -b testagent-workspace "${SANDBOX}-testagent" 2>/dev/null
    run bash "$TEARDOWN_SCRIPT" "${SANDBOX}-testagent"
    [ "$status" -eq 0 ]
    [ -z "$(git branch --list testagent-workspace)" ]
}

@test "teardown-agent-worktree.sh exits 1 when worktree path does not exist" {
    run bash "$TEARDOWN_SCRIPT" /tmp/no-such-worktree-path-$$
    [ "$status" -eq 1 ]
    [[ "$output" == *"does not exist"* ]]
}
