#!/usr/bin/env bats

STARTS=( content/pipeline/build/single-agent-start.md content/pipeline/build/multi-agent-start.md )
RESUMES=( content/pipeline/build/single-agent-resume.md content/pipeline/build/multi-agent-resume.md )
ALL=( "${STARTS[@]}" "${RESUMES[@]}" )
MULTI=( content/pipeline/build/multi-agent-start.md content/pipeline/build/multi-agent-resume.md )

@test "all build prompts invoke the canonical materializer (not a copied 4-pass)" {
  for f in "${ALL[@]}"; do
    run grep -qE "/scaffold:materialize-plan-to-beads" "$f"
    [ "$status" -eq 0 ] || { echo "missing materialize invocation in $f"; false; }
  done
}

@test "all build prompts use the scoped claim loop" {
  for f in "${ALL[@]}"; do
    run grep -qE -e "bd ready --claim --has-metadata-key plan_task_id" "$f"
    [ "$status" -eq 0 ] || { echo "missing scoped claim in $f"; false; }
  done
}

@test "all build prompts gate on beads_usable and define the completion check" {
  for f in "${ALL[@]}"; do
    run grep -qE "beads_usable" "$f"; [ "$status" -eq 0 ] || { echo "no beads_usable in $f"; false; }
    run grep -qiE "completion check|empty .*bd ready|all .*closed" "$f"; [ "$status" -eq 0 ] || { echo "no completion check in $f"; false; }
  done
}

@test "build prompts fail closed when .beads present but unusable (no markdown re-run)" {
  for f in "${ALL[@]}"; do
    run grep -qiE "fail closed|fail-closed" "$f"
    [ "$status" -eq 0 ] || { echo "no fail-closed rule in $f"; false; }
  done
}

@test "multi-agent prompts use orchestrator-only lock + run-stamped completion signal" {
  for f in "${MULTI[@]}"; do
    run grep -qiE "merge-slot" "$f"; [ "$status" -eq 0 ] || { echo "no merge-slot in $f"; false; }
    run grep -qiE "completion signal|run_id|run-stamped|materialized_at" "$f"; [ "$status" -eq 0 ] || { echo "no completion signal in $f"; false; }
  done
}

@test "resume prompts resume the actor's own in-flight plan task first (scoped)" {
  for f in "${RESUMES[@]}"; do
    run grep -qE -e "in_progress --assignee .* --has-metadata-key plan_task_id" "$f"
    [ "$status" -eq 0 ] || { echo "missing scoped own-task resume in $f"; false; }
  done
}
