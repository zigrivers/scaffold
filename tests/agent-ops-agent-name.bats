#!/usr/bin/env bats
# Behavior tests for the agent-name generator (spec: Work-Beads Agent Identity
# & Bead Traceability §5.1). The generator emits agent-<adjective>-<noun> names
# with collision checks against in-progress bead assignees, worktree
# .agent-env actors, and local agent/* branches. AGENT_NAME_ENTROPY_FILE is a
# test-only hook that replaces /dev/urandom with a fixed byte stream.

load fixtures/agent-ops/resolve-template.bash

TEMPLATE="$BATS_TEST_DIRNAME/../content/assets/agent-ops/git/agent-name.sh.tmpl"

setup() {
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export FX="$RESOLVED_TMPDIR/agent-name-$$"
    mkdir -p "$FX/bin"
    resolve_agent_ops_template "$TEMPLATE" "$FX/agent-name.sh"

    # Deterministic entropy: all-zero bytes select index 0 of each wordlist.
    export ZERO_ENTROPY="$FX/zero-entropy"
    head -c 64 /dev/zero > "$ZERO_ENTROPY"

    # Default bd stub: no in-progress beads.
    cat > "$FX/bin/bd" <<'EOF'
#!/usr/bin/env bash
echo '[]'
EOF
    chmod +x "$FX/bin/bd"
    export PATH="$FX/bin:$PATH"
}

teardown() { rm -rf "$FX"; }

@test "emits a name matching agent-<adjective>-<noun>-<NN> (always suffixed)" {
    run "$FX/agent-name.sh"
    [ "$status" -eq 0 ]
    [[ "$output" =~ ^agent-[a-z]+-[a-z]+-[0-9]{2}$ ]]
}

@test "--short drops the agent- prefix (for worktree names)" {
    run "$FX/agent-name.sh" --short
    [ "$status" -eq 0 ]
    [[ "$output" =~ ^[a-z]+-[a-z]+-[0-9]{2}$ ]]
    [[ "$output" != agent-* ]]
}

@test "avoids a name already assigned to an in-progress bead" {
    # First run with fixed entropy: learn the deterministic pick.
    local first
    first="$(AGENT_NAME_ENTROPY_FILE="$ZERO_ENTROPY" "$FX/agent-name.sh")"
    [[ "$first" =~ ^agent-[a-z]+-[a-z]+-[0-9]{2}$ ]]
    # Now bd reports that exact name as a live assignee — same entropy must NOT
    # return it again (resample or suffix fallback).
    cat > "$FX/bin/bd" <<EOF
#!/usr/bin/env bash
echo '[{"id":"proj-1","assignee":"$first","status":"in_progress"}]'
EOF
    chmod +x "$FX/bin/bd"
    # 2>/dev/null: the name goes to stdout; diagnostics go to stderr, which
    # bats' `run` would otherwise merge into $output.
    run env AGENT_NAME_ENTROPY_FILE="$ZERO_ENTROPY" bash -c "'$FX/agent-name.sh' 2>/dev/null"
    [ "$status" -eq 0 ]
    [ "$output" != "$first" ]
    [[ "$output" =~ ^agent-[a-z]+-[a-z]+-[0-9]{2}$ ]]
}

@test "avoids an actor persisted in a worktree .agent-env (sourceable export form)" {
    local first
    first="$(AGENT_NAME_ENTROPY_FILE="$ZERO_ENTROPY" "$FX/agent-name.sh")"
    mkdir -p "$FX/repo/.worktrees/old-agent"
    printf 'export BEADS_ACTOR=%s\n' "$first" > "$FX/repo/.worktrees/old-agent/.agent-env"
    run env AGENT_NAME_ENTROPY_FILE="$ZERO_ENTROPY" bash -c "cd '$FX/repo' && '$FX/agent-name.sh'"
    [ "$status" -eq 0 ]
    [ "$output" != "$first" ]
}

@test "still emits a name when bd is not installed (degrades, never fails)" {
    rm "$FX/bin/bd"
    run "$FX/agent-name.sh"
    [ "$status" -eq 0 ]
    [[ "$output" =~ ^agent-[a-z]+-[a-z]+-[0-9]{2}$ ]]
}

@test "never mutates anything (no files created in cwd)" {
    mkdir -p "$FX/empty" && cd "$FX/empty"
    run "$FX/agent-name.sh"
    [ "$status" -eq 0 ]
    [ -z "$(ls -A "$FX/empty")" ]
}

@test "falls back to \$RANDOM and still emits a valid name when the entropy source is unreadable" {
    run env AGENT_NAME_ENTROPY_FILE="$FX/does-not-exist" "$FX/agent-name.sh"
    [ "$status" -eq 0 ]
    [[ "$output" =~ ^agent-[a-z]+-[a-z]+-[0-9]{2}$ ]]
}

@test "collision check also strips quoting in .agent-env values" {
    local first
    first="$(AGENT_NAME_ENTROPY_FILE="$ZERO_ENTROPY" "$FX/agent-name.sh")"
    mkdir -p "$FX/repo2/.worktrees/old"
    printf 'export BEADS_ACTOR="%s"\n' "$first" > "$FX/repo2/.worktrees/old/.agent-env"
    run env AGENT_NAME_ENTROPY_FILE="$ZERO_ENTROPY" bash -c "cd '$FX/repo2' && '$FX/agent-name.sh'"
    [ "$status" -eq 0 ]
    [ "$output" != "$first" ]
}

@test "fails closed (exit 1, no name) when every candidate is taken — never emits a collision" {
    # Zero entropy pins the word pair; the bd stub claims ALL 100 suffixes.
    cat > "$FX/bin/bd" <<'STUB'
#!/usr/bin/env bash
printf '['
for i in $(seq -w 0 99); do
  [ "$i" != "00" ] && printf ','
  printf '{"id":"x-%s","assignee":"agent-bouncy-badger-%s","status":"in_progress"}' "$i" "$i"
done
printf ']\n'
STUB
    chmod +x "$FX/bin/bd"
    run env AGENT_NAME_ENTROPY_FILE="$ZERO_ENTROPY" bash -c "'$FX/agent-name.sh' 2>&1"
    [ "$status" -eq 1 ]
    [[ "$output" == *"refusing to emit"* ]]
}
