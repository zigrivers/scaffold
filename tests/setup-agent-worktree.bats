#!/usr/bin/env bats

# Tests for scripts/setup-agent-worktree.sh

SCRIPT="$BATS_TEST_DIRNAME/../scripts/setup-agent-worktree.sh"

setup() {
    # Create a temporary bare repo to serve as "origin"
    # Resolve through symlinks (macOS /tmp -> /private/tmp)
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export RESOLVED_TMPDIR
    export ORIG_DIR="$RESOLVED_TMPDIR/orig-$$"
    export CLONE_DIR="$RESOLVED_TMPDIR/scaffold-$$"

    mkdir -p "$ORIG_DIR"
    git -C "$ORIG_DIR" init --bare --quiet

    # Clone it so we have a working repo
    git clone --quiet "$ORIG_DIR" "$CLONE_DIR"
    git -C "$CLONE_DIR" config user.email "test@test.com"
    git -C "$CLONE_DIR" config user.name "Test"
    git -C "$CLONE_DIR" commit --allow-empty -m "initial" --quiet
    git -C "$CLONE_DIR" push --quiet 2>/dev/null

    # Copy the script into the clone so SCRIPT_DIR resolves correctly
    mkdir -p "$CLONE_DIR/scripts"
    cp "$SCRIPT" "$CLONE_DIR/scripts/setup-agent-worktree.sh"
    chmod +x "$CLONE_DIR/scripts/setup-agent-worktree.sh"
}

teardown() {
    # Worktrees now live inside the repo at <repo>/.worktrees/, so removing
    # CLONE_DIR (including its .git and worktree metadata) also removes them.
    rm -rf "$ORIG_DIR" "$CLONE_DIR"
}

@test "exits 1 with usage message when no arguments provided" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Usage:"* ]]
}

@test "creates worktree under <repo>/.worktrees/<name>" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-alpha"
    [ "$status" -eq 0 ]
    [ -d "$CLONE_DIR/.worktrees/agent-alpha" ]
}

@test "does not create a sibling worktree directory" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-alpha"
    [ "$status" -eq 0 ]
    [ ! -d "$RESOLVED_TMPDIR/scaffold-$$-agent-alpha" ]
}

@test "ensures .worktrees/ is gitignored" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-alpha"
    [ "$status" -eq 0 ]
    run git -C "$CLONE_DIR" check-ignore -q .worktrees/
    [ "$status" -eq 0 ]
}

@test "does not duplicate .worktrees/ when it is already gitignored" {
    # .worktrees/ already ignored, but the directory does not exist yet — the
    # check must use the trailing-slash form or it false-negatives and appends
    # a duplicate rule. Regression guard for that.
    printf '.worktrees/\n' > "$CLONE_DIR/.gitignore"
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-echo"
    [ "$status" -eq 0 ]
    run grep -c '^\.worktrees/$' "$CLONE_DIR/.gitignore"
    [ "$output" = "1" ]
}

@test "idempotent: succeeds if worktree already exists" {
    # First run creates it
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-beta"
    [ "$status" -eq 0 ]

    # Second run should also succeed
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-beta"
    [ "$status" -eq 0 ]
    [[ "$output" == *"already exists"* ]]
}

@test "normalizes agent name to lowercase with hyphens" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "Agent_Charlie"
    [ "$status" -eq 0 ]
    [ -d "$CLONE_DIR/.worktrees/agent-charlie" ]
}

@test "creates workspace branch for the agent" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-delta"
    [ "$status" -eq 0 ]
    # Check that the branch exists in the worktree
    local worktree_dir="$CLONE_DIR/.worktrees/agent-delta"
    run git -C "$worktree_dir" branch --show-current
    [ "$output" = "agent-delta-workspace" ]
}
