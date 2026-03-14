---
name: phase-09a-review-operations
description: Review operations runbook for completeness and safety
phase: "9a"
dependencies: [phase-09-operations]
outputs: [docs/reviews/phase-09a-review.md]
conditional: null
knowledge-base: [review-methodology, review-operations]
---

## Purpose
Review operations runbook targeting operations-specific failure modes: deployment
strategy gaps, missing rollback procedures, monitoring blind spots, unjustified
alerting thresholds, missing runbook scenarios, and DR coverage gaps.

## Inputs
- docs/operations-runbook.md (required) — runbook to review
- docs/system-architecture.md (required) — for deployment coverage

## Expected Outputs
- docs/reviews/phase-09a-review.md — findings and resolution log
- docs/operations-runbook.md — updated with fixes

## Quality Criteria
- Deployment lifecycle fully documented (deploy, verify, rollback)
- Monitoring covers all critical metrics
- Alert thresholds have rationale
- Common failure scenarios have runbook entries
- Dev environment parity assessed

## Methodology Scaling
- **deep**: Full multi-pass review. **mvp**: Deployment coverage only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
