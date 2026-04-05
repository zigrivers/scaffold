---
name: review-gdd
description: Multi-pass review of game design document for pillar coherence, mechanic clarity, and scope feasibility
summary: "Stress-tests the GDD through multiple review passes checking pillar coherence, core loop closure, mechanic implementability, progression feasibility, scope assessment, and downstream readiness for user stories."
phase: "pre"
order: 116
dependencies: [game-design-document]
outputs: [docs/reviews/pre-review-gdd.md, docs/reviews/gdd/review-summary.md, docs/reviews/gdd/codex-review.json, docs/reviews/gdd/gemini-review.json]
conditional: null
reads: []
knowledge-base: [review-methodology, review-game-design, review-step-template, multi-model-review-dispatch]
---

## Purpose
Deep multi-pass review of the Game Design Document, targeting the specific
failure modes of game design artifacts. Identify issues with pillar coherence,
core loop closure, mechanic ambiguity, progression feasibility, scope reality,
competitive differentiation, and systems interactions. Create a fix plan,
execute fixes, and re-validate. Ensures the GDD is implementable, internally
consistent, and ready for downstream consumption by user stories, architecture,
and art/audio specifications.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/game-design.md (required) — GDD to review
- docs/plan.md (required) — PRD for cross-referencing features and scope
- docs/reviews/gdd/ artifacts (optional) — prior review findings in update mode

## Expected Outputs
- docs/reviews/pre-review-gdd.md — review findings, fix plan, and resolution log
- docs/game-design.md — updated with fixes
- docs/reviews/gdd/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/gdd/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/gdd/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Passes 1-2 executed with findings documented (Pillar Coherence, Core Loop Closure)
- (deep) All 7 review passes executed with findings documented
- (mvp) Every finding categorized by severity: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (mvp) Fix plan created for P0 and P1 findings
- (mvp) Fixes applied and re-validated
- (mvp) Downstream readiness confirmed (user stories and architecture can proceed)
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: All 7 review passes from the knowledge base (Pillar Coherence, Core
  Loop Closure, Mechanic Ambiguity Detection, Progression Curve Feasibility,
  Scope vs Reality Check, Competitive Differentiation, Systems Interaction
  Audit). Full findings report with severity categorization. Fixes applied and
  re-validated. Multi-model review dispatched to Codex and Gemini if available,
  with graceful fallback to Claude-only enhanced review.
- **mvp**: Passes 1-2 only (Pillar Coherence, Core Loop Closure). Focus on
  blocking gaps — pillars that do not constrain and loops that do not close.
- **custom:depth(1-5)**:
  - Depth 1: Pass 1 only (Pillar Coherence). One review pass.
  - Depth 2: Passes 1-2 (Pillar Coherence, Core Loop Closure). Two review passes.
  - Depth 3: Passes 1-4 (add Mechanic Ambiguity Detection, Progression Curve Feasibility). Four review passes.
  - Depth 4: All 7 passes + one external model review (if CLI available).
  - Depth 5: All 7 passes + multi-model review with reconciliation.

## Mode Detection
If docs/reviews/pre-review-gdd.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated GDD.
If multi-model review artifacts exist under docs/reviews/gdd/, preserve prior
findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/pre-review-gdd.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate
