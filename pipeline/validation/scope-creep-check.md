---
name: scope-creep-check
description: Verify specs stay aligned to PRD boundaries
phase: "validation"
dependencies: [phase-10a-review-security]
outputs: [docs/validation/scope-creep-check.md]
conditional: null
knowledge-base: [scope-management]
---

## Purpose
Verify specs stay aligned to PRD boundaries. Check that architecture,
implementation tasks, and other artifacts have not introduced features,
components, or complexity beyond what the PRD requires, and flag any
scope expansion for explicit approval.

## Inputs
- All phase output artifacts (docs/prd.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/scope-creep-check.md — findings report

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
