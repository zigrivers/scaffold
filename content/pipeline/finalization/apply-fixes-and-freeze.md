---
name: apply-fixes-and-freeze
description: Apply validation findings and freeze documentation
summary: "Applies all findings from the validation phase, fixes blocking issues, and freezes every document with a version marker — signaling that specs are implementation-ready."
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
- (mvp) All P0 and P1 validation findings resolved: fixed in source document or explicitly deferred with documented rationale
- (deep) P2 findings fixed in source document or explicitly deferred with documented rationale
- (mvp) Fix log documents what changed and why
- (deep) Cross-phase-consistency validation re-run after fixes yields no new P0 or P1 findings
- (mvp) Every frozen document contains a tracking comment matching `<!-- scaffold:step-name vN YYYY-MM-DD -->`

## Methodology Scaling
- **deep**: All findings addressed. Full fix log. Final consistency check.
- **mvp**: P0 findings only. Brief fix log.
- **custom:depth(1-5)**:
  - Depth 1: address P0 findings only with minimal fix log.
  - Depth 2: address P0 findings with brief fix log and freeze markers on updated documents.
  - Depth 3: address P0-P1 findings with detailed fix log and deferred rationale.
  - Depth 4: address P0-P2 with full deferred rationale and re-validation passes.
  - Depth 5: all findings addressed, final consistency re-check, and freeze verification audit.

## Mode Detection
Check if `docs/validation/fix-log.md` already exists.
- If exists: UPDATE MODE — read existing fix log, identify newly introduced validation findings, apply incremental fixes, preserve previously applied fixes and their verification status.
- If not: FRESH MODE — apply all validation findings from scratch.

## Update Mode Specifics

- **Detect**: `docs/validation/fix-log.md` exists with tracking comment
- **Preserve**: Previous fix decisions, deferred rationale, freeze markers on already-frozen documents
- **Triggers**: New validation findings since last freeze, documents modified after freeze
- **Conflict resolution**: Re-frozen documents with new changes require updated freeze markers and fix-log entries
