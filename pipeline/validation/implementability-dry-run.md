---
name: implementability-dry-run
description: Dry-run specs as implementing agent, catching ambiguity
phase: "validation"
order: 31
dependencies: [implementation-plan-review, review-security]
outputs: [docs/validation/implementability-dry-run.md]
conditional: null
knowledge-base: [implementability-review]
---

## Purpose
Dry-run specs as implementing agent, catching ambiguity. Simulate what an
AI agent would experience when picking up each implementation task: are the
inputs clear, are the acceptance criteria testable, are there ambiguities
that would force the agent to guess?

## Inputs
- All phase output artifacts (docs/prd.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/implementability-dry-run.md — findings report

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
