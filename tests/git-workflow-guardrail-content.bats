#!/usr/bin/env bats
# Content guards for the /scaffold:git-workflow step's primary-checkout
# write-guard subsection (ported from nibble). These assert the meta-prompt
# teaches the run to ship + wire the guard and self-heal; the behavior of the
# emitted scripts is covered by tests/agent-ops-git-scripts.bats.

G="$BATS_TEST_DIRNAME/../content/pipeline/environment/git-workflow.md"

@test "git-workflow documents the primary-checkout guardrail subsection" {
  run grep -qE "Guardrail: keep generated files out of the primary checkout" "$G"
  [ "$status" -eq 0 ]
}

@test "git-workflow names the guard + detector scripts the git component installs" {
  run grep -qE "primary-checkout-guard\.sh" "$G"; [ "$status" -eq 0 ]
  run grep -qE "check-regen-artifacts\.sh" "$G"; [ "$status" -eq 0 ]
}

@test "git-workflow states the generator-must-call-the-guard rule (both idioms)" {
  # bash generators source and call the function
  run grep -qE "guard_primary_checkout" "$G"; [ "$status" -eq 0 ]
  # non-bash generators shell out to the guard before writing
  run grep -qiE "immediately before writing|before it writes|before writing" "$G"
  [ "$status" -eq 0 ]
}

@test "git-workflow documents the single bypass env var" {
  run grep -qE "AGENT_OPS_GIT_GUARD_BYPASS" "$G"; [ "$status" -eq 0 ]
}

@test "git-workflow's generated docs/git-workflow.md carries the one-line write-guard rule" {
  # the emitted rule cross-references the primary-checkout invariant
  run grep -qiE "regenerates a tracked file must call the primary-checkout write-guard" "$G"
  [ "$status" -eq 0 ]
}

@test "git-workflow Update Mode preserves the guard + detector scripts" {
  # both helper scripts appear in the Preserve list so re-running never clobbers them
  run grep -qE "primary-checkout-guard\.sh.*check-regen-artifacts\.sh|check-regen-artifacts\.sh.*primary-checkout-guard\.sh" "$G"
  [ "$status" -eq 0 ]
}
