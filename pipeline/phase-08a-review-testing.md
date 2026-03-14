---
name: phase-08a-review-testing
description: Review testing strategy for coverage gaps and feasibility
phase: "8a"
dependencies: [phase-08-testing-strategy]
outputs: [docs/reviews/phase-08a-review.md]
conditional: null
knowledge-base: [review-methodology, review-testing-strategy]
---

## Purpose
Review testing strategy targeting testing-specific failure modes: coverage gaps
by layer, missing edge cases from domain invariants, unrealistic test environment
assumptions, inadequate performance test coverage, and missing integration boundaries.

## Inputs
- docs/testing-strategy.md (required) — strategy to review
- docs/domain-models/ (required) — for invariant test case coverage
- docs/system-architecture.md (required) — for layer coverage

## Expected Outputs
- docs/reviews/phase-08a-review.md — findings and resolution log
- docs/testing-strategy.md — updated with fixes

## Quality Criteria
- Coverage gaps by layer identified
- Domain invariant test cases verified
- Test environment assumptions validated
- Performance test coverage assessed against NFRs
- Integration boundaries have integration tests defined

## Methodology Scaling
- **deep**: Full multi-pass review targeting all testing failure modes.
- **mvp**: Coverage gap check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
