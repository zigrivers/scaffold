---
name: review-operations
description: Review operations runbook for completeness and safety
phase: "quality"
order: 940
dependencies: [operations]
outputs: [docs/reviews/review-operations.md, docs/reviews/operations/review-summary.md, docs/reviews/operations/codex-review.json, docs/reviews/operations/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-operations, multi-model-review-dispatch, review-step-template]
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
- (mvp) Deployment lifecycle fully documented (deploy, verify, rollback)
- (mvp) Monitoring verified against minimum set: latency, error rate, and saturation
- (deep) Alert thresholds have rationale
- (deep) Common failure scenarios have runbook entries
- (deep) Dev/staging/production environment differences documented in operations runbook
- Every finding categorized P0-P3 with specific runbook section, metric, and issue
- Fix plan documented for all P0/P1 findings; fixes applied to operations-runbook.md and re-validated
- Downstream readiness confirmed — no unresolved P0 or P1 findings remain before security step proceeds
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: Full multi-pass review. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: Deployment coverage only.
- **custom:depth(1-5)**: Depth 1: monitoring and logging pass only. Depth 2: add deployment and rollback pass. Depth 3: add incident response and scaling passes. Depth 4: add external model review. Depth 5: multi-model review with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/operations/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-operations.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
