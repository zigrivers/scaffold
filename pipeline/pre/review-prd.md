---
name: review-prd
description: Multi-pass review of the PRD for completeness, clarity, and downstream readiness
phase: "pre"
order: 120
dependencies: [create-prd]
outputs: [docs/reviews/pre-review-prd.md, docs/reviews/prd/review-summary.md, docs/reviews/prd/codex-review.json, docs/reviews/prd/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-prd, prd-craft, gap-analysis, multi-model-review-dispatch, review-step-template]
---

## Purpose
Deep multi-pass review of the PRD, targeting the specific failure modes of
product requirements artifacts. Identify issues, create a fix plan, execute
fixes, and re-validate. Ensures the PRD is complete, clear, consistent, and
ready for User Stories to consume.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/plan.md (required) — PRD to review
- Project idea or brief (context from user, if available)

## Expected Outputs
- docs/reviews/pre-review-prd.md — review findings, fix plan, and resolution log
- docs/plan.md — updated with fixes
- docs/reviews/prd/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/prd/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/prd/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- All review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Downstream readiness confirmed (User Stories can proceed)
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: All 8 review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Passes 1-2 only (Problem Statement Rigor, Persona Coverage). Focus
  on blocking gaps — requirements too vague to write stories from.
- **custom:depth(1-5)**: Depth 1-2: passes 1-2 only (Problem Statement Rigor,
  Persona Coverage). Depth 3: passes 1-4 (add Feature Scoping, Success
  Criteria). Depth 4: all 8 passes + one external model review (if CLI
  available). Depth 5: all 8 passes + multi-model review with reconciliation.

## Mode Detection
If docs/reviews/pre-review-prd.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated PRD.
If multi-model review artifacts exist under docs/reviews/prd/, preserve prior
findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-prd.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
