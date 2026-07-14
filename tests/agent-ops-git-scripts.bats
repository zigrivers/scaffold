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

@test "setup: creates .worktrees/<name> on branch agent/<name> and excludes .worktrees repo-locally" {
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    [ "$status" -eq 0 ]
    [ -d "$CLONE_DIR/.worktrees/alpha" ]
    run git -C "$CLONE_DIR/.worktrees/alpha" branch --show-current
    [ "$output" = "agent/alpha" ]
    # F5: the exclusion lands in the repo-local .git/info/exclude, NOT the tracked
    # .gitignore — so the shared primary checkout is never dirtied by a tracked-file change.
    grep -q '\.worktrees' "$CLONE_DIR/.git/info/exclude"
    [ ! -f "$CLONE_DIR/.gitignore" ] || ! grep -q '\.worktrees' "$CLONE_DIR/.gitignore"
    # git genuinely ignores the directory.
    run git -C "$CLONE_DIR" check-ignore -q .worktrees/
    [ "$status" -eq 0 ]
}

@test "setup: skips the exclude write when .worktrees is already committed to .gitignore" {
    printf '.worktrees/\n' > "$CLONE_DIR/.gitignore"
    git -C "$CLONE_DIR" add .gitignore
    git -C "$CLONE_DIR" commit -q -m "ignore worktrees"
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    [ "$status" -eq 0 ]
    # Already ignored via the committed .gitignore → info/exclude is not touched.
    [ ! -f "$CLONE_DIR/.git/info/exclude" ] || ! grep -q '\.worktrees' "$CLONE_DIR/.git/info/exclude"
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

@test "setup: branches off the remote's default branch when it is not 'main' (F7)" {
    # A repo whose default branch is 'trunk' — hardcoding origin/main would make
    # `git worktree add` fail. Prove creation resolves origin/HEAD dynamically.
    local o="$RESOLVED_TMPDIR/orig-trunk-$$" c="$RESOLVED_TMPDIR/proj-trunk-$$"
    git init --bare --quiet --initial-branch=trunk "$o"
    git clone --quiet "$o" "$c"
    git -C "$c" config user.email t@t.com
    git -C "$c" config user.name T
    git -C "$c" commit --allow-empty -m initial --quiet
    git -C "$c" push --quiet origin trunk 2>/dev/null
    git -C "$c" remote set-head origin trunk
    mkdir -p "$c/scripts"
    for t in "$TEMPLATES"/*.sh.tmpl; do
        resolve_agent_ops_template "$t" "$c/scripts/$(basename "$t" .tmpl)"
    done
    run env PATH="$CLONE_DIR/stubs:$PATH" bash -c "cd '$c' && scripts/setup-agent-worktree.sh beta"
    [ "$status" -eq 0 ]
    [ -d "$c/.worktrees/beta" ]
    [ "$(git -C "$c/.worktrees/beta" branch --show-current)" = "agent/beta" ]
    # The worktree is based on origin/trunk (same tip), not a nonexistent origin/main.
    [ "$(git -C "$c/.worktrees/beta" rev-parse HEAD)" = "$(git -C "$c" rev-parse origin/trunk)" ]
    rm -rf "$o" "$c"
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

@test "main-sync: fast-forwards a non-'main' default branch (trunk) (G7)" {
    # A repo whose default branch is 'trunk' — hardcoding origin/main would make
    # main-sync a no-op (or error). Prove it resolves origin/HEAD and syncs trunk.
    local o="$RESOLVED_TMPDIR/orig-ms-trunk-$$" c="$RESOLVED_TMPDIR/proj-ms-trunk-$$"
    git init --bare --quiet --initial-branch=trunk "$o"
    git clone --quiet "$o" "$c"
    git -C "$c" config user.email t@t.com
    git -C "$c" config user.name T
    git -C "$c" commit --allow-empty -m initial --quiet
    git -C "$c" push --quiet origin trunk 2>/dev/null
    git -C "$c" remote set-head origin trunk
    mkdir -p "$c/scripts"
    for t in "$TEMPLATES"/*.sh.tmpl; do
        resolve_agent_ops_template "$t" "$c/scripts/$(basename "$t" .tmpl)"
    done
    # advance origin/trunk, then rewind local trunk so it is behind by one.
    git -C "$c" commit --allow-empty -m ahead --quiet
    git -C "$c" push --quiet origin trunk
    git -C "$c" reset --hard --quiet HEAD~1
    run env PATH="$CLONE_DIR/stubs:$PATH" bash -c "cd '$c' && scripts/main-sync.sh"
    [ "$status" -eq 0 ]
    [ "$(git -C "$c" rev-parse trunk)" = "$(git -C "$c" rev-parse origin/trunk)" ]
    rm -rf "$o" "$c"
}

@test "setup: fetch failure is non-fatal — falls back to local tracking refs (G9)" {
    # Break the remote so `git fetch origin` fails; the origin/main tracking ref
    # already exists from the clone, so worktree creation must still succeed.
    git -C "$CLONE_DIR" remote set-url origin "$RESOLVED_TMPDIR/nonexistent-$$.git"
    run bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh gamma"
    [ "$status" -eq 0 ]
    [ -d "$CLONE_DIR/.worktrees/gamma" ]
    [[ "$output" == *"fetch failed"* ]]
    [ "$(git -C "$CLONE_DIR/.worktrees/gamma" branch --show-current)" = "agent/gamma" ]
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

@test "doctor: passes on a repo whose default branch is 'trunk' (G3)" {
    # doctor must resolve origin/HEAD, not assume 'main'. A fresh clone on 'trunk'
    # satisfies every invariant, so the read-only run should exit 0 and name trunk.
    local o="$RESOLVED_TMPDIR/orig-dr-trunk-$$" c="$RESOLVED_TMPDIR/proj-dr-trunk-$$"
    git init --bare --quiet --initial-branch=trunk "$o"
    git clone --quiet "$o" "$c"
    git -C "$c" config user.email t@t.com
    git -C "$c" config user.name T
    git -C "$c" commit --allow-empty -m initial --quiet
    git -C "$c" push --quiet origin trunk 2>/dev/null
    git -C "$c" remote set-head origin trunk
    mkdir -p "$c/scripts"
    for t in "$TEMPLATES"/*.sh.tmpl; do
        resolve_agent_ops_template "$t" "$c/scripts/$(basename "$t" .tmpl)"
    done
    run env PATH="$CLONE_DIR/stubs:$PATH" bash -c "cd '$c' && scripts/doctor.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *trunk* ]]
    [[ "$output" != *"should be on 'main'"* ]]
    rm -rf "$o" "$c"
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

@test "agent-ops.mk: git targets run; staging targets fail cleanly without staging component" {
    sed 's/{{PROJECT_NAME}}/testproj/g' \
        "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl" \
        > "$CLONE_DIR/agent-ops.mk"
    printf -- '-include agent-ops.mk\n' > "$CLONE_DIR/Makefile"
    run make -C "$CLONE_DIR" doctor
    [ "$status" -eq 0 ]
    run make -C "$CLONE_DIR" staging-up
    [ "$status" -ne 0 ]
    [[ "$output" == *"staging component not installed"* ]]
}

@test "bd-guard: blocks bd bootstrap when the DB is populated (and never echoes the command)" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd bootstrap'"
    [ "$status" -eq 2 ]
    [[ "$output" == *BLOCKED* ]]
    # error-text-no-echo: the refusal must not contain the blocked command itself
    [[ "$output" != *"bd bootstrap"* ]]
}

@test "bd-guard: blocks destructive bd init flags and rm/dolt against .beads" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'bd init --reinit-local --discard-remote' 'bd admin reset' 'rm -rf .beads' 'dolt sql --data-dir .beads/embeddeddolt'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 2 ] || { echo "not blocked: $c"; false; }
    done
}

@test "bd-guard: allows bootstrap on a fresh clone (no populated DB)" {
    rm -rf "$CLONE_DIR/.beads"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd bootstrap'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: allows safe bd commands against a populated DB" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'bd ready && bd stats' 'bd dolt commit && bd dolt push' 'make beads-snapshot' 'bd init --init-if-missing'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 0 ] || { echo "wrongly blocked: $c"; false; }
    done
}

@test "bd-guard: BEADS_DESTRUCTIVE_OK=1 overrides the block" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    run bash -c "cd '$CLONE_DIR' && BEADS_DESTRUCTIVE_OK=1 scripts/bd-guard.sh --check 'bd bootstrap'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: hook mode parses the PreToolUse JSON envelope" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    run bash -c "cd '$CLONE_DIR' && printf '%s' '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"bd bootstrap\"}}' | scripts/bd-guard.sh"
    [ "$status" -eq 2 ]
    run bash -c "cd '$CLONE_DIR' && printf '%s' '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"bd stats\"}}' | scripts/bd-guard.sh"
    [ "$status" -eq 0 ]
}

@test "bd-guard: blocks a path-qualified bd (absolute or ./ prefix)" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in '/opt/homebrew/bin/bd bootstrap' './node_modules/.bin/bd init --reinit-local' '/usr/local/bin/bd bootstrap'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 2 ] || { echo "not blocked: $c"; false; }
    done
}

@test "bd-guard: blocks a backslash-newline split bd bootstrap" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    split=$(printf 'bd \\\nbootstrap')
    run bash -c 'cd "$1" && scripts/bd-guard.sh --check "$2"' _ "$CLONE_DIR" "$split"
    [ "$status" -eq 2 ]
}

@test "bd-guard: does NOT block rm of a .beads-backups sibling (word boundary), still guards .beads" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'rm -rf .beads-backups'"
    [ "$status" -eq 0 ]
    # the same holds for a QUOTED .beads-backups path (mask preserves only real .beads)
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'rm -rf \"\$HOME/.beads-backups/project\"'"
    [ "$status" -eq 0 ]
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'rm -rf .beads'"
    [ "$status" -eq 2 ]
    # …but a quoted real .beads path is still blocked
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'rm -rf \"\$PWD/.beads\"'"
    [ "$status" -eq 2 ]
}

@test "bd-guard: honors inline BEADS_DESTRUCTIVE_OK=1 only as a real leading assignment" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    # genuine leading env-assignment → allowed
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'BEADS_DESTRUCTIVE_OK=1 bd bootstrap'"
    [ "$status" -eq 0 ]
    # assignment right after a separator → allowed
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'cd /x && BEADS_DESTRUCTIVE_OK=1 bd bootstrap'"
    [ "$status" -eq 0 ]
    # bare mention inside an echo (not a leading assignment) → still BLOCKED
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'echo BEADS_DESTRUCTIVE_OK=1 && bd bootstrap'"
    [ "$status" -eq 2 ]
    # override attached to a DIFFERENT command in the chain must not bless bd
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'BEADS_DESTRUCTIVE_OK=1 echo x && bd bootstrap'"
    [ "$status" -eq 2 ]
}

@test "bd-guard: a global-option prefix does not evade the destructive-subcommand match" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    # a boolean flag operates on cwd → blocked; --global targets the shared DB → blocked
    for c in 'bd --json init --reinit-local' 'bd -q bootstrap' 'bd --global admin reset'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 2 ] || { echo "not blocked: $c"; false; }
    done
    # -C to a POPULATED target is blocked (detection survives the option prefix)
    mkdir -p "$CLONE_DIR/pop2/.beads/embeddeddolt"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd -C $CLONE_DIR/pop2 bootstrap'"
    [ "$status" -eq 2 ]
    # -C to a genuinely-independent EMPTY target (NOT nested under a populated
    # tree, so bd's upward discovery finds nothing) retargets away → allowed
    local freshdir; freshdir="$(mktemp -d)"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd -C $freshdir bootstrap'"
    [ "$status" -eq 0 ]
    rm -rf "$freshdir"
    # a non-destructive subcommand behind global opts is still allowed
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd -C /some/path ready'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: closes the residual bypasses — command substitution, quoted-space -C, cd-chain" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    # bare command substitution exposes its inner destructive command
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '\$(bd bootstrap)'"
    [ "$status" -eq 2 ]
    # a -C target with spaces (masked) is treated as unresolvable → blocked
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd -C \"my dir\" bootstrap'"
    [ "$status" -eq 2 ]
    # cd into a different POPULATED checkout from an empty cwd → judged against it
    rm -rf "$CLONE_DIR/.beads"
    mkdir -p "$CLONE_DIR/pop3/.beads/embeddeddolt" "$CLONE_DIR/empty4"
    run bash -c "cd '$CLONE_DIR/empty4' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'cd $CLONE_DIR/pop3 && bd bootstrap'"
    [ "$status" -eq 2 ]
    # …but cd into an EMPTY dir then bootstrap stays allowed (fresh clone)
    mkdir -p "$CLONE_DIR/fresh4"
    run bash -c "cd '$CLONE_DIR/empty4' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'cd $CLONE_DIR/fresh4 && bd bootstrap'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: judges --global / --db / BEADS_DB retargets, not just cwd" {
    rm -rf "$CLONE_DIR/.beads"
    mkdir -p "$CLONE_DIR/popdb/.beads/embeddeddolt"; : > "$CLONE_DIR/popdb/.beads/beads.db"
    mkdir -p "$CLONE_DIR/here8"
    # --global targets the shared DB → always blocked
    run bash -c "cd '$CLONE_DIR/here8' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd --global bootstrap'"
    [ "$status" -eq 2 ]
    # --db to an EXISTING db → blocked; to an ABSENT path → allowed (fresh)
    run bash -c "cd '$CLONE_DIR/here8' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd --db $CLONE_DIR/popdb/.beads/beads.db init --reinit-local'"
    [ "$status" -eq 2 ]
    run bash -c "cd '$CLONE_DIR/here8' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd --db /no/such/new.db init --reinit-local'"
    [ "$status" -eq 0 ]
    # BEADS_DB / BEADS_DIR env retarget to a populated target → blocked
    run bash -c "cd '$CLONE_DIR/here8' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'BEADS_DIR=$CLONE_DIR/popdb bd bootstrap'"
    [ "$status" -eq 2 ]
}

@test "bd-guard: a boolean global flag never swallows a bare 'bootstrap' argument (no false positive)" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'bd -v create bootstrap' 'bd --json create bootstrap' 'bd -q show bootstrap'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 0 ] || { echo "wrongly blocked: $c"; false; }
    done
    # …but the real destructive form behind a boolean flag is still blocked
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd --json bootstrap'"
    [ "$status" -eq 2 ]
}

@test "bd-guard: catches attached -C<dir>, upward discovery, and a .beads redirect" {
    # attached short-option form `bd -C<dir>` (bd/pflag accepts it)
    rm -rf "$CLONE_DIR/.beads"
    mkdir -p "$CLONE_DIR/pop7/.beads/embeddeddolt" "$CLONE_DIR/here7"
    run bash -c "cd '$CLONE_DIR/here7' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd -C$CLONE_DIR/pop7 bootstrap'"
    [ "$status" -eq 2 ]
    # bootstrap in a SUBDIR of a populated tree — bd discovers the parent's DB
    mkdir -p "$CLONE_DIR/pop7/sub"
    run bash -c "cd '$CLONE_DIR/pop7/sub' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd bootstrap'"
    [ "$status" -eq 2 ]
    # a .beads that is a redirect (no local DB dir) is treated as populated
    mkdir -p "$CLONE_DIR/redir7/.beads"; : > "$CLONE_DIR/redir7/.beads/redirect"
    run bash -c "cd '$CLONE_DIR/redir7' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd bootstrap'"
    [ "$status" -eq 2 ]
}

@test "bd-guard: a reliable 'cd <fresh> && bd bootstrap' from a populated cwd is allowed (no over-block)" {
    # no grouping → the cd is trustworthy → judged only against the fresh target
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    local freshdir; freshdir="$(mktemp -d)"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'cd $freshdir && bd bootstrap'"
    [ "$status" -eq 0 ]
    rm -rf "$freshdir"
}

@test "bd-guard: cd-tracking is SOUND — never allows a bootstrap that runs in the populated cwd" {
    # From a populated cwd, tricks that really return to (or never leave) it must
    # stay blocked: `cd -`, and a cd scoped inside a command substitution.
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt" "$CLONE_DIR/fresh5"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'cd $CLONE_DIR/fresh5 && cd - && bd bootstrap'"
    [ "$status" -eq 2 ]
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'x=\$(cd $CLONE_DIR/fresh5 && pwd); bd bootstrap'"
    [ "$status" -eq 2 ]
    # a cd on the LEFT of a pipe is a subshell — cwd unchanged on the right
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'cd $CLONE_DIR/fresh5 | bd bootstrap'"
    [ "$status" -eq 2 ]
    # a cd to a MISSING dir fails at runtime → bootstrap runs in the populated cwd
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'cd /no/such/dir-xyz; bd bootstrap'"
    [ "$status" -eq 2 ]
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'cd /no/such/dir-xyz || bd bootstrap'"
    [ "$status" -eq 2 ]
}

@test "bd-guard: rm/dolt against a sibling .beads is judged against that path's directory" {
    rm -rf "$CLONE_DIR/.beads"
    mkdir -p "$CLONE_DIR/pop6/.beads/embeddeddolt" "$CLONE_DIR/here6" "$CLONE_DIR/fresh6"
    # absolute sibling that is populated → blocked even from an unpopulated cwd
    run bash -c "cd '$CLONE_DIR/here6' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'rm -rf $CLONE_DIR/pop6/.beads'"
    [ "$status" -eq 2 ]
    # relative sibling path → unresolvable → conservatively blocked
    run bash -c "cd '$CLONE_DIR/here6' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'rm -rf ../pop6/.beads'"
    [ "$status" -eq 2 ]
    # absolute EMPTY target → allowed
    run bash -c "cd '$CLONE_DIR/here6' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'rm -rf $CLONE_DIR/fresh6/.beads'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: judges bd -C <dir> against the TARGET checkout, not just cwd" {
    # cwd has NO populated DB; the -C target does — the destructive command must
    # still be blocked (and a bare bootstrap from the empty cwd stays allowed).
    rm -rf "$CLONE_DIR/.beads"
    mkdir -p "$CLONE_DIR/primary/.beads/embeddeddolt" "$CLONE_DIR/empty"
    run bash -c "cd '$CLONE_DIR/empty' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd -C $CLONE_DIR/primary bootstrap'"
    [ "$status" -eq 2 ]
    run bash -c "cd '$CLONE_DIR/empty' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd bootstrap'"
    [ "$status" -eq 0 ]
    # equals form (--directory=<dir>) is judged against the target too
    run bash -c "cd '$CLONE_DIR/empty' && '$CLONE_DIR/scripts/bd-guard.sh' --check 'bd --directory=$CLONE_DIR/primary bootstrap'"
    [ "$status" -eq 2 ]
}

@test "bd-guard: conservatively blocks a -C retarget it cannot resolve (variable/tilde/quoted)" {
    rm -rf "$CLONE_DIR/.beads"
    mkdir -p "$CLONE_DIR/empty3"
    for c in 'bd -C "$PRIMARY" bootstrap' 'bd --directory ~/proj bootstrap' 'bd -C "$(pwd)/p" bootstrap'; do
        run bash -c "cd '$CLONE_DIR/empty3' && '$CLONE_DIR/scripts/bd-guard.sh' --check '$c'"
        [ "$status" -eq 2 ] || { echo "not blocked (unresolvable target): $c"; false; }
    done
}

@test "bd-guard: blocks a destructive command on a later line of a multiline block" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    multi=$(printf 'echo preparing\nbd bootstrap')
    run bash -c 'cd "$1" && scripts/bd-guard.sh --check "$2"' _ "$CLONE_DIR" "$multi"
    [ "$status" -eq 2 ]
}

@test "bd-guard: blocks common wrapper/grouping forms (sudo, time, subshell, braces)" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'sudo bd bootstrap' 'time bd bootstrap' '(bd bootstrap)' '{ bd bootstrap; }' 'sudo rm -rf .beads' 'BEADS_ACTOR=me sudo bd bootstrap' 'sudo BEADS_ACTOR=me bd bootstrap'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 2 ] || { echo "not blocked: $c"; false; }
    done
    # a wrapper in front of a safe subcommand is still allowed
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'sudo apt install ripgrep'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: blocks rm of a quoted .beads path, and honors the env override form" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    # a quoted .beads path is preserved as an unresolvable token → blocked
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'rm -rf \"\$PWD/.beads\"'"
    [ "$status" -eq 2 ]
    # `env BEADS_DESTRUCTIVE_OK=1 bd bootstrap` is a valid deliberate override → allowed
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'env BEADS_DESTRUCTIVE_OK=1 bd bootstrap'"
    [ "$status" -eq 0 ]
    # …but a bead title / message that merely names .beads is not a false positive
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd create \"fix the .beads bug\"'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: blocks a destructive command inside if/then/else/while control flow" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'if ! bd ready; then bd bootstrap; fi' \
             'if bd stats; then :; else bd bootstrap; fi' \
             'while ! bd ready; do bd init --force; done'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 2 ] || { echo "not blocked: $c"; false; }
    done
}

@test "bd-guard: blocks wrappers carrying their own options (nice -n, sudo -u, timeout N)" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'nice -n 10 bd bootstrap' 'sudo -u root bd bootstrap' 'sudo --preserve-env bd bootstrap' 'timeout 30 bd bootstrap'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 2 ] || { echo "not blocked: $c"; false; }
    done
}

@test "bd-guard: control-flow and wrappers around SAFE commands are not false-positives" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'if true; then make build; fi' \
             'for f in a b; do echo $f; done' \
             'sudo systemctl restart nginx' \
             'time make check' \
             'while read l; do echo $l; done'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 0 ] || { echo "wrongly blocked: $c"; false; }
    done
}

@test "bd-guard: does NOT block a safe command that merely mentions a destructive one in an argument" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'bd create "Document the bd bootstrap trap"' \
             'git commit -m "explain bd bootstrap risk"' \
             'bd update x --notes "ran bd bootstrap by mistake"' \
             'echo see docs about bd bootstrap' \
             'git commit -m "note: never rm -rf .beads"'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 0 ] || { echo "wrongly blocked: $c"; false; }
    done
    # …but a genuine leading invocation (even behind an env-assignment) is blocked
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'BEADS_ACTOR=me bd bootstrap'"
    [ "$status" -eq 2 ]
}

@test "beads-snapshot: writes issues.jsonl and syncs bd backup when configured" {
    mkdir -p "$CLONE_DIR/.beads"
    # richer bd stub: export writes the -o target; `bd backup status --json`
    # always exits 0 (real bd behavior) but its .dolt.configured boolean differs
    # — detection is via the stable JSON contract, not exit code or prose.
    # BD_BACKUP_CONFIGURED toggles the status boolean; BD_SYNC_EXIT the sync rc.
    cat > "$CLONE_DIR/stubs/bd" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "export" ]; then
    while [ $# -gt 0 ]; do
        if [ "$1" = "-o" ]; then printf '{}\n' > "$2"; exit 0; fi
        shift
    done
    exit 1
fi
if [ "$1" = "backup" ]; then
    case "$2" in
        status)
            if [ "${BD_BACKUP_CONFIGURED:-0}" = "1" ]; then
                printf '{"dolt":{"configured": true}}\n'
            else
                printf '{"dolt":{"configured": false}}\n'
            fi
            exit 0 ;;
        sync) exit "${BD_SYNC_EXIT:-0}" ;;
        *) exit 0 ;;
    esac
fi
exit 0
EOF
    chmod +x "$CLONE_DIR/stubs/bd"
    # unconfigured backup: snapshot succeeds, no backup line
    run bash -c "cd '$CLONE_DIR' && BD_BACKUP_CONFIGURED=0 scripts/beads-snapshot.sh"
    [ "$status" -eq 0 ]
    [ -f "$CLONE_DIR/.beads/issues.jsonl" ]
    [[ "$output" != *"backup"*"updated"* ]]
    # configured backup, sync ok: sync runs and is reported
    run bash -c "cd '$CLONE_DIR' && BD_BACKUP_CONFIGURED=1 BD_SYNC_EXIT=0 scripts/beads-snapshot.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"full-history"* ]]
    # configured backup, sync FAILS: snapshot fails non-zero so reset automation stops
    run bash -c "cd '$CLONE_DIR' && BD_BACKUP_CONFIGURED=1 BD_SYNC_EXIT=1 scripts/beads-snapshot.sh"
    [ "$status" -ne 0 ]
    [[ "$output" == *FAILED* ]]
    [ -f "$CLONE_DIR/.beads/issues.jsonl" ]
}

@test "beads-snapshot: success message does not claim the copy is already committed" {
    run grep -iE 'a committed restore copy' "$BATS_TEST_DIRNAME/../content/assets/agent-ops/git/beads-snapshot.sh.tmpl"
    [ "$status" -ne 0 ]
}

@test "beads-snapshot: success message calls the copy committed, not git-ignored" {
    run grep -i 'git-ignored' "$BATS_TEST_DIRNAME/../content/assets/agent-ops/git/beads-snapshot.sh.tmpl" \
        "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl"
    [ "$status" -ne 0 ]
}

# ---------------------------------------------------------------------------
# primary-checkout-guard.sh — refuse to regenerate a tracked file into the
# primary checkout when it has linked worktrees (nibble port).
# ---------------------------------------------------------------------------

@test "guard: refuses a write into the primary checkout when it has a linked worktree" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    run bash -c "cd '$CLONE_DIR' && scripts/primary-checkout-guard.sh '$CLONE_DIR/docs/generated.html' 'the docs'"
    [ "$status" -eq 1 ]
    [[ "$output" == *"refusing to regenerate"* ]]
    [[ "$output" == *"the docs"* ]]
    [[ "$output" == *"setup-agent-worktree.sh"* ]]
}

@test "guard: no-op in a standalone clone with no linked worktrees" {
    run bash -c "cd '$CLONE_DIR' && scripts/primary-checkout-guard.sh '$CLONE_DIR/docs/generated.html' 'the docs'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "guard: no-op when the output path lives in a linked worktree" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    run bash -c "'$CLONE_DIR/scripts/primary-checkout-guard.sh' '$CLONE_DIR/.worktrees/alpha/docs/generated.html' 'the docs'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "guard: AGENT_OPS_GIT_GUARD_BYPASS=1 allows the write even in a primary with worktrees" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    run bash -c "cd '$CLONE_DIR' && AGENT_OPS_GIT_GUARD_BYPASS=1 scripts/primary-checkout-guard.sh '$CLONE_DIR/docs/generated.html' 'the docs'"
    [ "$status" -eq 0 ]
    [[ "$output" == *bypass* ]]
}

@test "guard: fails open (allows) outside a git repository" {
    local nd; nd="$(mktemp -d)"
    run bash -c "'$CLONE_DIR/scripts/primary-checkout-guard.sh' '$nd/generated.html' 'the docs'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    rm -rf "$nd"
}

@test "guard: when sourced, the function aborts (exit 1) on a guarded primary write" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    run bash -c "cd '$CLONE_DIR' && . scripts/primary-checkout-guard.sh && guard_primary_checkout '$CLONE_DIR/docs/generated.html' 'the docs'"
    [ "$status" -eq 1 ]
    [[ "$output" == *"refusing to regenerate"* ]]
}

@test "guard: follows an output symlink and judges the TARGET's checkout" {
    bash -c "cd '$CLONE_DIR' && scripts/setup-agent-worktree.sh alpha"
    # a symlink INSIDE the worktree pointing at a path in the PRIMARY checkout —
    # writing through it lands in the primary, so the guard must refuse.
    ln -s "$CLONE_DIR/docs/generated.html" "$CLONE_DIR/.worktrees/alpha/link.html"
    run bash -c "'$CLONE_DIR/scripts/primary-checkout-guard.sh' '$CLONE_DIR/.worktrees/alpha/link.html' 'the docs'"
    [ "$status" -eq 1 ]
    [[ "$output" == *"refusing to regenerate"* ]]
}

# ---------------------------------------------------------------------------
# check-regen-artifacts.sh — DETECT and report stray timestamp-only regenerated
# trackers. It must NEVER modify, restore, delete, or stage anything.
# ---------------------------------------------------------------------------

@test "check: reports a timestamp-only regen artifact without modifying it" {
    printf 'header\nGenerated 2026-07-11 05:11 UTC\nbody\n' > "$CLONE_DIR/report.html"
    git -C "$CLONE_DIR" add report.html
    git -C "$CLONE_DIR" commit -q -m "add tracker"
    printf 'header\nGenerated 2026-07-14 01:47 UTC\nbody\n' > "$CLONE_DIR/report.html"
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [[ "$output" == *"stray timestamp-only"* ]]
    [[ "$output" == *report.html* ]]
    # DETECT-ONLY: the file is reported but left exactly as-is (still dirty).
    run git -C "$CLONE_DIR" status --porcelain -- report.html
    [ -n "$output" ]
    grep -q '01:47 UTC' "$CLONE_DIR/report.html"
}

@test "check: reports an embedded-footer timestamp change" {
    printf '<footer>Generated 2026-07-11 05:11 UTC</footer>\n' > "$CLONE_DIR/report.html"
    git -C "$CLONE_DIR" add report.html
    git -C "$CLONE_DIR" commit -q -m "add tracker"
    printf '<footer>Generated 2026-07-14 01:47 UTC</footer>\n' > "$CLONE_DIR/report.html"
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [[ "$output" == *report.html* ]]
    run git -C "$CLONE_DIR" status --porcelain -- report.html
    [ -n "$output" ]     # still dirty — never modified
}

@test "check: does NOT report a real content change" {
    printf 'header\nGenerated 2026-07-11 05:11 UTC\nbody\n' > "$CLONE_DIR/report.html"
    git -C "$CLONE_DIR" add report.html
    git -C "$CLONE_DIR" commit -q -m "add tracker"
    printf 'CHANGED\nGenerated 2026-07-11 05:11 UTC\nbody\n' > "$CLONE_DIR/report.html"
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [[ "$output" != *report.html* ]]
}

@test "check: does NOT report a real change bundled with a timestamp change" {
    printf 'alpha Generated 2026-07-11 05:11 UTC\n' > "$CLONE_DIR/report.html"
    git -C "$CLONE_DIR" add report.html
    git -C "$CLONE_DIR" commit -q -m "add tracker"
    printf 'BETA Generated 2026-07-14 01:47 UTC\n' > "$CLONE_DIR/report.html"
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [[ "$output" != *report.html* ]]
}

@test "check: does NOT report a mode-only change (content identical)" {
    printf 'Generated 2026-07-11 05:11 UTC\n' > "$CLONE_DIR/report.sh"
    git -C "$CLONE_DIR" add report.sh
    git -C "$CLONE_DIR" commit -q -m "add tracker"
    chmod +x "$CLONE_DIR/report.sh"   # mode-only change — file content unchanged
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [[ "$output" != *report.sh* ]]
}

@test "check: does NOT report a timestamp change bundled with a mode change" {
    printf 'Generated 2026-07-11 05:11 UTC\n' > "$CLONE_DIR/report.sh"
    git -C "$CLONE_DIR" add report.sh
    git -C "$CLONE_DIR" commit -q -m "add tracker"
    printf 'Generated 2026-07-14 01:47 UTC\n' > "$CLONE_DIR/report.sh"   # timestamp change
    chmod +x "$CLONE_DIR/report.sh"                                       # + a real mode change
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [[ "$output" != *report.sh* ]]   # not purely a timestamp change → not reported
}

@test "check: ignores a staged change" {
    printf 'a\nGenerated 2026-07-11 05:11 UTC\nb\n' > "$CLONE_DIR/report.html"
    git -C "$CLONE_DIR" add report.html
    git -C "$CLONE_DIR" commit -q -m "add tracker"
    printf 'a\nGenerated 2026-07-14 01:47 UTC\nb\n' > "$CLONE_DIR/report.html"
    git -C "$CLONE_DIR" add report.html   # STAGED, not a working-tree-only change
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [[ "$output" != *report.html* ]]
}

@test "check: is silent on a clean tree" {
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "check: parses a git-quoted non-ASCII path (café.html)" {
    # core.quotePath=true C-quotes non-ASCII paths in porcelain output; NUL parsing
    # must recover the real path so the artifact is still detected and reported.
    printf 'Generated 2026-07-11 05:11 UTC\n' > "$CLONE_DIR/café.html"
    git -C "$CLONE_DIR" add "café.html"
    git -C "$CLONE_DIR" commit -q -m "unicode tracker"
    printf 'Generated 2026-07-14 01:47 UTC\n' > "$CLONE_DIR/café.html"
    run bash -c "'$CLONE_DIR/scripts/check-regen-artifacts.sh' '$CLONE_DIR'"
    [ "$status" -eq 0 ]
    [[ "$output" == *café.html* ]]
    run git -C "$CLONE_DIR" status --porcelain -- "café.html"
    [ -n "$output" ]     # reported, never modified
}

@test "main-sync: reports (does not modify) a stray timestamp-only artifact before ff" {
    printf 'x\nGenerated 2026-07-11 05:11 UTC\ny\n' > "$CLONE_DIR/report.html"
    git -C "$CLONE_DIR" add report.html
    git -C "$CLONE_DIR" commit -q -m "add tracker"
    git -C "$CLONE_DIR" push -q origin main
    # advance origin/main (empty commit touches nothing), rewind local so it is behind by 1
    git -C "$CLONE_DIR" commit --allow-empty -q -m ahead
    git -C "$CLONE_DIR" push -q origin main
    git -C "$CLONE_DIR" reset --hard -q HEAD~1
    # a stray timestamp-only regen artifact sits in the primary checkout
    printf 'x\nGenerated 2026-07-14 01:47 UTC\ny\n' > "$CLONE_DIR/report.html"
    run bash -c "cd '$CLONE_DIR' && scripts/main-sync.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"stray timestamp-only"* ]]
    [[ "$output" == *report.html* ]]
    # DETECT-ONLY: the stray artifact is reported but NOT modified…
    grep -q '01:47 UTC' "$CLONE_DIR/report.html"
    # …and the ff-only sync still advanced main (the empty commit didn't touch report.html)
    [ "$(git -C "$CLONE_DIR" rev-parse main)" = "$(git -C "$CLONE_DIR" rev-parse origin/main)" ]
}
