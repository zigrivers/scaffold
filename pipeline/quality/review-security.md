---
name: review-security
description: Review security review for coverage and correctness
phase: "quality"
order: 960
dependencies: [security]
outputs: [docs/reviews/review-security.md, docs/reviews/security/review-summary.md, docs/reviews/security/codex-review.json, docs/reviews/security/gemini-review.json]
conditional: null
reads: [api-contracts]
knowledge-base: [review-methodology, review-security, multi-model-review-dispatch, review-step-template]
---

## Purpose
Review security review targeting security-specific failure modes: OWASP coverage
gaps, auth/authz boundary mismatches with API contracts, secrets management gaps,
insufficient dependency audit coverage, missing threat model scenarios, and data
classification gaps.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/security-review.md (required) — security review document
- docs/api-contracts.md (optional) — for auth boundary alignment
- docs/system-architecture.md (required) — for attack surface coverage

## Expected Outputs
- docs/reviews/review-security.md — findings and resolution log
- docs/security-review.md — updated with fixes
- docs/reviews/security/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/security/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/security/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) OWASP coverage verified for this project
- (deep) Auth boundaries match API contract auth requirements
- (deep) Secrets management covers: all environment variables, API keys, database credentials, and third-party tokens
- (deep) Dependency audit scope covers all dependencies
- (deep) Threat model covers all trust boundaries
- (deep) Data classification covers every entity in the domain model
- Every finding categorized P0-P3 with specific control, boundary, and issue
- Fix plan documented for all P0/P1 findings; fixes applied to security-review.md and re-validated
- Downstream readiness confirmed — no unresolved P0 or P1 findings remain before planning phase proceeds
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: OWASP coverage check only.
- **custom:depth(1-5)**: Depth 1: OWASP top 10 and secrets management pass only. Depth 2: add auth boundary and input validation passes. Depth 3: add dependency audit and data protection passes. Depth 4: add external model security review. Depth 5: multi-model security review with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/security/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-security.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
