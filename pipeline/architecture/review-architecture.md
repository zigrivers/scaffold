---
name: review-architecture
description: Review system architecture for completeness and downstream readiness
phase: "architecture"
order: 12
dependencies: [system-architecture]
outputs: [docs/reviews/review-architecture.md]
conditional: null
knowledge-base: [review-methodology, review-system-architecture]
---

## Purpose
Multi-pass review of the system architecture targeting architecture-specific
failure modes: domain coverage gaps, ADR constraint violations, data flow
orphans, module structure issues, state inconsistencies, diagram/prose drift,
and downstream readiness.

## Inputs
- docs/system-architecture.md (required) — architecture to review
- docs/domain-models/ (required) — for coverage checking
- docs/adrs/ (required) — for constraint compliance
- docs/prd.md (required) — for requirement tracing

## Expected Outputs
- docs/reviews/review-architecture.md — findings and resolution log
- docs/system-architecture.md — updated with fixes

## Quality Criteria
- All architecture-specific review passes executed
- Domain model coverage verified (every model maps to a component)
- ADR constraint compliance verified
- Data flow completeness verified (no orphaned components)
- Module structure validated for practical concerns
- Downstream readiness confirmed (Phases 4-7 can proceed)

## Methodology Scaling
- **deep**: All 10 review passes (coverage, constraints, data flows, module
  structure, state consistency, diagram integrity, extension points,
  invariants, downstream readiness, internal consistency).
- **mvp**: Domain coverage and ADR compliance checks only.
- **custom:depth(1-5)**: Scale number of passes with depth.

## Mode Detection
Re-review mode if previous review exists.
