---
name: cross-phase-consistency
description: Audit naming, assumptions, data flows, interface contracts across all phases
phase: "validation"
order: 1310
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/cross-phase-consistency.md, docs/validation/cross-phase-consistency/review-summary.md, docs/validation/cross-phase-consistency/codex-review.json, docs/validation/cross-phase-consistency/gemini-review.json]
conditional: null
knowledge-base: [cross-phase-consistency]
---

## Purpose
Audit naming, assumptions, data flows, interface contracts across all phases.
Ensure consistent terminology, compatible assumptions, and aligned interfaces
between every pair of phase artifacts.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent consistency validation — different models catch different
drift patterns.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/cross-phase-consistency.md — findings report
- docs/validation/cross-phase-consistency/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/cross-phase-consistency/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/cross-phase-consistency/gemini-review.json (depth 4+, if available) — raw Gemini findings

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
multi-model artifacts exist under docs/validation/cross-phase-consistency/,
they are regenerated each run.
