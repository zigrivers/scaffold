---
name: playtest-plan
description: Design playtest strategy with types, scheduling, feedback collection, FTUE observation, and balance testing
summary: "Designs your playtest strategy — internal, focused, and external playtests tied to milestone gates — with feedback templates, FTUE observation protocols, balance testing methodology, and participant recruitment plans."
phase: "quality"
order: 961
dependencies: [game-design-document, user-stories]
outputs: [docs/playtest-plan.md]
conditional: null
reads: [analytics-telemetry]
knowledge-base: [game-testing-strategy, game-milestone-definitions]
---

## Purpose
Define the complete playtesting strategy that validates game feel, balance,
usability, and fun throughout development. Playtesting is distinct from QA
testing (which validates correctness) — playtesting validates that the game is
enjoyable, understandable, and appropriately challenging for the target audience.

This plan covers three playtest tiers: internal playtests (team members testing
daily builds), focused playtests (targeted sessions with specific test goals
and recruited participants), and external playtests (public or semi-public
tests for scale validation and market feedback). Each tier maps to development
milestones — internal playtests begin at First Playable, focused playtests at
Alpha, and external playtests at Beta.

The plan also establishes feedback collection methodology — standardized
templates, observation protocols, and metrics — so that playtest data drives
design decisions rather than anecdotal impressions.

## Inputs
- docs/game-design.md (required) — core loop, progression, difficulty model, target audience
- docs/user-stories.md (required) — acceptance criteria defining expected player experience
- docs/plan.md (required) — milestone schedule and target platforms

## Expected Outputs
- docs/playtest-plan.md — playtest types, schedule, feedback templates, FTUE
  observation protocol, balance testing methodology, and recruitment plan

## Quality Criteria
- (mvp) Three playtest tiers defined (internal, focused, external) with distinct goals, participant profiles, and session formats
- (mvp) Playtest schedule tied to project milestones: which tier runs at which milestone, with minimum session count per gate
- (mvp) Feedback template defined with structured fields: task completion (yes/no), difficulty rating (scale), confusion points (free-text), fun rating (scale), and session metadata (build version, platform, duration)
- (mvp) FTUE (First-Time User Experience) observation protocol: what to observe (time-to-first-action, tutorial completion rate, first death/failure point), how to record (screen capture + observer notes), and when to intervene (never during observation, debrief after)
- (deep) Balance testing methodology: metrics to collect per gameplay system (win rates, resource accumulation curves, time-to-completion per level/encounter), acceptable variance ranges, and rebalancing trigger thresholds
- (deep) Participant recruitment plan: target demographics matching game audience, recruitment channels, screening criteria, compensation/incentive structure, NDA requirements for pre-release tests
- (deep) Playtest environment specification: hardware requirements, network conditions to simulate, build distribution method (Steam playtest, TestFlight, side-loading), telemetry collection during sessions
- (deep) Playtest-to-design feedback loop: how findings are triaged (critical/major/minor), who owns resolution, turnaround time targets between playtest and design response
- (deep) Accessibility playtest sessions: dedicated sessions with players using assistive technologies to validate accessibility features from game-accessibility spec
- (deep) Telemetry integration specified: which analytics events are collected during playtest sessions, how automated metrics complement observer notes

## Methodology Scaling
- **deep**: Full playtest plan covering all three tiers with detailed schedules,
  observation protocols, balance testing with statistical methodology, recruitment
  pipeline, environment specs, and feedback-to-design triage process. 12-20 pages.
- **mvp**: Internal and focused playtest definitions, milestone-linked schedule,
  basic feedback template, and FTUE observation checklist. 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: internal playtest cadence and basic feedback template only.
  - Depth 2: add focused playtest definition and FTUE observation protocol.
  - Depth 3: add milestone-linked schedule, balance testing metrics, and participant screening criteria.
  - Depth 4: add external playtest plan, recruitment pipeline, environment specification, and accessibility playtest sessions.
  - Depth 5: full plan with statistical balance methodology, feedback-to-design triage process, and playtest iteration tracking across milestones.

## Mode Detection
Check for docs/playtest-plan.md. If it exists, operate in update mode: read
existing plan and diff against current GDD progression/difficulty model and
milestone schedule. Preserve existing feedback templates, observation protocols,
and recruitment criteria. Update schedule if milestones shifted. Add new
playtest sessions if GDD added new gameplay systems requiring validation.

## Update Mode Specifics
- **Detect prior artifact**: docs/playtest-plan.md exists
- **Preserve**: feedback templates, FTUE observation protocol, recruitment
  criteria, balance testing thresholds, participant compensation structure,
  existing playtest results and findings
- **Triggers for update**: GDD changed core loop or difficulty model (balance
  testing needs revision), milestone schedule shifted (playtest dates need
  updating), user stories changed acceptance criteria (new scenarios to test),
  accessibility spec updated (new assistive technology sessions needed)
- **Conflict resolution**: if milestone changes compress the playtest schedule,
  prioritize focused playtests over external playtests and flag the reduced
  testing coverage for user decision; never remove a playtest tier without
  approval
