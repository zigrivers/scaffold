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

@test "review-pr.md resets round one in a fresh bounded remediation cycle" {
  F="$ROOT/content/tools/review-pr.md"
  grep -q 'CYCLE="${CYCLE:-1}"' "$F"
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
  grep -q 'CYCLE="${CYCLE:-1}"' "$F"
  grep -Eq -- '--session.*cycle.*--round.*--max-rounds 3' "$F"
  [[ "$NORMALIZED" == *"Duplicate, stale, hypothetical, speculative, cosmetic, or already-dispositioned"* ]]
  [[ "$NORMALIZED" == *"new exact head"* ]]
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
}

@test "review policy preserves user stop and records evidence-backed refutations" {
  F="$ROOT/docs/review-standards.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"the user asks to stop"* ]]
  [[ "$NORMALIZED" == *"mmr ack add"* ]]
  [[ "$NORMALIZED" == *"mmr results"* ]]
  [[ "$NORMALIZED" == *"Never acknowledge a verified"* ]]
}

@test "inconclusive findings receive a finite non-restart disposition" {
  F="$ROOT/content/knowledge/core/multi-model-review-dispatch.md"
  NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
  [[ "$NORMALIZED" == *"inconclusive"* ]]
  [[ "$NORMALIZED" == *"cannot restart a cycle"* ]]
  [[ "$NORMALIZED" == *"required safeguard"* ]]
}
