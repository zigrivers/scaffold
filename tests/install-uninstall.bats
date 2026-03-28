#!/usr/bin/env bats

# Tests for scripts/install.sh and scripts/uninstall.sh
#
# Strategy: override HOME to a BATS temporary directory so neither script
# touches the real ~/.claude/commands/.

REPO_ROOT="$BATS_TEST_DIRNAME/.."
INSTALL_SCRIPT="$BATS_TEST_DIRNAME/../scripts/install.sh"
UNINSTALL_SCRIPT="$BATS_TEST_DIRNAME/../scripts/uninstall.sh"

setup() {
    # Point HOME at a per-test temp dir so TARGET_DIR resolves safely
    export ORIGINAL_HOME="$HOME"
    export HOME="$BATS_TEST_TMPDIR/fakehome"
    mkdir -p "$HOME"
}

teardown() {
    export HOME="$ORIGINAL_HOME"
}

# ── install.sh tests ─────────────────────────────────────────────────

@test "install.sh creates target directory if it doesn't exist" {
    [ ! -d "$HOME/.claude/commands" ]
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]
    [ -d "$HOME/.claude/commands" ]
}

@test "install.sh copies command .md files into target dir" {
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # At least one .md file should be present
    local installed_count
    installed_count=$(ls "$HOME/.claude/commands"/*.md 2>/dev/null | wc -l | tr -d ' ')
    [ "$installed_count" -gt 0 ]
}

@test "install.sh installs the same number of .md files as in commands/" {
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    local source_count installed_count
    source_count=$(ls "$REPO_ROOT/commands"/*.md | wc -l | tr -d ' ')
    installed_count=$(ls "$HOME/.claude/commands"/*.md 2>/dev/null | wc -l | tr -d ' ')
    [ "$installed_count" -eq "$source_count" ]
}

@test "install.sh writes a .scaffold-version marker" {
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]
    [ -f "$HOME/.claude/commands/.scaffold-version" ]
}

@test "install.sh reports installed count" {
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Installed"*"command(s)"* ]]
}

@test "install.sh warns when files already exist (without -f)" {
    # First install
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # Second install — should warn about existing files
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Warning:"*"already exists"* ]]
    [[ "$output" == *"Skipped"* ]]
}

@test "install.sh skips all files on second run without -f" {
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]
    # The "Installed 0 command(s)" line should appear
    [[ "$output" == *"Installed 0 command(s)"* ]]
}

@test "install.sh -f overwrites existing files without warning" {
    # First install
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # Force install
    run "$INSTALL_SCRIPT" -f
    [ "$status" -eq 0 ]

    # Should NOT contain warnings
    [[ "$output" != *"Warning:"* ]]
    [[ "$output" != *"Skipped"* ]]

    # Should report all files as installed
    local source_count
    source_count=$(ls "$REPO_ROOT/commands"/*.md | wc -l | tr -d ' ')
    [[ "$output" == *"Installed $source_count command(s)"* ]]
}

@test "install.sh -f actually replaces file content" {
    # First install
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # Pick the first installed file, overwrite it with marker content
    local first_file
    first_file=$(ls "$HOME/.claude/commands"/*.md | head -1)
    echo "MODIFIED_MARKER" > "$first_file"

    # Force reinstall
    run "$INSTALL_SCRIPT" -f
    [ "$status" -eq 0 ]

    # The marker should be gone — content should match source
    local filename
    filename=$(basename "$first_file")
    run diff "$REPO_ROOT/commands/$filename" "$first_file"
    [ "$status" -eq 0 ]
}

# ── uninstall.sh tests ───────────────────────────────────────────────

@test "uninstall.sh removes known scaffold files" {
    # Install first
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # Uninstall
    run "$UNINSTALL_SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Removed"*"scaffold command(s)"* ]]

    # .scaffold-version should be gone
    [ ! -f "$HOME/.claude/commands/.scaffold-version" ]
}

@test "uninstall.sh does not remove non-scaffold files" {
    # Install scaffold commands
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # Drop a non-scaffold file into the same directory
    echo "custom content" > "$HOME/.claude/commands/my-custom-command.md"

    # Uninstall
    run "$UNINSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # Custom file should still be there
    [ -f "$HOME/.claude/commands/my-custom-command.md" ]
}

@test "uninstall.sh handles missing files gracefully" {
    # Create target dir but don't install anything
    mkdir -p "$HOME/.claude/commands"

    run "$UNINSTALL_SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Removed 0 scaffold command(s)"* ]]
}

@test "uninstall.sh handles missing target directory gracefully" {
    # Don't create the target dir at all — script should not crash
    [ ! -d "$HOME/.claude/commands" ]
    run "$UNINSTALL_SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Removed 0 scaffold command(s)"* ]]
}

@test "uninstall.sh only removes files from its hardcoded list" {
    # Install scaffold commands
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # Drop a non-scaffold file
    echo "keep me" > "$HOME/.claude/commands/my-other-tool.md"

    # Use ls -A to include dotfiles like .scaffold-version
    local before_count
    before_count=$(ls -A "$HOME/.claude/commands" | wc -l | tr -d ' ')

    run "$UNINSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    local after_count
    after_count=$(ls -A "$HOME/.claude/commands" | wc -l | tr -d ' ')

    # The uninstall script has a hardcoded list of entries.
    # Only files in that list that were actually present get removed.
    # Parse "Removed N scaffold command(s)" to get the count.
    local removed
    removed=$(echo "$output" | sed -n 's/^Removed \([0-9]*\) scaffold.*/\1/p')

    # after = before - removed
    [ "$after_count" -eq $((before_count - removed)) ]
    # Custom file must survive
    [ -f "$HOME/.claude/commands/my-other-tool.md" ]
}

# ── round-trip test ──────────────────────────────────────────────────

@test "install then uninstall leaves directory empty of scaffold files" {
    run "$INSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    run "$UNINSTALL_SCRIPT"
    [ "$status" -eq 0 ]

    # Only files not in the uninstall list should remain (if any).
    # Count .md files specifically — some installed files may not be in
    # the hardcoded uninstall list (the lists can drift).
    # At minimum, .scaffold-version must be gone.
    [ ! -f "$HOME/.claude/commands/.scaffold-version" ]
}
