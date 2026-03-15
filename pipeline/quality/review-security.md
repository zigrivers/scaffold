---
name: review-security
description: Review security review for coverage and correctness
phase: "quality"
order: 24
dependencies: [security]
outputs: [docs/reviews/review-security.md]
conditional: null
knowledge-base: [review-methodology, review-security]
---

## Purpose
Review security review targeting security-specific failure modes: OWASP coverage
gaps, auth/authz boundary mismatches with API contracts, secrets management gaps,
insufficient dependency audit coverage, missing threat model scenarios, and data
classification gaps.

## Inputs
- docs/security-review.md (required) — security review document
- docs/api-contracts.md (optional) — for auth boundary alignment
- docs/system-architecture.md (required) — for attack surface coverage

## Expected Outputs
- docs/reviews/review-security.md — findings and resolution log
- docs/security-review.md — updated with fixes

## Quality Criteria
- OWASP coverage verified for this project
- Auth boundaries match API contract auth requirements
- Secrets management is complete (no gaps)
- Dependency audit scope covers all dependencies
- Threat model covers all trust boundaries
- Data classification is complete

## Methodology Scaling
- **deep**: Full multi-pass review. **mvp**: OWASP coverage check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
