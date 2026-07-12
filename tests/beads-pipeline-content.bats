#!/usr/bin/env bats
# Content guards for the Beads foundation step: durability features the
# 2026-07-12 hardening added must not regress.

F="$BATS_TEST_DIRNAME/../content/pipeline/foundation/beads.md"

@test "setup uses idempotent init and configures a full backup" {
  run grep -qE -- "--init-if-missing" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd backup init" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd backup sync" "$F"; [ "$status" -eq 0 ]
}

@test "generated workflow doc specifies the durability runbook" {
  run grep -qE "Durability & the bootstrap trap" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd dolt commit" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd dolt push" "$F"; [ "$status" -eq 0 ]
  run grep -qE "reinit-local" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd-guard" "$F"; [ "$status" -eq 0 ]
}

@test "generated workflow doc specifies the upgrade/migration recipe" {
  run grep -qE "Upgrades & migration" "$F"; [ "$status" -eq 0 ]
  run grep -qE "BD_ALLOW_REMOTE_MIGRATE" "$F"; [ "$status" -eq 0 ]
}

@test "stale version framing is gone" {
  run grep -qE "1\.0\.4-Unreleased" "$F"; [ "$status" -ne 0 ]
}

@test "git-workflow registers bd-guard as a PreToolUse hook (merge, never overwrite)" {
  G="$BATS_TEST_DIRNAME/../content/pipeline/environment/git-workflow.md"
  run grep -qE "bd-guard\.sh" "$G"; [ "$status" -eq 0 ]
  run grep -qE "PreToolUse" "$G"; [ "$status" -eq 0 ]
}
