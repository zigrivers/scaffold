---
name: review-ux
description: Review UX specification for completeness and usability
phase: "specification"
order: 860
dependencies: [ux-spec]
outputs: [docs/reviews/review-ux.md]
conditional: "if-needed"
knowledge-base: [review-methodology, review-ux-spec]
---

## Purpose
Review UX specification targeting UX-specific failure modes: user journey gaps,
accessibility issues, incomplete interaction states, design system inconsistencies,
and missing error states.

## Inputs
- docs/ux-spec.md (required) — spec to review
- docs/plan.md (required) — for journey coverage
- docs/api-contracts.md (optional) — for data shape alignment

## Expected Outputs
- docs/reviews/review-ux.md — findings and resolution log
- docs/ux-spec.md — updated with fixes

## Quality Criteria
- User journey coverage verified against PRD
- Accessibility compliance checked
- All interaction states covered
- Design system consistency verified
- Error states present for all failure-capable actions

## Methodology Scaling
- **deep**: Full multi-pass review. **mvp**: Journey coverage only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
