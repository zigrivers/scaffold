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
