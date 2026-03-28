---
name: dependency-graph-validation
description: Verify task dependency graphs are acyclic, complete, correctly ordered
phase: "validation"
order: 1360
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/dependency-graph-validation.md, docs/validation/dependency-graph-validation/review-summary.md, docs/validation/dependency-graph-validation/codex-review.json, docs/validation/dependency-graph-validation/gemini-review.json]
conditional: null
knowledge-base: [dependency-validation]
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
- Analysis is comprehensive (not superficial)
- Findings are actionable (specific file, section, and issue)
- Severity categorization (P0-P3)
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

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
- **custom:depth(1-5)**: Depth 1-3: scale thoroughness with depth. Depth 4:
  full analysis + one external model (if CLI available). Depth 5: full
  analysis + multi-model with reconciliation.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/dependency-graph-validation/,
they are regenerated each run.
