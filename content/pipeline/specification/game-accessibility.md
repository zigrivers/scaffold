---
name: game-accessibility
description: Define accessibility features across visual, motor, cognitive, auditory, speech, and photosensitivity categories
summary: "Creates an accessibility plan organized by Xbox Accessibility Guidelines (XAG) categories with implementation priorities, platform requirements, and CVAA compliance for communication features."
phase: "specification"
order: 861
dependencies: [game-design-document]
outputs: [docs/game-accessibility.md]
conditional: null
reads: []
knowledge-base: [game-accessibility]
---

## Purpose
Define a comprehensive game accessibility plan organized by Xbox Accessibility
Guidelines (XAG) categories: visual, motor, cognitive, auditory, speech, and
photosensitivity. Each category receives concrete feature requirements with
implementation priority, platform-specific constraints, and compliance notes.

Games have unique accessibility challenges compared to traditional software —
real-time input demands, spatial audio reliance, color-coded gameplay feedback,
and rapid visual effects all create barriers. This step produces an actionable
accessibility plan that feeds into input-controls-spec, game-ui-spec, and
implementation tasks.

For games with online communication features, this step also documents CVAA
(21st Century Communications and Video Accessibility Act) compliance
requirements for text chat, voice chat, and video communication.

## Inputs
- docs/game-design.md (required) — mechanics, core loop, and interaction model
- docs/plan.md (required) — target platforms and audience
- docs/performance-budgets.md (optional) — platform constraints affecting accessibility features

## Expected Outputs
- docs/game-accessibility.md — accessibility plan with per-category features,
  priorities, platform requirements, and compliance notes

## Quality Criteria
- (mvp) All six XAG categories addressed: visual, motor, cognitive, auditory, speech, photosensitivity
- (mvp) Every accessibility feature has an implementation priority (P0-P3) and target milestone
- (mvp) Remappable controls requirement documented (feeds input-controls-spec)
- (mvp) Subtitle and caption requirements specified with size, contrast, and speaker identification
- (mvp) Colorblind-safe palette requirement documented — no gameplay information conveyed by color alone
- (deep) Platform-specific accessibility API integration documented (Xbox XAG, PlayStation accessibility toolkit, iOS/Android system settings)
- (deep) CVAA compliance checklist for communication features (text chat, voice chat, video)
- (deep) Difficulty and assist mode spectrum defined (speed reduction, aim assist, skip mechanics)
- (deep) Photosensitivity analysis: flash frequency limits, screen-shake toggle, motion reduction mode

## Methodology Scaling
- **deep**: Full accessibility audit across all six XAG categories with
  platform-specific API integration, CVAA compliance checklist, difficulty
  spectrum design, photosensitivity analysis, and accessibility QA test
  plan. 10-20 pages.
- **mvp**: Core accessibility features: remappable controls, subtitle support,
  colorblind mode, and font scaling. 2-4 pages.
- **custom:depth(1-5)**:
  - Depth 1: remappable controls and subtitle requirements only.
  - Depth 2: add colorblind-safe palette, font scaling, and audio cue alternatives.
  - Depth 3: add difficulty/assist modes, screen reader menu support, and motor accessibility options.
  - Depth 4: add platform-specific API integration, CVAA compliance, and photosensitivity analysis.
  - Depth 5: full accessibility specification with QA test plan, conformance reporting template, and accessibility certification preparation.

## Mode Detection
Check for docs/game-accessibility.md. If it exists, operate in update mode:
read existing accessibility plan and diff against current GDD mechanics. New
mechanics may introduce new accessibility barriers. Preserve existing feature
priorities and compliance decisions. Add accessibility requirements for any
new mechanics or interaction patterns.

## Update Mode Specifics
- **Detect prior artifact**: docs/game-accessibility.md exists
- **Preserve**: existing feature priorities, platform API integration
  decisions, CVAA compliance status, difficulty spectrum design
- **Triggers for update**: GDD added new mechanics or interaction patterns,
  target platforms changed, communication features added (triggers CVAA
  review), performance budgets revised (may affect accessibility feature
  feasibility)
- **Conflict resolution**: if a new mechanic conflicts with an existing
  accessibility requirement (e.g., color-dependent feedback), flag the
  conflict and propose alternatives that preserve both gameplay intent and
  accessibility; never silently remove accessibility features
