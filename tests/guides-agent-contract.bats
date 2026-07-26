#!/usr/bin/env bats
#
# Keeps the agent-facing docs honest about behavior that actually shipped.
# The install guide is the channel the README points agents at, so a stale
# claim there is worse than a missing one: the agent stops looking.

INSTALL_GUIDE="content/guides/install/index.md"
# The CANONICAL skill source. content/skills/<name>/ is codegen output, so
# asserting only there would pass on a hand-edit that the next generator run
# silently reverts — which is exactly how this rule was lost once already.
RUNNER_SKILL_SRC="content/agent-skills/scaffold-runner/SKILL.md"
RUNNER_SKILL_GEN="content/skills/scaffold-runner/SKILL.md"

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

@test "install guide states that adopt writes config and state itself" {
  # Specific enough to fail if the claim is removed: a bare grep for
  # "initializes" passes on unrelated wording elsewhere in the guide.
  grep -q 'adopt` initializes for you' "$INSTALL_GUIDE"
  grep -q 'Do not run `scaffold init`' "$INSTALL_GUIDE"
}

@test "canonical runner skill covers the pre-init bootstrap choice" {
  grep -q 'scaffold adopt' "$RUNNER_SKILL_SRC"
  grep -q 'has none yet' "$RUNNER_SKILL_SRC"
  grep -q 'Never run `scaffold init` before `scaffold adopt`' "$RUNNER_SKILL_SRC"
}

@test "generated runner skill carries the FULL bootstrap rule through codegen" {
  # Guards the fan-out: canonical can be right while the generated consumer
  # files are stale. Assert the whole rule, not one phrase — a partial check
  # would pass on a half-regenerated file.
  grep -q 'has none yet' "$RUNNER_SKILL_GEN"
  grep -q 'scaffold adopt' "$RUNNER_SKILL_GEN"
  grep -q 'Never run `scaffold init` before `scaffold adopt`' "$RUNNER_SKILL_GEN"
  grep -q -- '--plan-key' "$RUNNER_SKILL_GEN"
  grep -q 'brownfield' "$RUNNER_SKILL_GEN"
}

@test "install guide pins the correct end-to-end brownfield sequence" {
  # A positive example, so the intended story is anchored rather than only
  # the absence of the old wrong one.
  grep -q 'scaffold adopt --apply --plan-key' "$INSTALL_GUIDE"
  grep -q 'scaffold adopt --format json' "$INSTALL_GUIDE"
}
