---
name: cross-phase-consistency
description: Audit naming, assumptions, data flows, interface contracts across all phases
phase: "validation"
order: 1310
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/cross-phase-consistency.md]
conditional: null
knowledge-base: [cross-phase-consistency]
---

## Purpose
Audit naming, assumptions, data flows, interface contracts across all phases.
Ensure consistent terminology, compatible assumptions, and aligned interfaces
between every pair of phase artifacts.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/cross-phase-consistency.md — findings report

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
