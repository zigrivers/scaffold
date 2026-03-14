---
name: critical-path-walkthrough
description: Walk critical user journeys end-to-end across all specs
phase: "validation"
dependencies: [phase-10a-review-security]
outputs: [docs/validation/critical-path-walkthrough.md]
conditional: null
knowledge-base: [critical-path-analysis]
---

## Purpose
Walk critical user journeys end-to-end across all specs. Trace the most
important user flows from PRD through UX, API contracts, architecture
components, database operations, and implementation tasks to verify
completeness and consistency at every layer.

## Inputs
- All phase output artifacts (docs/prd.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/critical-path-walkthrough.md — findings report

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
