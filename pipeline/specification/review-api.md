---
name: review-api
description: Review API contracts for completeness and consistency
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
- Operation coverage against domain model verified
- Error contracts complete and consistent
- Auth requirements specified for every endpoint
- Versioning strategy consistent with ADRs
- Idempotency documented for all mutating operations
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review targeting all API failure modes. Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Operation coverage check only.
- **custom:depth(1-5)**: Depth 1-3: scale passes with depth. Depth 4: full
  review + one external model (if CLI available). Depth 5: full review +
  multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/api/, preserve prior findings still valid.
