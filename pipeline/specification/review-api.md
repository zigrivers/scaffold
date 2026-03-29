---
name: review-api
description: Review API contracts for completeness and consistency
summary: "Checks that every domain operation has an endpoint, error responses include domain-specific codes, and auth requirements are specified for every route."
phase: "specification"
order: 840
dependencies: [api-contracts]
outputs: [docs/reviews/review-api.md, docs/reviews/api/review-summary.md, docs/reviews/api/codex-review.json, docs/reviews/api/gemini-review.json]
conditional: "if-needed"
knowledge-base: [review-methodology, review-api-design, multi-model-review-dispatch, review-step-template]
---

## Purpose
Review API contracts targeting API-specific failure modes: operation coverage
gaps, error contract incompleteness, auth/authz gaps, versioning inconsistencies,
payload shape mismatches with domain entities, and idempotency gaps.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/api-contracts.md (required) — contracts to review
- docs/domain-models/ (required) — for operation coverage
- docs/adrs/ (required) — for consistency checking
- docs/system-architecture.md (required) — for interface coverage

## Expected Outputs
- docs/reviews/review-api.md — findings and resolution log
- docs/api-contracts.md — updated with fixes
- docs/reviews/api/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/api/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/api/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Operation coverage against domain model verified
- (deep) Error contracts complete and consistent
- (deep) Auth requirements specified for every endpoint
- (deep) Versioning strategy consistent with ADRs
- (deep) Idempotency documented for all mutating operations
- (mvp) Every finding categorized P0-P3 (P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.) with specific endpoint, field, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to api-contracts.md and re-validated
- (mvp) Review report includes explicit Readiness Status section
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain before UX spec proceeds
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Full multi-pass review targeting all API failure modes. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Operation coverage check only.
- **custom:depth(1-5)**:
  - Depth 1: Endpoint coverage and response format pass only (1 review pass)
  - Depth 2: Add error handling and auth requirement passes (2 review passes)
  - Depth 3: Add idempotency, pagination, and versioning passes (4 review passes)
  - Depth 4: Add external model API review (4 review passes + external dispatch)
  - Depth 5: Multi-model review with reconciliation (4 review passes + multi-model synthesis)

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/api/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-api.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
