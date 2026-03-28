---
name: review-api
description: Review API contracts for completeness and consistency
phase: "specification"
order: 840
dependencies: [api-contracts]
outputs: [docs/reviews/review-api.md]
conditional: "if-needed"
knowledge-base: [review-methodology, review-api-contracts]
---

## Purpose
Review API contracts targeting API-specific failure modes: operation coverage
gaps, error contract incompleteness, auth/authz gaps, versioning inconsistencies,
payload shape mismatches with domain entities, and idempotency gaps.

## Inputs
- docs/api-contracts.md (required) — contracts to review
- docs/domain-models/ (required) — for operation coverage
- docs/adrs/ (required) — for consistency checking
- docs/system-architecture.md (required) — for interface coverage

## Expected Outputs
- docs/reviews/review-api.md — findings and resolution log
- docs/api-contracts.md — updated with fixes

## Quality Criteria
- Operation coverage against domain model verified
- Error contracts complete and consistent
- Auth requirements specified for every endpoint
- Versioning strategy consistent with ADRs
- Idempotency documented for all mutating operations

## Methodology Scaling
- **deep**: Full multi-pass review targeting all API failure modes.
- **mvp**: Operation coverage check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
