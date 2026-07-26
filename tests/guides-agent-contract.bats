#!/usr/bin/env bats
#
# Keeps the agent-facing docs honest about behavior that actually shipped.
# The install guide is the channel the README points agents at, so a stale
# claim there is worse than a missing one: the agent stops looking.

INSTALL_GUIDE="content/guides/install/index.md"
RUNNER_SKILL="content/skills/scaffold-runner/SKILL.md"

@test "install guide no longer presents --dry-run as the adopt preview" {
  ! grep -q 'Preview the changes first with `--dry-run`' "$INSTALL_GUIDE"
}

@test "install guide documents the plan-then-apply contract" {
  grep -q -- '--apply' "$INSTALL_GUIDE"
  grep -q -- '--plan-key' "$INSTALL_GUIDE"
}

@test "install guide does not tell users to run init before adopt" {
  ! grep -q 'scaffold init, then' "$INSTALL_GUIDE"
  ! grep -q 'The usual sequence for an existing codebase: `scaffold init`' "$INSTALL_GUIDE"
}

@test "install guide states that adopt initializes by itself" {
  grep -qi 'initializes' "$INSTALL_GUIDE"
}

@test "runner skill covers the pre-init bootstrap choice" {
  grep -q 'scaffold adopt' "$RUNNER_SKILL"
  grep -qi 'has none yet\|does not exist\|before .scaffold' "$RUNNER_SKILL"
}
