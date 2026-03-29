---
name: review-adrs
description: Review ADRs for completeness, consistency, and decision quality
summary: "Checks for contradictions between decisions, missing decisions implied by the architecture, and whether every choice has honest trade-off analysis."
phase: "decisions"
order: 620
dependencies: [adrs]
outputs: [docs/reviews/review-adrs.md, docs/reviews/adrs/review-summary.md, docs/reviews/adrs/codex-review.json, docs/reviews/adrs/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-adr, multi-model-review-dispatch, review-step-template]
---

## Purpose
Multi-pass review of ADRs targeting ADR-specific failure modes: contradictory
decisions, missing rationale, implied-but-unrecorded decisions, and unresolved
trade-offs.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/adrs/ (required) — ADRs to review
- docs/domain-models/ (required) — for coverage checking
- docs/plan.md (required) — for requirement tracing

## Expected Outputs
- docs/reviews/review-adrs.md — findings and resolution log
- docs/adrs/ — updated with fixes
- docs/reviews/adrs/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/adrs/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/adrs/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) All ADR-specific review passes executed
- (mvp) Every finding categorized P0-P3 with specific ADR number, section, and issue
- (deep) Missing decisions identified and documented
- (mvp) Contradictions resolved
- (mvp) Downstream readiness confirmed (architecture phase can proceed)
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: All review passes. Full findings report. Fixes applied and
  re-validated. Multi-model review dispatched to Codex and Gemini if available,
  with graceful fallback to Claude-only enhanced review.
- **mvp**: Quick consistency check for contradictions only.
- **custom:depth(1-5)**: Depth 1-3: scale number of review passes with depth.
  Depth 4: full review + one external model (if CLI available). Depth 5:
  full review + multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. Check which findings were addressed.
If multi-model review artifacts exist under docs/reviews/adrs/, preserve prior
findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-adrs.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
