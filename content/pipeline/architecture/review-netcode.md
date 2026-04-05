---
name: review-netcode
description: Review netcode specification for latency tolerance, bandwidth, cheat resistance, and edge cases
summary: "Multi-pass review of netcode spec checking latency tolerance, bandwidth compliance, cheat resistance, determinism verification, and connection edge cases."
phase: "architecture"
order: 716
dependencies: [netcode-spec]
outputs: [docs/reviews/architecture-review-netcode.md]
conditional: "if-needed"
reads: []
knowledge-base: [review-netcode, review-step-template, multi-model-review-dispatch]
---

## Purpose
Multi-pass review of the netcode specification targeting networking-specific
failure modes: latency tolerance violations, bandwidth budget overruns, cheat
surface exposure, determinism gaps in simulation, connection edge case omissions,
and inconsistencies with the system architecture and performance budgets.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Conditional Evaluation
Enable when: netcode-spec is enabled (i.e., `multiplayerMode` is `online` or
`hybrid`). If netcode-spec runs, this review must follow it.

Skip when: netcode-spec is skipped (i.e., `multiplayerMode` is `none` or
`local`). No netcode spec means no netcode review.

## Inputs
- docs/netcode-spec.md (required) — netcode specification to review
- docs/performance-budgets.md (required) — latency and bandwidth constraints for compliance checking
- docs/system-architecture.md (required) — for cross-referencing component boundaries
- docs/game-design.md (required) — multiplayer mechanics that must be supported

## Expected Outputs
- docs/reviews/architecture-review-netcode.md — findings and resolution log
- docs/netcode-spec.md — updated with fixes
- docs/reviews/netcode/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/netcode/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/netcode/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Latency tolerance verified (prediction window covers target round-trip time)
- (mvp) Bandwidth budget compliance verified (per-connection budget within performance constraints)
- (mvp) Cheat surface audit completed (server authority boundaries cover all game-critical state)
- (mvp) Every finding categorized P0-P3 with specific section and issue. Severity definitions: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to netcode-spec.md and re-validated
- (deep) Determinism verification completed (simulation produces identical results given identical inputs)
- (deep) Connection edge cases audited (reconnection, host migration, NAT traversal, timeout handling)
- (deep) Serialization size audit (message sizes within per-type budgets)
- (deep) Cross-reference with system architecture verified (no orphaned network components)
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: All 7 review passes (Latency Tolerance, Bandwidth Compliance,
  Cheat Surface Audit, Determinism Verification, Connection Edge Cases,
  Serialization Size Audit, Architecture Cross-Reference). Multi-model
  review dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced review.
- **mvp**: Three passes — Latency Tolerance, Bandwidth Compliance, and Cheat
  Surface Audit only.
- **custom:depth(1-5)**:
  - Depth 1: two passes — Latency Tolerance and Bandwidth Compliance only.
  - Depth 2: three passes — add Cheat Surface Audit.
  - Depth 3: five passes — add Determinism Verification and Connection Edge Cases.
  - Depth 4: all 7 passes + one external model (if CLI available).
  - Depth 5: all 7 passes + multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/netcode/, preserve prior findings still valid.

## Update Mode Specifics
- **Detect**: `docs/reviews/architecture-review-netcode.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
