---
name: add-e2e-testing
description: Configure end-to-end testing (Playwright for web, Maestro for mobile) based on detected project platform
phase: "integration"
order: 410
dependencies: [git-workflow, tdd]
outputs: [tests/screenshots/, maestro/]
reads: [tdd, coding-standards]
conditional: "if-needed"
knowledge-base: [testing-strategy]
---

## Purpose
Automatically detects project platform type from tech-stack.md and package.json
to determine which E2E framework(s) to configure. Configures Playwright for web
frontends, Maestro for mobile/Expo apps, or both for multi-platform projects.
Self-skips for backend-only or library projects with no UI.

## Inputs
- docs/tech-stack.md (required) — frontend framework and rendering approach
- docs/tdd-standards.md (required) — E2E placeholder section to fill
- docs/coding-standards.md (required for mobile) — testID conventions to add
- CLAUDE.md (required) — browser/mobile testing section to add
- package.json (read-only) — dependency detection for platform and brownfield signals
- docs/user-stories.md (optional) — key user flows for visual verification

## Expected Outputs
Outputs vary by detected platform:
- (web) Playwright config file, tests/screenshots/ directories, CLAUDE.md and
  tdd-standards.md browser testing sections
- (mobile) maestro/ directory with config, flows, shared sub-flows, screenshots,
  package.json test scripts, coding-standards.md testID conventions, CLAUDE.md
  and tdd-standards.md mobile testing sections
- (both) All of the above

## Quality Criteria
- Platform detection is explicit and logged (web, mobile, both, or skip)
- (web) Playwright config uses framework-specific dev server command and port
- (web) Smoke test passes (navigate, screenshot, close)
- (mobile) Maestro CLI installed, sample flow executes, screenshot captured
- (mobile) testID naming convention defined and documented
- E2E section in tdd-standards.md distinguishes when to use E2E vs unit tests
- Baseline screenshots committed, current screenshots gitignored

## Methodology Scaling
- **deep**: Full setup for all detected platforms. All visual testing patterns,
  baseline management, responsive verification, CI integration, sub-flows for
  common journeys, and comprehensive documentation updates.
- **mvp**: Basic config and smoke test for detected platform. Minimal docs
  updates. Two viewports for web, single platform for mobile.
- **custom:depth(1-5)**: Depth 1-2: config + smoke test. Depth 3: add patterns,
  naming, testID rules. Depth 4: add CI integration, both mobile platforms.
  Depth 5: full suite with baseline management and sub-flows.

## Conditional Evaluation
Enable when: tech-stack.md indicates a web frontend (Playwright) or mobile app
(Maestro). Detection signals: React/Vue/Angular/Svelte in tech-stack (web),
Expo/React Native (mobile), or explicit UI layer in architecture. Self-skips for
backend-only or library projects with no UI.

## Mode Detection
Check for existing E2E config: Playwright config file (playwright.config.ts or
.js) and/or maestro/ directory. If either exists, run in update mode for that
platform. Preserve baseline screenshots, custom viewports, existing flows,
and environment variables.
