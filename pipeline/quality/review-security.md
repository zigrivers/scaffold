---
name: review-security
description: Review security review for coverage and correctness
phase: "quality"
order: 960
dependencies: [security]
outputs: [docs/reviews/review-security.md, docs/reviews/security/review-summary.md, docs/reviews/security/codex-review.json, docs/reviews/security/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-security]
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
- OWASP coverage verified for this project
- Auth boundaries match API contract auth requirements
- Secrets management is complete (no gaps)
- Dependency audit scope covers all dependencies
- Threat model covers all trust boundaries
- Data classification is complete
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: OWASP coverage check only.
- **custom:depth(1-5)**: Depth 1-3: scale passes with depth. Depth 4: full
  review + one external model (if CLI available). Depth 5: full review +
  multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/security/, preserve prior findings still valid.
