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

@test "work-beads bounds review findings before creating follow-up beads" {
  for F in \
    "$ROOT/content/agent-skills/work-beads/SKILL.md" \
    "$ROOT/content/skills/work-beads/SKILL.md" \
    "$ROOT/content/pipeline/environment/automated-pr-review.md" \
    "$ROOT/content/pipeline/environment/git-workflow.md"; do
    if grep -q "files beads for P2/P3" "$F" || \
      grep -q "file a bead per unresolved finding" "$F" || \
      grep -q "degraded-pass" "$F" || \
      grep -q "A verified block ends review immediately" "$F" || \
      grep -q "Review always ends after round 3" "$F"; then
      echo "retired review policy found in $F"
      return 1
    fi
  done

  F="$ROOT/content/agent-skills/work-beads/SKILL.md"
  grep -q "severity label never creates a bead" "$F"
  grep -q "reproducible, actionable, non-duplicate, worth scheduling" "$F"
  grep -q "exactly one finite disposition" "$F"
  ! grep -q "not the working agent acting alone" "$F"
  grep -q "acting agent may" "$F"
}

@test "agent templates inherit the finite review disposition policy" {
  for F in \
    "$ROOT/content/pipeline/environment/automated-pr-review.md" \
    "$ROOT/content/pipeline/environment/git-workflow.md"; do
    grep -q "Severity alone never creates" "$F"
    grep -Eq "acceptance-criteria|acceptance criteria" "$F"
  done
}

@test "round-three blocker starts a new bounded cycle after a concrete repair" {
  for F in \
    "$ROOT/docs/review-standards.md" \
    "$ROOT/content/agent-skills/work-beads/SKILL.md" \
    "$ROOT/content/skills/work-beads/SKILL.md" \
    "$ROOT/content/pipeline/environment/automated-pr-review.md" \
    "$ROOT/content/pipeline/environment/git-workflow.md"; do
    NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
    for REQUIRED in \
      "every root cause has a disposition and no verified fix-now or block item remains" \
      "security, privacy, and data integrity" \
      "maximum of three rounds per review cycle" \
      "concrete repair" \
      "focused regression" \
      "new exact head"; do
      if [[ "$NORMALIZED" != *"$REQUIRED"* ]]; then
        echo "missing '$REQUIRED' in $F"
        return 1
      fi
    done
  done
}

@test "duplicate and speculative findings cannot restart review" {
  for F in \
    "$ROOT/docs/review-standards.md" \
    "$ROOT/content/tools/review-pr.md" \
    "$ROOT/content/agent-skills/work-beads/SKILL.md" \
    "$ROOT/content/skills/work-beads/SKILL.md"; do
    NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
    [[ "$NORMALIZED" == *"Duplicate, stale, hypothetical, speculative, cosmetic, or already-dispositioned"* ]]
    [[ "$NORMALIZED" == *"cannot start a new cycle"* ]]
  done
}

@test "clean final exact head keeps every merge safeguard" {
  for F in \
    "$ROOT/docs/review-standards.md" \
    "$ROOT/content/agent-skills/work-beads/SKILL.md" \
    "$ROOT/content/skills/work-beads/SKILL.md"; do
    NORMALIZED="$(tr '\n' ' ' < "$F" | sed -E 's/[[:space:]]+/ /g')"
    for REQUIRED in \
      "final exact head" \
      "configured MMR channel floor" \
      "required gates are green" \
      "every finding is dispositioned" \
      "no verified blocker remains"; do
      [[ "$NORMALIZED" == *"$REQUIRED"* ]]
    done
  done
}

@test "review-origin work cannot recursively create follow-up beads" {
  for F in \
    "$ROOT/content/agent-skills/work-beads/SKILL.md" \
    "$ROOT/content/skills/work-beads/SKILL.md"; do
    grep -q 'Review-origin work must not create recursive follow-up beads' "$F"
  done
}

@test "living content drops the retired recursive review path" {
  for RETIRED in \
    "degraded-pass self-merge" \
    "degraded-pass past the cap" \
    "files beads for P2/P3" \
    "file a bead per unresolved finding" \
    "round 2+ fixes only P0/P1" \
    "verified-P0 stop"; do
    if grep -rqiF "$RETIRED" "$ROOT/content"; then
      echo "retired review policy found: $RETIRED"
      return 1
    fi
  done
}

@test "git workflow distinguishes bounded cycles from genuine stop conditions" {
  F="$ROOT/content/pipeline/environment/git-workflow.md"
  grep -q "three rounds per review cycle" "$F"
  grep -q "demonstrated technical plateau" "$F"
  grep -q "required-safeguard defect is not a plateau" "$F"
  grep -q "No owner approval is required" "$F"
}

@test "work-beads stop guidance is self-contained and honors the user" {
  F="$ROOT/content/agent-skills/work-beads/SKILL.md"
  ! grep -q "external conditions in Step 2.7" "$F"
  grep -q "the user asks to stop" "$F"
  grep -q "true external dependency" "$F"
  grep -q "required-safeguard defect is not a plateau" "$F"
}

@test "Scaffold PR template records review evidence without requiring a Bead" {
  F="$ROOT/.github/pull_request_template.md"
  ! grep -q '^## Beads Task' "$F"
  grep -q 'No Scaffold Bead' "$F"
  grep -q 'exact head' "$F"
  grep -q 'Disposition ledger' "$F"
  grep -q 'make check-all' "$F"
  ! grep -q 'Verified blockers remaining: none' "$F"
  grep -q 'Verified blockers remaining: <!--' "$F"
}

# NOTE: work-beads skill drift (canonical content/agent-skills → generated
# content/skills) is gated by the `agent-skills-check` make target, which builds
# the renderer (packages/agent-integration) BEFORE running the drift check.
# A bats copy here would run during `make test` — before that renderer is built —
# and crash on the missing import, so it is intentionally omitted.

# --- Task 11: mirrors ---
@test "claude-md-optimization ship-loop condensation enqueues" {
  grep -q 'mq-enqueue\|mq enqueue' "$ROOT/content/pipeline/consolidation/claude-md-optimization.md"
}

@test "knowledge mirrors describe the queue and keep merge-slot as fallback" {
  grep -q 'merge queue' "$ROOT/content/knowledge/execution/multi-agent-coordination.md"
  grep -q 'fallback' "$ROOT/content/knowledge/execution/multi-agent-coordination.md"
  ! grep -q 'CI is deliberately deferred' "$ROOT/content/knowledge/core/git-workflow-patterns.md"
}

# --- Brownfield R2: ops last mile (D6/D7/D8/D9 content) ---
@test "merge-throughput schedules the local poller via scaffold sched (no cron prose)" {
  F="$ROOT/content/pipeline/environment/merge-throughput.md"
  grep -q 'scaffold sched install post-merge-poller' "$F"
  grep -q 'scaffold sched status post-merge-poller' "$F"
  grep -q 'scaffold hooks install' "$F"
  grep -q 'mq bootstrap' "$F"
  ! grep -q 'cron/launchd' "$F"
}

@test "merge-throughput and tdd seed the gate component with a confirmed classification" {
  F="$ROOT/content/pipeline/environment/merge-throughput.md"
  T="$ROOT/content/pipeline/foundation/tdd.md"
  grep -q 'agent-ops install --component gate' "$F"
  grep -q 'CONFIRM' "$F"
  grep -q 'agent-ops install --component gate' "$T"
  grep -q 'check-visual' "$T"
}

@test "git-workflow registers hooks via scaffold hooks install (no jq registration snippets)" {
  F="$ROOT/content/pipeline/environment/git-workflow.md"
  grep -q 'scaffold hooks install' "$F"
  ! grep -q "jq '.hooks.PreToolUse" "$F"
  ! grep -q 'cron/launchd' "$F"
}
