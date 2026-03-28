---
name: decision-completeness
description: Verify all decisions are recorded, justified, non-contradictory
phase: "validation"
order: 1330
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/decision-completeness.md]
conditional: null
knowledge-base: [decision-completeness]
---

## Purpose
Verify all decisions are recorded, justified, non-contradictory. Ensure every
significant architectural and technology decision has a corresponding ADR,
that no two ADRs contradict each other, and that all decisions have clear
rationale.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent decision audit — different models surface different implicit
decisions.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/decision-completeness.md — findings report
- docs/validation/decision-completeness/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/decision-completeness/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/decision-completeness/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- Analysis is comprehensive (not superficial)
- Findings are actionable (specific file, section, and issue)
- Severity categorization (P0-P3)
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

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
multi-model artifacts exist under docs/validation/decision-completeness/,
they are regenerated each run.
