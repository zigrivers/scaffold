---
name: review-testing
description: Review testing strategy for coverage gaps and feasibility
summary: "Audits the testing strategy for coverage gaps by layer, verifies edge cases from domain invariants are tested, and checks that test environment assumptions match actual config."
phase: "quality"
order: 910
dependencies: [tdd, system-architecture]
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
- (mvp) Coverage gaps by layer documented with severity
- (deep) If docs/domain-models/ exists, domain invariant test cases verified. Otherwise, test invariants derived from story acceptance criteria.
- (deep) Each test environment assumption verified against actual environment config or flagged as unverifiable
- (deep) Performance test coverage assessed against NFRs
- (deep) Integration boundaries have integration tests defined
- Every finding categorized P0-P3 (P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.) with specific test layer, gap, and issue
- Fix plan documented for all P0/P1 findings; fixes applied to tdd-standards.md and re-validated
- Downstream readiness confirmed — no unresolved P0 or P1 findings remain before operations step proceeds
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Full multi-pass review targeting all testing failure modes. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Coverage gap check only.
- **custom:depth(1-5)**:
  - Depth 1: Test coverage and pyramid balance pass only (1 review pass)
  - Depth 2: Add test quality and naming convention passes (2 review passes)
  - Depth 3: Add edge case coverage and CI integration passes (4 review passes)
  - Depth 4: Add external model review (4 review passes + external dispatch)
  - Depth 5: Multi-model review with reconciliation (4 review passes + multi-model synthesis)

## Mode Detection
Re-review mode if docs/reviews/review-testing.md or docs/reviews/testing/
directory exists. If multi-model review artifacts exist under
docs/reviews/testing/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-testing.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
