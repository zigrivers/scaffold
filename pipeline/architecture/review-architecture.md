---
name: review-architecture
description: Review system architecture for completeness and downstream readiness
summary: "Verifies every domain concept lands in a component, every decision constraint is respected, no components are orphaned from data flows, and the module structure minimizes merge conflicts."
phase: "architecture"
order: 720
dependencies: [system-architecture]
outputs: [docs/reviews/review-architecture.md, docs/reviews/architecture/review-summary.md, docs/reviews/architecture/codex-review.json, docs/reviews/architecture/gemini-review.json]
reads: [domain-modeling]
conditional: null
knowledge-base: [review-methodology, review-system-architecture, multi-model-review-dispatch, review-step-template]
---

## Purpose
Multi-pass review of the system architecture targeting architecture-specific
failure modes: domain coverage gaps, ADR constraint violations, data flow
orphans, module structure issues, state inconsistencies, diagram/prose drift,
and downstream readiness.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/system-architecture.md (required) — architecture to review
- docs/domain-models/ (required) — for coverage checking
- docs/adrs/ (required) — for constraint compliance
- docs/plan.md (required) — for requirement tracing

## Expected Outputs
- docs/reviews/review-architecture.md — findings and resolution log
- docs/system-architecture.md — updated with fixes
- docs/reviews/architecture/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/architecture/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/architecture/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Domain model coverage verified (every model maps to a component)
- (mvp) ADR constraint compliance verified
- (deep) All architecture-specific review passes executed
- (deep) Data flow completeness verified (no orphaned components)
- (deep) Module structure assessed for merge conflict risk, circular dependency risk, and import depth
- (mvp) Downstream readiness confirmed (specification, quality, and planning steps can proceed)
- (mvp) Every finding categorized P0-P3 with specific component, section, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to system-architecture.md and re-validated
- (depth 4+) Multi-model findings synthesized with consensus/disagreement analysis

## Methodology Scaling
- **deep**: All 10 review passes (coverage, constraints, data flows, module
  structure, state consistency, diagram integrity, extension points,
  invariants, downstream readiness, internal consistency). Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Domain coverage and ADR compliance checks only.
- **custom:depth(1-5)**: Depth 1-3: scale number of passes with depth.
  Depth 4: all passes + one external model (if CLI available). Depth 5:
  all passes + multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/architecture/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-architecture.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
