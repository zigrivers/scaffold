---
name: review-testing
description: Review testing strategy for coverage gaps and feasibility
phase: "quality"
order: 910
dependencies: [tdd]
outputs: [docs/reviews/review-testing.md, docs/reviews/testing/review-summary.md, docs/reviews/testing/codex-review.json, docs/reviews/testing/gemini-review.json]
reads: [domain-modeling, system-architecture]
conditional: null
knowledge-base: [review-methodology, review-testing-strategy, multi-model-review-dispatch, review-step-template]
---

## Purpose
Review testing strategy targeting testing-specific failure modes: coverage gaps
by layer, missing edge cases from domain invariants, unrealistic test environment
assumptions, inadequate performance test coverage, and missing integration boundaries.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/tdd-standards.md (required) — strategy to review
- docs/domain-models/ (required) — for invariant test case coverage
- docs/system-architecture.md (required) — for layer coverage

## Expected Outputs
- docs/reviews/review-testing.md — findings and resolution log
- docs/tdd-standards.md — updated with fixes
- docs/reviews/testing/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/testing/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/testing/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- Coverage gaps by layer identified
- Domain invariant test cases verified
- Test environment assumptions validated
- Performance test coverage assessed against NFRs
- Integration boundaries have integration tests defined
- Every finding categorized P0-P3 with specific test layer, gap, and issue
- Fix plan documented for all P0/P1 findings; fixes applied to tdd-standards.md and re-validated
- Downstream readiness confirmed — no unresolved P0 or P1 findings remain before operations step proceeds
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review targeting all testing failure modes. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Coverage gap check only.
- **custom:depth(1-5)**: Depth 1-3: scale passes with depth. Depth 4: full
  review + one external model (if CLI available). Depth 5: full review +
  multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/testing/, preserve prior findings still valid.
