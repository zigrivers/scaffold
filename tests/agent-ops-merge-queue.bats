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
  grep -q '{{FULL_GATE_COMMAND}}' "$W"   # block scalar: `run: |` then the marker
  # the merge gate must NOT run here — this is post-merge only (D4')
  ! grep -q 'pull_request' "$W"
}

@test "nightly workflow: schedule + dispatch, full gate, e2e feature-detect, flake report" {
  W="$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/nightly.yml.tmpl"
  grep -q 'schedule:' "$W"
  grep -q 'workflow_dispatch' "$W"
  grep -q '{{FULL_GATE_COMMAND}}' "$W"   # block scalar
  grep -q 'make e2e' "$W"
  grep -q 'scaffold mq stats' "$W"
}

@test "setup-gh-runner: --print-only previews without side effects" {
  WORK="$(mktemp -d)"
  sed -e 's/{{PROJECT_NAME}}/myproj/g' \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/setup-gh-runner.sh.tmpl" \
    > "$WORK/setup-gh-runner.sh"
  chmod +x "$WORK/setup-gh-runner.sh"
  mkdir -p "$WORK/bin"
  printf '#!/usr/bin/env bash\nif [ "$1 $2" = "repo view" ]; then echo "acme/myproj"; else exit 1; fi\n' > "$WORK/bin/gh"
  chmod +x "$WORK/bin/gh"
  run env PATH="$WORK/bin:$PATH" HOME="$WORK" "$WORK/setup-gh-runner.sh" --print-only
  [ "$status" -eq 0 ]
  [[ "$output" == *"acme/myproj"* ]]
  [[ "$output" == *"myproj-mq-runner"* ]]
  [ ! -d "$WORK/.gh-runner" ]
  rm -rf "$WORK"
}

@test "setup-gh-runner: fails loudly without gh" {
  WORK="$(mktemp -d)"
  sed -e 's/{{PROJECT_NAME}}/myproj/g' \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/ci/setup-gh-runner.sh.tmpl" \
    > "$WORK/setup-gh-runner.sh"
  chmod +x "$WORK/setup-gh-runner.sh"
  # PATH keeps /usr/bin:/bin (needed so the "#!/usr/bin/env bash" shebang can
  # still resolve bash itself) but omits every dir gh could live in (e.g.
  # Homebrew's /opt/homebrew/bin), so the script's own `command -v gh` check
  # is what fails — not the shebang lookup.
  run env PATH="/usr/bin:/bin" "$WORK/setup-gh-runner.sh" --print-only
  [ "$status" -eq 2 ]
  [[ "$output" == *"gh CLI required"* ]]
  rm -rf "$WORK"
}

poller_world() { # builds origin+clone, installs resolved poller with gate cmd $1
  WORK="$(mktemp -d)"
  git init -q --bare -b main "$WORK/origin.git"
  git clone -q "$WORK/origin.git" "$WORK/clone"
  git -C "$WORK/clone" config user.name t
  git -C "$WORK/clone" config user.email t@t.invalid
  echo base > "$WORK/clone/f.txt"
  git -C "$WORK/clone" add f.txt
  git -C "$WORK/clone" commit -qm base
  git -C "$WORK/clone" push -qu origin main
  git -C "$WORK/clone" remote set-head origin main
  mkdir -p "$WORK/clone/scripts/ops"
  sed -e "s|{{FULL_GATE_COMMAND}}|$1|g" \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl" \
    > "$WORK/clone/scripts/ops/post-merge-poller.sh"
  chmod +x "$WORK/clone/scripts/ops/post-merge-poller.sh"
}

@test "poller: green run records the sha and stays quiet when nothing moved" {
  poller_world "true"
  run git -C "$WORK/clone" rev-parse origin/main
  SHA="$output"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [ "$(cat "$WORK/clone/.mq/last-full-suite-sha")" = "$SHA" ]
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"up to date"* ]]
  rm -rf "$WORK"
}

@test "poller: red run pauses the queue; green clears only a poller pause" {
  poller_world "false"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 1 ]
  grep -q 'post-merge red' "$WORK/clone/.mq/PAUSED"
  # re-resolve the poller with a green gate and advance origin so it re-runs
  sed -e "s|{{FULL_GATE_COMMAND}}|true|g" \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl" \
    > "$WORK/clone/scripts/ops/post-merge-poller.sh"
  chmod +x "$WORK/clone/scripts/ops/post-merge-poller.sh"
  echo more >> "$WORK/clone/f.txt"
  git -C "$WORK/clone" commit -qam more
  git -C "$WORK/clone" push -q origin main
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [ ! -f "$WORK/clone/.mq/PAUSED" ]
  rm -rf "$WORK"
}

@test "poller: records the sha on RED so it does not re-run the full gate without movement" {
  poller_world "false"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 1 ]
  SHA="$(git -C "$WORK/clone" rev-parse origin/main)"
  [ "$(cat "$WORK/clone/.mq/last-full-suite-sha")" = "$SHA" ]
  # same sha -> "up to date", the (expensive) gate is NOT re-run every poll
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"up to date"* ]]
  rm -rf "$WORK"
}

@test "poller: skips (exit 0) when another poller holds the lock" {
  poller_world "true"
  mkdir -p "$WORK/clone/.mq/poller.lock"   # simulate a live concurrent poller
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"another poller is running"* ]]
  [ ! -f "$WORK/clone/.mq/last-full-suite-sha" ]   # gate never ran
  rm -rf "$WORK"
}

@test "poller: never clears a non-poller (NRS) pause on green" {
  poller_world "true"
  mkdir -p "$WORK/clone/.mq"
  echo "NRS violation: trees differ" > "$WORK/clone/.mq/PAUSED"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ -f "$WORK/clone/.mq/PAUSED" ]
  grep -q 'NRS violation' "$WORK/clone/.mq/PAUSED"
  rm -rf "$WORK"
}

@test "poller: a RED gate never clobbers an existing non-poller pause" {
  poller_world "false"
  mkdir -p "$WORK/clone/.mq"
  echo "NRS violation: trees differ" > "$WORK/clone/.mq/PAUSED"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  grep -q 'NRS violation' "$WORK/clone/.mq/PAUSED"   # untouched — queue halted for a worse reason
  rm -rf "$WORK"
}
