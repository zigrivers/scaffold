---
name: review-prd
description: Multi-pass review of the PRD for completeness, clarity, and downstream readiness
phase: "pre"
order: 2
dependencies: [create-prd]
outputs: [docs/reviews/pre-review-prd.md]
conditional: null
knowledge-base: [review-methodology, review-prd, prd-craft, gap-analysis]
---

## Purpose
Deep multi-pass review of the PRD, targeting the specific failure modes of
product requirements artifacts. Identify issues, create a fix plan, execute
fixes, and re-validate. Ensures the PRD is complete, clear, consistent, and
ready for User Stories to consume.

## Inputs
- docs/prd.md (required) — PRD to review
- Project idea or brief (context from user, if available)

## Expected Outputs
- docs/reviews/pre-review-prd.md — review findings, fix plan, and resolution log
- docs/prd.md — updated with fixes

## Quality Criteria
- All review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Downstream readiness confirmed (User Stories can proceed)

## Methodology Scaling
- **deep**: All 8 review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated.
- **mvp**: Passes 1-2 only (Problem Statement Rigor, Persona Coverage). Focus
  on blocking gaps — requirements too vague to write stories from.
- **custom:depth(1-5)**: Depth 1-2: passes 1-2 only (Problem Statement Rigor,
  Persona Coverage). Depth 3: passes 1-4 (add Feature Scoping, Success
  Criteria). Depth 4-5: all 8 passes.

## Mode Detection
If docs/reviews/pre-review-prd.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated PRD.
