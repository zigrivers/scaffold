#!/usr/bin/env bats
# Behavior tests for the agent-ops git-component templates, run against a
# sandbox repo with resolved placeholders. Mirrors tests/setup-agent-worktree.bats
# sandbox conventions.

load fixtures/agent-ops/resolve-template.bash

TEMPLATES="$BATS_TEST_DIRNAME/../content/assets/agent-ops/git"

setup() {
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export ORIG_DIR="$RESOLVED_TMPDIR/orig-$$"
    export CLONE_DIR="$RESOLVED_TMPDIR/proj-$$"
    mkdir -p "$ORIG_DIR"
    git -C "$ORIG_DIR" init --bare --quiet --initial-branch=main
    git clone --quiet "$ORIG_DIR" "$CLONE_DIR"
    git -C "$CLONE_DIR" config user.email t@t.com
    git -C "$CLONE_DIR" config user.name T
    git -C "$CLONE_DIR" commit --allow-empty -m initial --quiet
    git -C "$CLONE_DIR" push --quiet origin main 2>/dev/null
    mkdir -p "$CLONE_DIR/scripts"
    for t in "$TEMPLATES"/*.sh.tmpl; do
        name="$(basename "$t" .tmpl)"
        resolve_agent_ops_template "$t" "$CLONE_DIR/scripts/$name"
    done
    # Stub gh and bd so preflight paths run without network/tools
    mkdir -p "$CLONE_DIR/stubs"
    cat > "$CLONE_DIR/stubs/gh" <<'EOF'
#!/usr/bin/env bash
# `gh pr list ... --json title` consumers get an empty list by default
echo "[]"
EOF
    cat > "$CLONE_DIR/stubs/bd" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
    chmod +x "$CLONE_DIR/stubs/gh" "$CLONE_DIR/stubs/bd"
    export PATH="$CLONE_DIR/stubs:$PATH"
}

teardown() { rm -rf "$ORIG_DIR" "$CLONE_DIR"; }

@test "setup: creates .worktrees/<name> on branch agent/<name> and gitignores .worktrees" {
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    [ "$status" -eq 0 ]
    [ -d "$CLONE_DIR/.worktrees/alpha" ]
    run git -C "$CLONE_DIR/.worktrees/alpha" branch --show-current
    [ "$output" = "agent/alpha" ]
    grep -q '\.worktrees' "$CLONE_DIR/.gitignore"
}

@test "setup: sets per-worktree agent identity with project domain" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    run git -C "$CLONE_DIR/.worktrees/alpha" config user.email
    [ "$output" = "agent-alpha@testproj.local" ]
}

@test "setup: is idempotent" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    [ "$status" -eq 0 ]
}

@test "setup: --preflight-only reports overlap against in-flight PR titles" {
    cat > "$CLONE_DIR/stubs/gh" <<'EOF'
#!/usr/bin/env bash
echo '[{"title":"feat: add user login flow"}]'
EOF
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh --preflight-only --task 'user login flow'"
    [ "$status" -eq 0 ]
    [[ "$output" == *login* ]]
}

@test "main-sync: fast-forwards main from a worktree" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    git -C "$CLONE_DIR" commit --allow-empty -m ahead --quiet
    git -C "$CLONE_DIR" push --quiet origin main
    git -C "$CLONE_DIR" reset --hard --quiet HEAD~1
    run bash -c "cd '$CLONE_DIR/.worktrees/alpha' && ../../scripts/main-sync.sh"
    [ "$status" -eq 0 ]
    [ "$(git -C "$CLONE_DIR" rev-parse main)" = "$(git -C "$CLONE_DIR" rev-parse origin/main)" ]
}

@test "doctor: clean primary on main passes; detached primary is diagnosed" {
    run bash -c "cd '$CLONE_DIR' && scripts/doctor.sh"
    [ "$status" -eq 0 ]
    git -C "$CLONE_DIR" checkout --quiet --detach HEAD
    run bash -c "cd '$CLONE_DIR' && scripts/doctor.sh"
    [ "$status" -ne 0 ]
    run bash -c "cd '$CLONE_DIR' && scripts/doctor.sh --fix"
    [ "$status" -eq 0 ]
    run git -C "$CLONE_DIR" branch --show-current
    [ "$output" = "main" ]
}

@test "prune: removes a branch merged by ancestry and reports triage for unmerged" {
    git -C "$CLONE_DIR" checkout --quiet -b feat/done
    git -C "$CLONE_DIR" commit --allow-empty -m done --quiet
    git -C "$CLONE_DIR" checkout --quiet main
    git -C "$CLONE_DIR" merge --quiet --ff-only feat/done
    git -C "$CLONE_DIR" push --quiet origin main
    git -C "$CLONE_DIR" checkout --quiet -b feat/wip
    git -C "$CLONE_DIR" commit --allow-empty -m wip --quiet
    git -C "$CLONE_DIR" checkout --quiet main
    run bash -c "cd '$CLONE_DIR' && scripts/cleanup-merged-branches.sh"
    [ "$status" -eq 0 ]
    run git -C "$CLONE_DIR" branch --list feat/done
    [ -z "$output" ]
    run git -C "$CLONE_DIR" branch --list feat/wip
    [ -n "$output" ]
}

@test "beads-snapshot: no-ops gracefully when bd is absent" {
    rm "$CLONE_DIR/stubs/bd"
    run bash -c "cd '$CLONE_DIR' && scripts/beads-snapshot.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *bd* ]]
}
