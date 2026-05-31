#!/usr/bin/env bats

PLAN="content/pipeline/planning/implementation-plan.md"
REVIEW="content/pipeline/planning/implementation-plan-review.md"

@test "implementation-plan requires stable task IDs with a defined format" {
  run grep -qiE "stable.*task ID|task ID.*format|T-001" "$PLAN"
  [ "$status" -eq 0 ]
}

@test "implementation-plan defines container (story/epic) IDs and canonical serialization" {
  run grep -qiE "plan_story_id|plan_epic_id|S-001|E-001" "$PLAN"
  [ "$status" -eq 0 ]
  run grep -qiE "canonical serialization|parseable block|fenced" "$PLAN"
  [ "$status" -eq 0 ]
}

@test "implementation-plan requires referential integrity for parent and depends_on refs" {
  run grep -qiE "depends_on" "$PLAN"
  [ "$status" -eq 0 ]
  run grep -qiE "referential integrity|resolve to a declared|no dangling" "$PLAN"
  [ "$status" -eq 0 ]
}

@test "review step validates IDs, dangling refs, and acyclicity" {
  # Anchor on the new validation section so each assertion is load-bearing
  # (generic DAG/cycle prose already existed in this file pre-contract).
  run grep -qiF "## Plan Output Contract Validation" "$REVIEW"
  [ "$status" -eq 0 ]
  run grep -qiE "unique.*stable|stable.*unique" "$REVIEW"
  [ "$status" -eq 0 ]
  run grep -qiE "dangling ref|no dangling refs" "$REVIEW"
  [ "$status" -eq 0 ]
  run grep -qiE "every .depends_on. (edge|reference)" "$REVIEW"
  [ "$status" -eq 0 ]
}
