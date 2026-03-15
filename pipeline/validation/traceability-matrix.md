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
Build traceability from PRD requirements through user stories and architecture
to implementation tasks. Verify the full chain: PRD → User Stories → Domain
Model → Architecture → Tasks, with no orphans in either direction. Every PRD
requirement must trace to at least one story, every story to at least one task.

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
