---
name: review-ux
description: Review UX specification for completeness and usability
phase: "specification"
order: 860
dependencies: [ux-spec]
outputs: [docs/reviews/review-ux.md, docs/reviews/ux/review-summary.md, docs/reviews/ux/codex-review.json, docs/reviews/ux/gemini-review.json]
conditional: "if-needed"
reads: [api-contracts]
knowledge-base: [review-methodology, review-ux-specification, multi-model-review-dispatch, review-step-template]
---

## Purpose
Review UX specification targeting UX-specific failure modes: user journey gaps,
accessibility issues, incomplete interaction states, design system inconsistencies,
and missing error states.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/ux-spec.md (required) — spec to review
- docs/plan.md (required) — for journey coverage
- docs/api-contracts.md (optional) — for data shape alignment

## Expected Outputs
- docs/reviews/review-ux.md — findings and resolution log
- docs/ux-spec.md — updated with fixes
- docs/reviews/ux/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/ux/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/ux/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) User journey coverage verified against PRD
- (mvp) Accessibility verified against WCAG level specified in ux-spec
- (deep) Every user action has at minimum: loading, success, and error states documented
- (deep) Design system consistency verified
- (deep) Error states present for all failure-capable actions
- (mvp) Every finding categorized P0-P3 with specific flow, screen, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to ux-spec.md and re-validated
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain before quality phase proceeds
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: Journey coverage only.
- **custom:depth(1-5)**: Depth 1: flow completeness and accessibility pass only. Depth 2: add responsive design and error state passes. Depth 3: add interaction patterns and platform consistency passes. Depth 4: add external model UX review. Depth 5: multi-model review with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/ux/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-ux.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
