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

@test "review-code.md keeps the Superpowers reconcile channel" {
  grep -q "mmr reconcile" "$ROOT/content/tools/review-code.md"
  grep -q "channel superpowers" "$ROOT/content/tools/review-code.md"
}

@test "review-code.md keeps the full-delivery-candidate scope detection" {
  # The merge-base combined-bundle logic is the genuinely useful part that the
  # slim must preserve (committed + staged + unstaged review).
  grep -q "merge-base" "$ROOT/content/tools/review-code.md"
}
