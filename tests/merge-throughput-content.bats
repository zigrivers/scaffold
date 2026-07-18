#!/usr/bin/env bats
# tests/merge-throughput-content.bats — content contract for the merge-throughput
# generation layer (spec 2026-07-17-merge-throughput-design.md, Plan 3).

ROOT="$BATS_TEST_DIRNAME/.."

# --- Task 4: knowledge entry ---
@test "test-impact-analysis knowledge entry exists with dual-channel body" {
  F="$ROOT/content/knowledge/core/test-impact-analysis.md"
  [ -f "$F" ]
  grep -q '^name: test-impact-analysis$' "$F"
  grep -q '^## Summary$' "$F"
  grep -q '^## Deep Guidance$' "$F"
  grep -q 'check-affected' "$F"
  grep -q 'forceRerunTriggers' "$F"
  grep -q 'testmon' "$F"
  grep -q 'MQ_AFFECTED_BASE' "$F"
}

# --- Task 5: tdd.md ---
@test "tdd step defines the two-gate contract" {
  F="$ROOT/content/pipeline/foundation/tdd.md"
  grep -q 'make check-affected' "$F"
  grep -q 'quarantine' "$F"
  grep -q 'post-merge' "$F"
  grep -q 'test-impact-analysis' "$F"   # knowledge-base wiring
}

# --- Task 6: project-structure.md ---
@test "project-structure step carries the workspace-package default (D6)" {
  F="$ROOT/content/pipeline/foundation/project-structure.md"
  grep -qE '3.5 (workspace )?packages|workspace packages' "$F"
  grep -q 'affected' "$F"
}

# --- Task 7: dev-env-setup.md ---
@test "dev-env-setup requires check-affected in the Makefile contract" {
  F="$ROOT/content/pipeline/environment/dev-env-setup.md"
  grep -q 'check-affected' "$F"
  grep -q 'MQ_AFFECTED_BASE' "$F"
  grep -q '.mq-failed-tests.txt' "$F"
}

# --- Task 8: git-workflow.md (D4' + mq) ---
@test "git-workflow drops the CI-deferred framing for D4-prime" {
  F="$ROOT/content/pipeline/environment/git-workflow.md"
  ! grep -q 'CI deferred' "$F"
  grep -q 'post-merge' "$F"
  grep -q 'self-hosted' "$F"
  grep -q 'local-poller' "$F"
}

@test "git-workflow routes merges through the queue" {
  F="$ROOT/content/pipeline/environment/git-workflow.md"
  grep -q 'mq enqueue' "$F"
  grep -q 'mq-guard' "$F"
  ! grep -q 'bd merge-slot acquire --wait' "$F"
}

# --- Task 9: merge-throughput step ---
@test "merge-throughput step exists with correct frontmatter" {
  F="$ROOT/content/pipeline/environment/merge-throughput.md"
  [ -f "$F" ]
  grep -q '^name: merge-throughput$' "$F"
  grep -q '^phase: "environment"$' "$F"
  grep -q '^order: 335$' "$F"
  grep -q '^conditional: "if-needed"$' "$F"
  grep -q '## Mode Detection' "$F"
  grep -q '## Update Mode Specifics' "$F"
  grep -q 'docs/merge-queue.md' "$F"
  grep -q 'gate_executor' "$F"
  grep -q 'setup-gh-runner' "$F"
}

@test "merge-throughput step is enumerated in every preset" {
  grep -q 'merge-throughput:' "$ROOT/content/methodology/mvp.yml"
  grep -q 'merge-throughput:' "$ROOT/content/methodology/deep.yml"
  grep -q 'merge-throughput:' "$ROOT/content/methodology/custom-defaults.yml"
}

# --- Task 10: work-beads skill ---
@test "work-beads ship loop enqueues instead of merging when mq is installed" {
  F="$ROOT/content/agent-skills/work-beads/SKILL.md"
  grep -q 'make mq-enqueue' "$F"
  grep -q 'merge-slot' "$F"   # the fallback branch must survive
  grep -q 'check-affected' "$F"
}

@test "generated work-beads skills are in sync with the canonical source" {
  run node "$ROOT/scripts/generate-agent-skills.mjs" --check
  [ "$status" -eq 0 ]
}

# --- Task 11: mirrors ---
@test "claude-md-optimization ship-loop condensation enqueues" {
  grep -q 'mq-enqueue\|mq enqueue' "$ROOT/content/pipeline/consolidation/claude-md-optimization.md"
}

@test "knowledge mirrors describe the queue and keep merge-slot as fallback" {
  grep -q 'merge queue' "$ROOT/content/knowledge/execution/multi-agent-coordination.md"
  grep -q 'fallback' "$ROOT/content/knowledge/execution/multi-agent-coordination.md"
  ! grep -q 'CI is deliberately deferred' "$ROOT/content/knowledge/core/git-workflow-patterns.md"
}
