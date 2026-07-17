#!/usr/bin/env bats
# tests/agent-ops-merge-queue.bats — merge-queue component templates.

setup() {
  TMP="$(mktemp -d)"
  # Resolve templates the way the installer does: replace known {{KEY}} markers.
  sed -e 's/{{DEFAULT_BRANCH}}/main/g' \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/merge-queue/mq-guard.sh.tmpl" \
    > "$TMP/mq-guard.sh"
  chmod +x "$TMP/mq-guard.sh"
}

teardown() { rm -rf "$TMP"; }

@test "mq-guard blocks a direct gh pr merge" {
  run "$TMP/mq-guard.sh" --check 'gh pr merge 123 --squash --delete-branch'
  [ "$status" -eq 2 ]
  [[ "$output" == *"scaffold mq enqueue"* ]]
}

@test "mq-guard blocks gh pr merge buried in a compound command" {
  run "$TMP/mq-guard.sh" --check 'make check && gh pr merge 5 --squash'
  [ "$status" -eq 2 ]
}

@test "mq-guard allows other gh pr commands" {
  run "$TMP/mq-guard.sh" --check 'gh pr view 123 --json mergedAt'
  [ "$status" -eq 0 ]
}

@test "mq-guard allows the phrase inside a quoted string (PR title)" {
  run "$TMP/mq-guard.sh" --check 'gh pr create --title "never run gh pr merge by hand"'
  [ "$status" -eq 0 ]
}

@test "mq-guard honors the deliberate override env" {
  MQ_DIRECT_MERGE_OK=1 run "$TMP/mq-guard.sh" --check 'gh pr merge 9 --squash'
  [ "$status" -eq 0 ]
}

@test "mq-guard prints no override recipe on block" {
  run "$TMP/mq-guard.sh" --check 'gh pr merge 7'
  [[ "$output" != *"MQ_DIRECT_MERGE_OK"* ]]
}

@test "mq-guard hook mode blocks via stdin JSON envelope" {
  command -v jq >/dev/null 2>&1 || skip "jq not installed"
  run bash -c "echo '{\"tool_input\":{\"command\":\"gh pr merge 3 --squash\"}}' | '$TMP/mq-guard.sh'"
  [ "$status" -eq 2 ]
}

@test "mq-guard allows empty/unparseable hook input (fail open)" {
  command -v jq >/dev/null 2>&1 || skip "jq not installed"
  run bash -c "echo '{}' | '$TMP/mq-guard.sh'"
  [ "$status" -eq 0 ]
}

@test "agent-ops.mk defines the mq targets with doc-comments" {
  MK="$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl"
  grep -qE '^mq-enqueue: ## \[agent-safe\]' "$MK"
  grep -qE '^mq-status: ## \[agent-safe\]' "$MK"
  grep -qE '^mq-daemon: ## \[agent-safe\]' "$MK"
  grep -qE '^mq-eject: ## \[agent-safe\]' "$MK"
  grep -qE '^mq-stats: ## \[agent-safe\]' "$MK"
  grep -qE '^post-merge-watch: ## \[agent-safe\]' "$MK"
}

@test "mq targets self-guard on the scaffold CLI" {
  MK="$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl"
  grep -q 'define mq_guard' "$MK"
  grep -q 'command -v scaffold' "$MK"
}

@test "mq-enqueue requires PR= and is wired through a real make run" {
  WORK="$(mktemp -d)"
  cp "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl" "$WORK/agent-ops.mk"
  printf -- '-include agent-ops.mk\n' > "$WORK/Makefile"
  # stub scaffold on PATH so mq_guard passes and enqueue is observable
  mkdir -p "$WORK/bin"
  printf '#!/usr/bin/env bash\necho "scaffold $*" >> "%s/calls.log"\n' "$WORK" > "$WORK/bin/scaffold"
  chmod +x "$WORK/bin/scaffold"
  run env PATH="$WORK/bin:$PATH" make -C "$WORK" mq-enqueue
  [ "$status" -ne 0 ]
  [[ "$output" == *"PR="* ]]
  run env PATH="$WORK/bin:$PATH" make -C "$WORK" mq-enqueue PR=42
  [ "$status" -eq 0 ]
  grep -q 'mq enqueue --pr 42' "$WORK/calls.log"
  rm -rf "$WORK"
}

@test "post-merge workflow: self-hosted, default-branch push, coalescing concurrency" {
  W="$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/post-merge.yml.tmpl"
  grep -q 'name: post-merge' "$W"
  grep -q 'branches: \[{{DEFAULT_BRANCH}}\]' "$W"
  grep -q 'runs-on: \[self-hosted, macOS, ARM64\]' "$W"
  grep -q 'group: post-merge' "$W"
  grep -q 'cancel-in-progress: true' "$W"
  grep -q 'run: {{FULL_GATE_COMMAND}}' "$W"
  # the merge gate must NOT run here — this is post-merge only (D4')
  ! grep -q 'pull_request' "$W"
}

@test "nightly workflow: schedule + dispatch, full gate, e2e feature-detect, flake report" {
  W="$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/nightly.yml.tmpl"
  grep -q 'schedule:' "$W"
  grep -q 'workflow_dispatch' "$W"
  grep -q 'run: {{FULL_GATE_COMMAND}}' "$W"
  grep -q 'make e2e' "$W"
  grep -q 'scaffold mq stats' "$W"
}
