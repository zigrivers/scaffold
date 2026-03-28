---
name: apply-fixes-and-freeze
description: Apply validation findings and freeze documentation
phase: "finalization"
order: 1410
dependencies: [cross-phase-consistency, traceability-matrix, decision-completeness, critical-path-walkthrough, implementability-dry-run, dependency-graph-validation, scope-creep-check]
outputs: [docs/validation/fix-log.md]
conditional: null
knowledge-base: [apply-fixes-and-freeze]
---

## Purpose
Review all validation phase findings, create a prioritized fix plan, apply fixes
to the relevant documents, and mark the documentation as frozen (ready for
implementation). After this step, documents should not change unless a specific
issue is discovered during implementation.

## Inputs
- docs/validation/*.md (required) — all validation findings
- All phase output artifacts (to apply fixes to)

## Expected Outputs
- docs/validation/fix-log.md — log of all fixes applied
- Updated phase artifacts with fixes applied
- Freeze marker added to each document (tracking comment)

## Quality Criteria
- All P0 and P1 validation findings addressed
- P2 findings addressed or explicitly deferred with rationale
- Fix log documents what changed and why
- All documents pass a final consistency check after fixes

## Methodology Scaling
- **deep**: All findings addressed. Full fix log. Final consistency check.
- **mvp**: P0 findings only. Brief fix log.
- **custom:depth(1-5)**: Scale with depth.

## Mode Detection
Check if `docs/validation/fix-log.md` already exists.
- If exists: UPDATE MODE — read existing fix log, identify newly introduced validation findings, apply incremental fixes, preserve previously applied fixes and their verification status.
- If not: FRESH MODE — apply all validation findings from scratch.
