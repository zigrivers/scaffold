---
name: traceability-matrix
description: Build traceability from PRD requirements through architecture to implementation tasks
phase: "validation"
dependencies: [phase-10a-review-security]
outputs: [docs/validation/traceability-matrix.md]
conditional: null
knowledge-base: [traceability]
---

## Purpose
Build traceability from PRD requirements through architecture to implementation
tasks. Verify that every requirement has a path from PRD to domain model to
architecture component to implementation task, with no orphans in either direction.

## Inputs
- All phase output artifacts (docs/prd.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/traceability-matrix.md — findings report

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
