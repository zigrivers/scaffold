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

TEARDOWN_SCRIPT="$BATS_TEST_DIRNAME/../scripts/teardown-agent-worktree.sh"

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

@test "teardown-agent-worktree.sh refuses to delete the default branch (main)" {
    # Move the primary repo off main so main can be checked out in a worktree —
    # this reproduces what 'gh pr merge --delete-branch' does: it switches the
    # merged worktree onto the default branch before deleting the feature branch.
    git checkout -q -b some-other-branch
    git worktree add "${SANDBOX}-testagent" main 2>/dev/null
    run bash "$TEARDOWN_SCRIPT" "${SANDBOX}-testagent"
    [ "$status" -eq 0 ]
    # The worktree is still removed...
    [ ! -d "${SANDBOX}-testagent" ]
    # ...but main MUST survive.
    [ -n "$(git branch --list main)" ]
    [[ "$output" == *"efus"* ]]
}

@test "teardown-agent-worktree.sh refuses to delete master when it is the default branch" {
    git branch -m main master
    git checkout -q -b some-other-branch
    git worktree add "${SANDBOX}-testagent" master 2>/dev/null
    run bash "$TEARDOWN_SCRIPT" "${SANDBOX}-testagent"
    [ "$status" -eq 0 ]
    [ -n "$(git branch --list master)" ]
}
