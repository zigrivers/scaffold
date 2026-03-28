---
name: review-operations
description: Review operations runbook for completeness and safety
phase: "quality"
order: 940
dependencies: [operations]
outputs: [docs/reviews/review-operations.md]
conditional: null
knowledge-base: [review-methodology, review-operations]
---

## Purpose
Review operations runbook targeting operations-specific failure modes: deployment
strategy gaps, missing rollback procedures, monitoring blind spots, unjustified
alerting thresholds, missing runbook scenarios, and DR coverage gaps.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/operations-runbook.md (required) — runbook to review
- docs/system-architecture.md (required) — for deployment coverage

## Expected Outputs
- docs/reviews/review-operations.md — findings and resolution log
- docs/operations-runbook.md — updated with fixes
- docs/reviews/operations/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/operations/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/operations/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- Deployment lifecycle fully documented (deploy, verify, rollback)
- Monitoring covers all critical metrics
- Alert thresholds have rationale
- Common failure scenarios have runbook entries
- Dev environment parity assessed
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
  **mvp**: Deployment coverage only.
- **custom:depth(1-5)**: Depth 1-3: scale passes with depth. Depth 4: full
  review + one external model (if CLI available). Depth 5: full review +
  multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/operations/, preserve prior findings still valid.
