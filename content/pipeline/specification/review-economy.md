---
name: review-economy
description: Review economy design for inflation trajectories, exploit vectors, ethical monetization, and legal compliance
summary: "Multi-pass review of economy design checking inflation/deflation trajectories, exploit vectors, ethical monetization compliance, pay-to-win detection, legal compliance per market, progression-monetization separation, and live-service sustainability."
phase: "specification"
order: 869
dependencies: [economy-design]
outputs: [docs/reviews/specification-review-economy.md]
conditional: "if-needed"
reads: [game-design-document]
knowledge-base: [review-game-economy, review-step-template, multi-model-review-dispatch]
---

## Purpose
Multi-pass review of the economy design targeting economy-specific failure modes:
unchecked inflation or deflation trajectories, exploitable currency conversion
paths, predatory monetization patterns, pay-to-win competitive advantages,
legal non-compliance per target market, broken progression-monetization
separation, and unsustainable live-service economy plans.

Economy bugs discovered in live service cost orders of magnitude more to fix
than those caught at design time — a duplication exploit discovered post-launch
can destroy an economy in hours, and rebalancing a live economy with real-money
purchases has legal implications. This review catches these failures before
implementation begins.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Conditional Evaluation
Enable when: economy-design is enabled (i.e., the game has virtual currencies,
resource systems, loot tables, or monetization mechanics). If economy-design
runs, this review must follow it.

Skip when: economy-design is skipped (i.e., the game has no resource economy).
No economy design means no economy review.

## Inputs
- docs/economy-design.md (required) — economy specification to review
- docs/game-design.md (required) — core loop and progression mechanics for cross-reference
- docs/plan.md (required) — target markets and business model for legal compliance verification

## Expected Outputs
- docs/reviews/specification-review-economy.md — findings and resolution log
- docs/economy-design.md — updated with fixes
- docs/reviews/economy/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/economy/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/economy/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Inflation/deflation trajectory verified: currency generation and removal rates produce a stable or managed economy over the player lifecycle
- (mvp) Exploit vectors audited: duplication, overflow, conversion rate manipulation, and timing exploits identified and mitigated at design level
- (mvp) Ethical monetization verified: no pay-to-win advantages in PvP contexts, spending limit awareness mechanisms present, no predatory patterns targeting vulnerable players
- (mvp) Every finding categorized P0-P3 with specific section and issue. Severity definitions: P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to economy-design.md and re-validated
- (deep) Legal compliance verified per target market: probability disclosure, age-gating, spending limits, loot box classification
- (deep) Progression-monetization separation verified: removing all real-money paths leaves a satisfying progression experience
- (deep) Live-service sustainability checked: seasonal economy additions do not compound inflation, event currencies have clear expiration or conversion paths
- (deep) Economy simulation formulas verified for mathematical consistency (no negative balances, no infinite loops, no unreachable milestones)
- (mvp) Review report includes explicit Readiness Status section
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain
- (depth 4+) Multi-model findings synthesized: Consensus, Majority, or Divergent with user escalation

## Methodology Scaling
- **deep**: All 7 review passes (Inflation Trajectory, Exploit Vectors,
  Ethical Monetization, Pay-to-Win Detection, Legal Compliance,
  Earn Rate vs Engagement Projection, Sink Effectiveness Analysis).
  Multi-model review dispatched to Codex and Gemini if available, with
  graceful fallback to Claude-only enhanced review.
- **mvp**: Three passes — Inflation Trajectory, Exploit Vectors, and Ethical
  Monetization only.
- **custom:depth(1-5)**:
  - Depth 1: two passes — Inflation Trajectory and Exploit Vectors only.
  - Depth 2: three passes — add Ethical Monetization compliance.
  - Depth 3: five passes — add Pay-to-Win Detection and Legal Compliance.
  - Depth 4: all 7 passes + one external model (if CLI available).
  - Depth 5: all 7 passes + multi-model with reconciliation.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/economy/, preserve prior findings still valid.

## Update Mode Specifics
- **Detect**: `docs/reviews/specification-review-economy.md` exists with tracking comment
- **Preserve**: prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: previously resolved findings reappearing = regression; flag and re-evaluate
