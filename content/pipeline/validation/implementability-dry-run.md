---
name: implementability-dry-run
description: Dry-run specs as implementing agent, catching ambiguity
summary: "Simulates picking up each task as an implementing agent and flags anything ambiguous — unclear acceptance criteria, missing input files, undefined error handling — that would force an agent to guess."
phase: "validation"
order: 1350
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/implementability-dry-run.md, docs/validation/implementability-dry-run/review-summary.md, docs/validation/implementability-dry-run/codex-review.json, docs/validation/implementability-dry-run/gemini-review.json]
conditional: null
knowledge-base: [implementability-review, multi-model-review-dispatch]
---

## Purpose
Dry-run specs as implementing agent, catching ambiguity. Simulate what an
AI agent would experience when picking up each implementation task: are the
inputs clear, are the acceptance criteria testable, are there ambiguities
that would force the agent to guess?

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent dry-runs — different models encounter different ambiguities
when simulating implementation.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/implementability-dry-run.md — findings report
- docs/validation/implementability-dry-run/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/implementability-dry-run/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/implementability-dry-run/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every task specifies: input file paths, expected output artifacts, testable acceptance criteria, and references to upstream documents
- (deep) No task references undefined concepts, components, or APIs
- (deep) Every task's dependencies are present in the implementation plan
- (deep) Shared code patterns identified and documented (no duplication risk across tasks)
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
  - Depth 1: verify each task has enough context to start.
  - Depth 2: add tool/dependency availability check.
  - Depth 3: full dry-run simulation of first 3 tasks with quality gate verification.
  - Depth 4: add external model dry-run.
  - Depth 5: multi-model dry-run with implementation plan revision recommendations.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/implementability-dry-run/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/implementability-dry-run/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding
