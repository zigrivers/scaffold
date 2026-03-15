---
name: review-user-stories
description: Multi-pass review of user stories for PRD coverage, quality, and downstream readiness
phase: "pre"
order: 5
dependencies: [user-stories]
outputs: [docs/reviews/pre-review-user-stories.md]
conditional: null
knowledge-base: [review-methodology, review-user-stories]
---

## Purpose
Deep multi-pass review of user stories, targeting failure modes specific to
story artifacts. Identify coverage gaps, quality issues, and downstream
readiness problems. Create a fix plan, execute fixes, and re-validate.

## Inputs
- docs/user-stories.md (required) — stories to review
- docs/prd.md (required) — source requirements for coverage checking

## Expected Outputs
- docs/reviews/pre-review-user-stories.md — review findings, fix plan, and resolution log
- docs/user-stories.md — updated with fixes

## Quality Criteria
- All review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Downstream readiness confirmed (modeling phase can proceed)

## Methodology Scaling
- **deep**: All 6 review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated.
- **mvp**: Pass 1 only (PRD coverage). Focus on blocking gaps — PRD features
  with no corresponding story.
- **custom:depth(1-5)**: Depth 1: pass 1 only. Depth 2: passes 1-2.
  Depth 3: passes 1-4. Depth 4-5: all 6 passes.

## Mode Detection
If docs/reviews/pre-review-user-stories.md exists, this is a re-review. Read
previous findings, check which were addressed, run review passes again on
updated stories.
