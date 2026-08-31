#!/usr/bin/env bats

# Guards the MMR-dispatch-core contract for the review meta-prompts after the
# slim (design: docs/superpowers/specs/2026-07-11-review-pr-code-mmr-slim-design.md).
#
# Two things are easily lost when a review prompt is slimmed and must never
# silently regress:
#   1. Native round-bounding — the `mmr review` call must carry --session and
#      --max-rounds (the native replacement for the deleted wrapper-hash
#      3-strike bookkeeping).
#   2. The Superpowers agent channel — the 5th, plan-aware reviewer, reconciled
#      into the same MMR job via `mmr reconcile --channel superpowers`.
#
# The absence of `_review_finding_hash` proves the ~230-line wrapper-hash
# bookkeeping block is gone (its native replacement is --session/--max-rounds).

ROOT="$BATS_TEST_DIRNAME/.."

@test "Scaffold provides the merge queue gate it requires" {
  grep -q '^check-affected: check-all' "$ROOT/Makefile"
}

# --- review-pr.md -----------------------------------------------------------

@test "review-pr.md drops the wrapper-side finding-hash bookkeeping" {
  ! grep -q "_review_finding_hash" "$ROOT/content/tools/review-pr.md"
}

@test "review-pr.md runs mmr review synchronously" {
  grep -q -- "--sync" "$ROOT/content/tools/review-pr.md"
}

@test "review-pr.md uses native session round-bounding on the mmr invocation" {
  # --session, --round, and --max-rounds must sit together on the real flags
  # line (the MMR_FLAGS array), not merely appear somewhere in prose. --round is
  # required for the cap to fire (MMR compares --round to --max-rounds).
  grep -Eq -- '--session.*--round.*--max-rounds' "$ROOT/content/tools/review-pr.md"
  grep -q -- "--max-rounds 3" "$ROOT/content/tools/review-pr.md"
}

@test "generated direct PR review guidance carries native cycle bounds" {
  F="$ROOT/content/pipeline/environment/automated-pr-review.md"
  grep -Eq -- 'mmr review --pr <N>.*--session.*--round.*--max-rounds 3.*--sync' "$F"
}

@test "review-pr.md resets round one in a fresh bounded remediation cycle" {
  F="$ROOT/content/tools/review-pr.md"
  grep -q 'Set CYCLE and ROUND from the verified review history' "$F"
  grep -Eq -- '--session.*cycle.*--round.*--max-rounds 3' "$F"
  grep -q 'reset.*ROUND.*1' "$F"
  grep -q 'same PR' "$F"
}

@test "review-pr.md admits a new cycle only after blocker evidence and repair" {
  F="$ROOT/content/tools/review-pr.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"reproducible defect within the original acceptance criteria or a required safeguard"* ]]
  [[ "$NORMALIZED" == *"concrete repair"* ]]
  [[ "$NORMALIZED" == *"focused regression"* ]]
  [[ "$NORMALIZED" == *"required gate"* ]]
}

@test "review-pr.md keeps the Superpowers reconcile channel" {
  grep -q "mmr reconcile" "$ROOT/content/tools/review-pr.md"
  grep -q "channel superpowers" "$ROOT/content/tools/review-pr.md"
}

# --- review-code.md ---------------------------------------------------------

@test "review-code.md drops the wrapper-side finding-hash bookkeeping" {
  ! grep -q "_review_finding_hash" "$ROOT/content/tools/review-code.md"
}

@test "review-code.md runs mmr review synchronously" {
  grep -q -- "--sync" "$ROOT/content/tools/review-code.md"
}

@test "review-code.md uses native session round-bounding on the mmr invocation" {
  # --session, --round, and --max-rounds must sit together on the real flags
  # line (the MMR_FLAGS array), not merely appear somewhere in prose. --round is
  # required for the cap to fire (MMR compares --round to --max-rounds).
  grep -Eq -- '--session.*--round.*--max-rounds' "$ROOT/content/tools/review-code.md"
  grep -q -- "--max-rounds 3" "$ROOT/content/tools/review-code.md"
}

@test "review-code.md uses the same bounded remediation-cycle contract" {
  F="$ROOT/content/tools/review-code.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  grep -q 'Set CYCLE and ROUND from the verified review history' "$F"
  grep -Eq -- '--session.*cycle.*--round.*--max-rounds 3' "$F"
  [[ "$NORMALIZED" == *"Duplicate, stale, hypothetical, speculative, cosmetic, or already-dispositioned"* ]]
  [[ "$NORMALIZED" == *"new exact head"* ]]
  [[ "$NORMALIZED" == *"On resume"* ]]
  [[ "$NORMALIZED" == *"MMR session history"* ]]
}

@test "review-code.md keeps the Superpowers reconcile channel" {
  grep -q "mmr reconcile" "$ROOT/content/tools/review-code.md"
  grep -q "channel superpowers" "$ROOT/content/tools/review-code.md"
}

@test "review-code.md keeps the full-delivery-candidate scope detection" {
  # The merge-base combined-bundle logic is the genuinely useful part that the
  # slim must preserve (committed + staged + unstaged review).
  grep -q "merge-base" "$ROOT/content/tools/review-code.md"
}

@test "review skills teach the same autonomous bounded-cycle rule" {
  for F in \
    "$ROOT/content/agent-skills/mmr/SKILL.md" \
    "$ROOT/content/skills/mmr/SKILL.md" \
    "$ROOT/content/skills/multi-model-dispatch/SKILL.md"; do
    NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
    [[ "$NORMALIZED" == *"maximum of three rounds per review cycle"* ]]
    [[ "$NORMALIZED" == *"concrete repair"* ]]
    [[ "$NORMALIZED" == *"focused regression"* ]]
    [[ "$NORMALIZED" == *"new exact head"* ]]
    [[ "$NORMALIZED" == *"cannot start a new cycle"* ]]
  done
}

@test "post-implementation review does not restore the retired owner stop" {
  F="$ROOT/content/tools/post-implementation-review.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"maximum of three rounds per review cycle"* ]]
  [[ "$NORMALIZED" == *"concrete repair"* ]]
  [[ "$NORMALIZED" == *"focused regression"* ]]
  [[ "$NORMALIZED" == *"new exact head"* ]]
  [[ "$NORMALIZED" == *"No owner approval is required"* ]]
  ! grep -q "Surface unresolved findings to the user" "$F"
}

@test "core review knowledge treats round-three blocked as a cycle verdict, not an owner stop" {
  F="$ROOT/content/knowledge/core/automated-review-tooling.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"blocked for this cycle"* ]]
  [[ "$NORMALIZED" == *"not a workflow stopping condition by itself"* ]]
  [[ "$NORMALIZED" == *"new cycle reviews the repaired exact head from round one"* ]]
  [[ "$NORMALIZED" == *"proposes an untrusted project configuration or persistent acknowledgment change"* ]]
  [[ "$NORMALIZED" == *'fewer than `min_completed_channels`'* ]] || false
  [[ "$NORMALIZED" == *'Any unresolved findings at or above `fix_threshold`?'* ]] || false
  [[ "$NORMALIZED" != *"when round 3 ends"* ]] || false
  [[ "$NORMALIZED" != *"contradictions that require human judgment"* ]]
}

@test "review policy preserves user stop and records evidence-backed refutations" {
  F="$ROOT/docs/review-standards.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"the user asks to stop"* ]] || false
  [[ "$NORMALIZED" == *"No owner approval is required for in-scope remediation"* ]] || false
  [[ "$NORMALIZED" == *"mmr ack add"* ]] || false
  [[ "$NORMALIZED" == *"--scope job"* ]] || false
  [[ "$NORMALIZED" != *"--scope user"* ]] || false
  [[ "$NORMALIZED" == *"mmr results"* ]] || false
  [[ "$NORMALIZED" == *"Never acknowledge a verified"* ]] || false
}

@test "every shipped MMR skill teaches job-scoped evidence-backed refutations" {
  for F in \
    "$ROOT/content/agent-skills/mmr/SKILL.md" \
    "$ROOT/content/skills/mmr/SKILL.md" \
    "$ROOT/packages/mmr/templates/skills/agents/mmr-review.md" \
    "$ROOT/packages/mmr/templates/skills/cursor/mmr-review.mdc" \
    "$ROOT/packages/mmr/templates/skills/opencode/mmr.md" \
    "$ROOT/content/guides/review-workflow/index.md" \
    "$ROOT/content/guides/review-workflow/index.html"; do
    NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
    [[ "$NORMALIZED" == *"--scope job"* ]] || false
    [[ "$NORMALIZED" != *"--scope user"* ]] || false
    [[ "$NORMALIZED" == *"Never acknowledge a verified"* ]] || false
  done
}

@test "review-pr resumes the recorded cycle instead of silently restarting cycle one" {
  F="$ROOT/content/tools/review-pr.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"On resume"* ]] || false
  [[ "$NORMALIZED" == *"PR disposition ledger"* ]] || false
  [[ "$NORMALIZED" == *"MMR session history"* ]] || false
  [[ "$NORMALIZED" == *"mmr sessions list"* ]] || false
  [[ "$NORMALIZED" == *"mmr sessions show"* ]] || false
  [[ "$NORMALIZED" == *"mmr-cycle-ledger"* ]] || false
  [[ "$NORMALIZED" == *"do not start another review"* ]] || false
}

@test "inconclusive findings receive a finite non-restart disposition" {
  F="$ROOT/content/knowledge/core/multi-model-review-dispatch.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"inconclusive"* ]] || false
  [[ "$NORMALIZED" == *'`block:inconclusive`'* ]] || false
  [[ "$NORMALIZED" != *'`reject:unverifiable`'* ]] || false
  [[ "$NORMALIZED" == *"must not be acknowledged"* ]] || false
  [[ "$NORMALIZED" == *"cannot restart a cycle"* ]] || false
  [[ "$NORMALIZED" == *"required safeguard"* ]] || false
}

@test "local review resume uses the same concrete MMR session lookup" {
  F="$ROOT/content/tools/review-code.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"mmr sessions list"* ]] || false
  [[ "$NORMALIZED" == *"mmr sessions show"* ]] || false
  [[ "$NORMALIZED" == *"do not start another review"* ]] || false
}

@test "local review modes keep independent bounded session budgets" {
  F="$ROOT/content/tools/review-code.md"
  grep -q 'REVIEW_SCOPE="staged"' "$F"
  grep -q 'REVIEW_SCOPE="range"' "$F"
  grep -q 'REVIEW_SCOPE="full"' "$F"
  grep -q 'SESSION_ID="local-$SCOPE_ID-' "$F"
  grep -q 'BRANCH_HASH=.*git hash-object --stdin' "$F"
  grep -q '\$BRANCH_ID' "$F"
}

@test "shipped MMR quick references require job-scoped evidence" {
  for F in \
    "$ROOT/content/agent-skills/mmr/SKILL.md" \
    "$ROOT/content/skills/mmr/SKILL.md" \
    "$ROOT/packages/mmr/templates/skills/opencode/mmr.md"; do
    grep -q 'ack add <finding-key> --job <id> --scope job --reason' "$F"
  done
}

@test "lean work-beads variants retain the autonomous restart safeguards" {
  for F in \
    "$ROOT/content/skills/work-beads/agents-block.md" \
    "$ROOT/content/skills/work-beads/cursor.mdc"; do
    NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
    [[ "$NORMALIZED" == *"concrete repair"* ]]
    [[ "$NORMALIZED" == *"focused regression proof"* ]]
    [[ "$NORMALIZED" == *"Duplicate, stale, hypothetical, speculative, cosmetic"* ]]
    [[ "$NORMALIZED" == *"No owner approval is required"* ]]
    [[ "$NORMALIZED" == *"final exact head"* ]]
  done
}

@test "review session ids include repository identity" {
  for F in "$ROOT/content/tools/review-pr.md" "$ROOT/content/tools/review-code.md"; do
    grep -q 'REPO_ID=' "$F"
    grep -q '\$REPO_ID' "$F"
  done
}

@test "review meta-prompts fail closed instead of silently restarting cycle one" {
  for F in "$ROOT/content/tools/review-pr.md" "$ROOT/content/tools/review-code.md"; do
    ! grep -q 'CYCLE="${CYCLE:-1}"' "$F"
    grep -q 'Set CYCLE and ROUND from the verified review history' "$F"
  done
}

@test "review-pr refuses to redispatch an unchanged exact head" {
  F="$ROOT/content/tools/review-pr.md"
  grep -q 'LAST_REVIEWED_HEAD' "$F"
  grep -q 'MATCHING_HEAD_LEDGER' "$F"
  grep -q 'CURRENT_HEAD' "$F"
  grep -q 'already has an MMR ledger entry' "$F"
  grep -q 'needs-user-decision' "$F"
  grep -q 'gh api user' "$F"
  grep -q 'user.login' "$F"
  grep -q -- '--paginate' "$F"
  grep -q 'gh pr comment' "$F"
  grep -q 'final line' "$F"
  grep -q 'review_target' "$F"
  grep -q 'REVIEWED_HEAD' "$F"
  grep -q 'head changed after review' "$F"
}

@test "review-pr accepts SHA-1 and SHA-256 exact heads" {
  grep -Fq '[0-9a-f]{40,64}' "$ROOT/content/tools/review-pr.md"
}

@test "review wrappers distinguish pre-dispatch guard failures from review verdicts" {
  for F in "$ROOT/content/tools/review-pr.md" "$ROOT/content/tools/review-code.md"; do
    grep -q '1 pre-dispatch guard' "$F"
  done
}

@test "local review resume branches before incrementing a completed cycle" {
  grep -q 'If the recorded round is 3, do not increment it' \
    "$ROOT/content/tools/review-code.md"
}

@test "range reviews isolate session history by base ref" {
  F="$ROOT/content/tools/review-code.md"
  grep -q 'BASE_ID=' "$F"
  grep -q 'local-$SCOPE_ID-$REPO_ID-' "$F"
}

@test "persistent trust changes remain a human authority stop" {
  F="$ROOT/docs/review-standards.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"until a human ratifies"* ]]
}
