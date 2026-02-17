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
    rm -rf "$ORIG_DIR" "$CLONE_DIR"
    # Clean up any worktrees that were created
    rm -rf "$RESOLVED_TMPDIR"/scaffold-$$-*
}

@test "exits 1 with usage message when no arguments provided" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Usage:"* ]]
}

@test "creates worktree at expected path" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-alpha"
    [ "$status" -eq 0 ]
    [ -d "$RESOLVED_TMPDIR/scaffold-$$-agent-alpha" ]
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
    [ -d "$RESOLVED_TMPDIR/scaffold-$$-agent-charlie" ]
}

@test "creates workspace branch for the agent" {
    run "$CLONE_DIR/scripts/setup-agent-worktree.sh" "agent-delta"
    [ "$status" -eq 0 ]
    # Check that the branch exists in the worktree
    local worktree_dir="$RESOLVED_TMPDIR/scaffold-$$-agent-delta"
    run git -C "$worktree_dir" branch --show-current
    [ "$output" = "agent-delta-workspace" ]
}
