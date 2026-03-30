---
name: dependency-graph-validation
description: Verify task dependency graphs are acyclic, complete, correctly ordered
summary: "Verifies the task dependency graph has no cycles (which would deadlock agents), no orphaned tasks, and no chains deeper than three sequential dependencies."
phase: "validation"
order: 1360
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/dependency-graph-validation.md, docs/validation/dependency-graph-validation/review-summary.md, docs/validation/dependency-graph-validation/codex-review.json, docs/validation/dependency-graph-validation/gemini-review.json]
conditional: null
knowledge-base: [dependency-validation, multi-model-review-dispatch]
---

## Purpose
Verify task dependency graphs are acyclic, complete, correctly ordered.
Validate that the implementation task dependency graph forms a valid DAG,
that all dependencies are satisfied before dependent tasks, and that no
critical tasks are missing from the graph.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent graph validation — different models catch different ordering
and completeness issues.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/dependency-graph-validation.md — findings report
- docs/validation/dependency-graph-validation/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/dependency-graph-validation/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/dependency-graph-validation/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Task dependency graph verified as acyclic (no circular dependencies)
- (mvp) Every task with dependencies has all dependencies present in the graph
- (deep) Critical path identified and total estimated duration documented
- (deep) No task is blocked by more than 3 sequential dependencies (flag deep chains)
- (deep) Wave assignments are consistent with dependency ordering
- (mvp) Findings categorized P0-P3 with specific file, section, and issue for each
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Finding Disposition
- **P0 (blocking)**: Must be resolved before proceeding to implementation. Create
  fix tasks and re-run affected upstream steps.
- **P1 (critical)**: Should be resolved; proceeding requires explicit risk acceptance
  documented in an ADR. Flag to project lead.
- **P2 (medium)**: Document in implementation plan as tech debt. May defer to
  post-launch with tracking issue.
- **P3 (minor)**: Log for future improvement. No action required before implementation.

Findings are reported in the validation output file with severity, affected artifact,
and recommended resolution. P0/P1 findings block the implementation-plan step from
proceeding without acknowledgment.

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks. Multi-model validation
  dispatched to Codex and Gemini if available, with graceful fallback to
  Claude-only enhanced validation.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**:
  - Depth 1: cycle detection and basic ordering check.
  - Depth 2: add transitive dependency completeness.
  - Depth 3: full DAG validation with critical path identification and parallelization opportunities.
  - Depth 4: add external model review.
  - Depth 5: multi-model validation with optimization recommendations.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/dependency-graph-validation/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/dependency-graph-validation/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding
