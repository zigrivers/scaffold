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

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/decision-completeness.md — findings report

## Quality Criteria
- Analysis is comprehensive (not superficial)
- Findings are actionable (specific file, section, and issue)
- Severity categorization (P0-P3)

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**: Scale thoroughness with depth.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts.
