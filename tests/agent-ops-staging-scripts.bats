#!/usr/bin/env bats
# Behavior tests for the agent-ops staging-component templates (per-worktree
# Docker isolation), run against a sandbox repo with resolved placeholders.
# Shares the resolver fixture + bands.sh with tests/agent-ops-git-scripts.bats.

load fixtures/agent-ops/resolve-template.bash

TEMPLATES="$BATS_TEST_DIRNAME/../content/assets/agent-ops/staging"

setup() {
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export REPO="$RESOLVED_TMPDIR/stg-$$"
    mkdir -p "$REPO/scripts/ops"
    git -C "$REPO" init --quiet --initial-branch=main
    git -C "$REPO" config user.email t@t.com
    git -C "$REPO" config user.name T
    git -C "$REPO" commit --allow-empty -m initial --quiet
    resolve_agent_ops_template "$TEMPLATES/staging-env.sh.tmpl" "$REPO/scripts/ops/staging-env.sh"
}

teardown() { rm -rf "$REPO"; }

# helper: source staging-env.sh in a subshell at a path and echo one var
env_var_at() { bash -c "cd '$1' && source scripts/ops/staging-env.sh && echo \${$2}"; }

@test "offset is deterministic and within 1..254" {
    o1=$(env_var_at "$REPO" STAGING_OFFSET)
    o2=$(env_var_at "$REPO" STAGING_OFFSET)
    [ "$o1" = "$o2" ]
    [ "$o1" -ge 1 ] && [ "$o1" -le 254 ]
    expected=$(( $(printf '%s' "$(cd "$REPO" && git rev-parse --show-toplevel)" | cksum | awk '{print $1}') % 254 + 1 ))
    [ "$o1" = "$expected" ]
}

@test "worktree gets banded ports and hashed compose project; primary gets shared" {
    git -C "$REPO" worktree add --quiet "$REPO/.worktrees/a" -b agent/a
    mkdir -p "$REPO/.worktrees/a/scripts/ops"
    cp "$REPO/scripts/ops/staging-env.sh" "$REPO/.worktrees/a/scripts/ops/"
    o=$(env_var_at "$REPO/.worktrees/a" STAGING_OFFSET)
    [ "$(env_var_at "$REPO/.worktrees/a" PORT_POSTGRES)" = "$(( 20000 + o ))" ]
    [ "$(env_var_at "$REPO/.worktrees/a" PORT_API)" = "$(( 21000 + o ))" ]
    [[ "$(env_var_at "$REPO/.worktrees/a" COMPOSE_PROJECT_NAME)" == testproj-wt-* ]]
    [ "$(env_var_at "$REPO/.worktrees/a" STAGING_SUBNET)" = "10.$o.0.0/16" ]
    # primary checkout selects the shared stack with fixed ports
    [ "$(env_var_at "$REPO" COMPOSE_PROJECT_NAME)" = "testproj" ]
    [ "$(env_var_at "$REPO" PORT_POSTGRES)" = "55432" ]
    [ "$(env_var_at "$REPO" PORT_API)" = "8001" ]
}

@test "dash-named service resolves a valid PORT_ var (var-name safety)" {
    git -C "$REPO" worktree add --quiet "$REPO/.worktrees/c" -b agent/c
    mkdir -p "$REPO/.worktrees/c/scripts/ops"
    cp "$REPO/scripts/ops/staging-env.sh" "$REPO/.worktrees/c/scripts/ops/"
    o=$(env_var_at "$REPO/.worktrees/c" STAGING_OFFSET)
    # redis-cache -> PORT_REDIS_CACHE, banded from BAND_redis_cache=22000
    [ "$(env_var_at "$REPO/.worktrees/c" PORT_REDIS_CACHE)" = "$(( 22000 + o ))" ]
    # primary checkout gets the shared port SHARED_redis_cache=6379
    [ "$(env_var_at "$REPO" PORT_REDIS_CACHE)" = "6379" ]
}

@test "no services configured: sourcing no-ops with a clear message (does not crash)" {
    # Staging installed without a docker section — the generated block is empty,
    # so SERVICES is never defined. Must no-op, not crash on unbound $SERVICES.
    sed -e 's/{{PROJECT_NAME}}/testproj/g' \
        -e '/{{SERVICE_PORT_BANDS}}/d' \
        "$TEMPLATES/staging-env.sh.tmpl" > "$REPO/scripts/ops/staging-env.sh"
    chmod +x "$REPO/scripts/ops/staging-env.sh"
    run bash -c "cd '$REPO' && source scripts/ops/staging-env.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"no services configured"* ]]
    [[ "$output" == *"staging disabled"* ]]
}

@test "STAGING_WT_OFFSET overrides the derived offset" {
    run bash -c "cd '$REPO' && STAGING_WT_OFFSET=7 source scripts/ops/staging-env.sh && echo \$STAGING_OFFSET"
    [ "$output" = "7" ]
}

@test "selecting the shared stack from a worktree is refused" {
    git -C "$REPO" worktree add --quiet "$REPO/.worktrees/b" -b agent/b
    mkdir -p "$REPO/.worktrees/b/scripts/ops"
    cp "$REPO/scripts/ops/staging-env.sh" "$REPO/.worktrees/b/scripts/ops/"
    run bash -c "cd '$REPO/.worktrees/b' && STAGING_COMPOSE_PROJECT=testproj source scripts/ops/staging-env.sh"
    [ "$status" -ne 0 ]
    [[ "$output" == *primary* ]]
}

@test "offset collision with a live sibling warns (LIVE_WT_OFFSETS hook), never fails (G2)" {
    git -C "$REPO" worktree add --quiet "$REPO/.worktrees/d" -b agent/d
    mkdir -p "$REPO/.worktrees/d/scripts/ops"
    cp "$REPO/scripts/ops/staging-env.sh" "$REPO/.worktrees/d/scripts/ops/"
    o=$(env_var_at "$REPO/.worktrees/d" STAGING_OFFSET)
    # A sibling that resolves to the SAME slot must produce a loud warning naming
    # STAGING_WT_OFFSET; sourcing still succeeds (warn-only, never fail).
    run bash -c "cd '$REPO/.worktrees/d' && LIVE_WT_OFFSETS='$o' source scripts/ops/staging-env.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"collides"* ]]
    [[ "$output" == *"STAGING_WT_OFFSET"* ]]
    # A non-colliding sibling slot produces no collision warning.
    other=$(( o == 254 ? 1 : o + 1 ))
    run bash -c "cd '$REPO/.worktrees/d' && LIVE_WT_OFFSETS='$other' source scripts/ops/staging-env.sh"
    [ "$status" -eq 0 ]
    [[ "$output" != *"collides"* ]]
}

@test "sourcing staging-env does not leak strict mode into the caller (G8)" {
    # Caller has errexit OFF; after sourcing, a failing command must NOT abort the
    # shell — proving `set -euo pipefail` was save/restored, not leaked.
    run bash -c "cd '$REPO' && set +e; source scripts/ops/staging-env.sh; false; echo SURVIVED"
    [ "$status" -eq 0 ]
    [[ "$output" == *SURVIVED* ]]
    # And the happy-path exports still survive the restore.
    [ "$(env_var_at "$REPO" COMPOSE_PROJECT_NAME)" = "testproj" ]
}

@test "staging-down refuses from the primary checkout; names staging-shared-down (G5)" {
    sed 's/{{PROJECT_NAME}}/testproj/g' \
        "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl" \
        > "$REPO/agent-ops.mk"
    printf -- '-include agent-ops.mk\n' > "$REPO/Makefile"
    # From the PRIMARY checkout, staging-down must refuse before touching docker
    # (it would wipe the shared stack) and point at the ask-first alternative.
    run make -C "$REPO" staging-down
    [ "$status" -ne 0 ]
    [[ "$output" == *worktree-only* ]]
    [[ "$output" == *staging-shared-down* ]]
}

@test "staging-shared-down refuses from a worktree (G5)" {
    sed 's/{{PROJECT_NAME}}/testproj/g' \
        "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl" \
        > "$REPO/agent-ops.mk"
    git -C "$REPO" worktree add --quiet "$REPO/.worktrees/e" -b agent/e
    mkdir -p "$REPO/.worktrees/e/scripts/ops"
    cp "$REPO/scripts/ops/staging-env.sh" "$REPO/.worktrees/e/scripts/ops/"
    cp "$REPO/agent-ops.mk" "$REPO/.worktrees/e/agent-ops.mk"
    printf -- '-include agent-ops.mk\n' > "$REPO/.worktrees/e/Makefile"
    run make -C "$REPO/.worktrees/e" staging-shared-down
    [ "$status" -ne 0 ]
    [[ "$output" == *"only from the primary"* ]]
}

@test "docker-env pins DOCKER_CONTEXT via eval, not sourcing (F2)" {
    resolve_agent_ops_template "$TEMPLATES/docker-env.sh.tmpl" "$REPO/scripts/ops/docker-env.sh"
    mkdir -p "$REPO/stubs"
    cat > "$REPO/stubs/docker" <<'EOF'
#!/usr/bin/env bash
# `docker context inspect <ctx>` succeeds so docker-env pins the context.
exit 0
EOF
    chmod +x "$REPO/stubs/docker"
    # eval (what the make targets now do) DOES export DOCKER_CONTEXT.
    run env -u DOCKER_CONTEXT -u DOCKER_HOST PATH="$REPO/stubs:$PATH" \
        bash -c "cd '$REPO' && eval \"\$(bash scripts/ops/docker-env.sh)\"; echo \"CTX=\${DOCKER_CONTEXT:-unset}\""
    [ "$status" -eq 0 ]
    [[ "$output" == *"CTX=default"* ]]
    # sourcing it (the old, buggy approach) is a no-op — the script only PRINTS the export.
    run env -u DOCKER_CONTEXT -u DOCKER_HOST PATH="$REPO/stubs:$PATH" \
        bash -c "cd '$REPO' && source scripts/ops/docker-env.sh >/dev/null; echo \"CTX=\${DOCKER_CONTEXT:-unset}\""
    [ "$status" -eq 0 ]
    [[ "$output" == *"CTX=unset"* ]]
}

@test "staging-up omits --env-file when staging.env is absent, adds it when present (F3)" {
    resolve_agent_ops_template "$TEMPLATES/docker-env.sh.tmpl" "$REPO/scripts/ops/docker-env.sh"
    sed 's/{{PROJECT_NAME}}/testproj/g' \
        "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl" \
        > "$REPO/agent-ops.mk"
    printf -- '-include agent-ops.mk\n' > "$REPO/Makefile"
    mkdir -p "$REPO/ops/compose" "$REPO/stubs"
    : > "$REPO/ops/compose/staging.yml"
    cat > "$REPO/stubs/docker" <<'EOF'
#!/usr/bin/env bash
# record compose invocations; succeed for everything (incl. context inspect)
[[ "$1" == "compose" ]] && echo "$*" >> "${DOCKER_CALLS:?}"
exit 0
EOF
    chmod +x "$REPO/stubs/docker"
    export DOCKER_CALLS="$REPO/docker-calls.log"

    # Fresh project: no ops/compose/staging.env yet → recipe must NOT pass --env-file.
    : > "$DOCKER_CALLS"
    run env -u DOCKER_CONTEXT -u DOCKER_HOST PATH="$REPO/stubs:$PATH" make -C "$REPO" staging-up
    [ "$status" -eq 0 ]
    run cat "$DOCKER_CALLS"
    [[ "$output" == *"compose -f ops/compose/staging.yml up -d"* ]]
    [[ "$output" != *"--env-file"* ]]

    # After the local env file is created → the recipe includes --env-file.
    : > "$DOCKER_CALLS"
    printf 'FOO=bar\n' > "$REPO/ops/compose/staging.env"
    run env -u DOCKER_CONTEXT -u DOCKER_HOST PATH="$REPO/stubs:$PATH" make -C "$REPO" staging-up
    [ "$status" -eq 0 ]
    run cat "$DOCKER_CALLS"
    [[ "$output" == *"--env-file ops/compose/staging.env"* ]]
}

@test "teardown --reap only names orphaned -wt- stacks (dry run with stubbed docker)" {
    resolve_agent_ops_template "$TEMPLATES/staging-teardown.sh.tmpl" "$REPO/scripts/ops/staging-teardown.sh"
    mkdir -p "$REPO/stubs"
    cat > "$REPO/stubs/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"compose ls"* || "$*" == *"ls --format"* ]]; then
  echo "testproj-wt-12345"
  echo "testproj-wt-99999"
  echo "testproj"
  exit 0
fi
echo "docker $*" >> "${DOCKER_CALLS:?}"
EOF
    chmod +x "$REPO/stubs/docker"
    export DOCKER_CALLS="$REPO/docker-calls.log"
    # one live worktree whose hash we register as 12345 via env override hook
    run bash -c "cd '$REPO' && PATH='$REPO/stubs:$PATH' LIVE_WT_HASHES='12345' scripts/ops/staging-teardown.sh --reap --dry-run"
    [ "$status" -eq 0 ]
    [[ "$output" == *testproj-wt-99999* ]]
    [[ "$output" != *"testproj-wt-12345"* ]]
    # the shared stack is never a reap candidate
    [[ "$output" != *"reap testproj"$'\n'* ]]
}
