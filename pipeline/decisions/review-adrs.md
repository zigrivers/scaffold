---
name: review-adrs
description: Review ADRs for completeness, consistency, and decision quality
phase: "decisions"
order: 620
dependencies: [adrs]
outputs: [docs/reviews/review-adrs.md]
conditional: null
knowledge-base: [review-methodology, review-adr]
---

## Purpose
Multi-pass review of ADRs targeting ADR-specific failure modes: contradictory
decisions, missing rationale, implied-but-unrecorded decisions, and unresolved
trade-offs.

## Inputs
- docs/adrs/ (required) — ADRs to review
- docs/domain-models/ (required) — for coverage checking
- docs/plan.md (required) — for requirement tracing

## Expected Outputs
- docs/reviews/review-adrs.md — findings and resolution log
- docs/adrs/ — updated with fixes

## Quality Criteria
- All ADR-specific review passes executed
- Every finding categorized by severity
- Missing decisions identified and documented
- Contradictions resolved
- Downstream readiness confirmed (architecture phase can proceed)

## Methodology Scaling
- **deep**: All review passes. Full findings report. Fixes applied and re-validated.
- **mvp**: Quick consistency check for contradictions only.
- **custom:depth(1-5)**: Scale number of review passes with depth.

## Mode Detection
Re-review mode if previous review exists. Check which findings were addressed.
