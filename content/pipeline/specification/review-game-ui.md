---
name: review-game-ui
description: Review game UI specification for completeness, accessibility coverage, and controller navigation
summary: "Multi-pass review of game UI spec checking HUD clarity, menu completeness, controller accessibility, settings coverage, FTUE effectiveness, state machine completeness, and platform shell compliance."
phase: "specification"
order: 864
dependencies: [game-ui-spec]
outputs: [docs/reviews/specification-review-game-ui.md]
conditional: null
reads: [game-design-document, game-accessibility, input-controls-spec]
knowledge-base: [review-game-ui, game-accessibility, review-step-template, multi-model-review-dispatch]
---

## Purpose
Review the game UI specification for completeness, accessibility compliance,
and controller navigation coverage. This is a multi-pass review targeting
game-UI-specific failure modes: HUD information overload, incomplete menu
hierarchies, missing controller navigation paths, inadequate settings coverage,
ineffective FTUE design, incomplete UI state machines, and platform shell
non-compliance.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/game-ui-spec.md (required) — spec to review
- docs/game-design.md (required) — for mechanic-to-HUD coverage verification
- docs/game-accessibility.md (required) — for accessibility requirement compliance
- docs/input-controls-spec.md (required) — for controller navigation consistency

## Expected Outputs
- docs/reviews/specification-review-game-ui.md — findings and resolution log
- docs/game-ui-spec.md — updated with fixes
- docs/reviews/game-ui/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/game-ui/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/game-ui/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every GDD mechanic with player-visible feedback has a corresponding HUD element or UI flow
- (mvp) Controller navigation verified: every menu screen is reachable and has defined focus order
- (mvp) Accessibility requirements from game-accessibility.md are reflected in UI spec (colorblind palette, font scaling, subtitle rendering)
- (mvp) Settings screen covers all five minimum categories (gameplay, video, audio, controls, accessibility)
- (mvp) Every finding categorized P0-P3 with specific screen, element, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to game-ui-spec.md and re-validated
- (deep) FTUE teaches all core loop mechanics — no mechanic requires undocumented player discovery
- (deep) UI state machines cover all transitions (no orphaned states, no missing error/disconnect states)
- (deep) Platform shell compliance verified (console certification UI requirements)
- (mvp) Review report includes explicit Readiness Status section
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain
- (depth 4+) Multi-model findings synthesized: Consensus, Majority, or Divergent with user escalation

## Methodology Scaling
- **deep**: Full multi-pass review covering HUD clarity, menu completeness,
  controller navigation, accessibility compliance, FTUE effectiveness, state
  machine completeness, and platform shell compliance. Multi-model review
  dispatched if available.
- **mvp**: HUD coverage and controller navigation pass only.
- **custom:depth(1-5)**:
  - Depth 1: two passes — HUD-to-mechanic coverage and controller navigation reachability.
  - Depth 2: four passes — add settings completeness and accessibility compliance.
  - Depth 3: six passes — add FTUE effectiveness and UI state machine completeness.
  - Depth 4: all 7 passes (add platform shell compliance) + one external model (if CLI available).
  - Depth 5: all 7 passes + multi-model review with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/game-ui/, preserve prior findings still valid.

## Update Mode Specifics
- **Detect**: `docs/reviews/specification-review-game-ui.md` exists with tracking comment
- **Preserve**: prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: previously resolved findings reappearing = regression; flag and re-evaluate
