---
name: phase-01a-review-domain-modeling
description: Review domain models for completeness, consistency, and downstream readiness
phase: "1a"
dependencies: [phase-01-domain-modeling]
outputs: [docs/reviews/phase-01a-review.md]
conditional: null
knowledge-base: [review-methodology, review-domain-modeling]
---

## Purpose
Deep multi-pass review of the domain models, targeting the specific failure modes
of domain modeling artifacts. Identify issues, create a fix plan, execute fixes,
and re-validate.

## Inputs
- docs/domain-models/ (required) — domain models to review
- docs/prd.md (required) — source requirements for coverage checking

## Expected Outputs
- docs/reviews/phase-01a-review.md — review findings, fix plan, and resolution log
- docs/domain-models/ — updated with fixes

## Quality Criteria
- All review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Downstream readiness confirmed (Phase 2 can proceed)

## Methodology Scaling
- **deep**: All review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated.
- **mvp**: Quick consistency check. Focus on blocking issues only.
- **custom:depth(1-5)**: Depth 1-2: blocking issues only. Depth 3: add coverage
  and consistency passes. Depth 4-5: full multi-pass review.

## Mode Detection
If docs/reviews/phase-01a-review.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated models.
