---
name: add-e2e-testing
description: Configure end-to-end testing (Playwright for web, Maestro for mobile) based on detected project platform
summary: "Detects whether your project is web or mobile, then configures Playwright (web) or Maestro (mobile) with a working smoke test, baseline screenshots, and guidance on when to use E2E vs. unit tests."
phase: "integration"
order: 410
dependencies: [git-workflow, tdd]
outputs: [tests/screenshots/, maestro/]
reads: [coding-standards, user-stories]
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
- (mvp) Platform detection is explicit and logged (web, mobile, both, or skip)
- (mvp) (web) Playwright config uses framework-specific dev server command and port
- (mvp) (web) Smoke test passes (navigate, screenshot, close)
- (mvp) (mobile) Maestro CLI installed, sample flow executes, screenshot captured
- (mobile) testID naming convention defined and documented
- (mvp) E2E section in tdd-standards.md distinguishes when to use E2E vs unit tests
- (mvp) Baseline screenshots committed, current screenshots gitignored
- (mvp) CLAUDE.md contains browser/mobile testing section
- (mvp) tdd-standards.md E2E section updated with when-to-use guidance
- (deep) CI integration configured for E2E test execution
- (deep) Sub-flows defined for common user journeys
- (deep) Smoke test names and intent are consistent between Playwright and Maestro

## Methodology Scaling
- **deep**: Full setup for all detected platforms. All visual testing patterns,
  baseline management, responsive verification, CI integration, sub-flows for
  common journeys, and comprehensive documentation updates.
- **mvp**: Basic config and smoke test for detected platform. Minimal docs
  updates. Two viewports for web, single platform for mobile.
- **custom:depth(1-5)**:
  - Depth 1: Config + smoke test for primary platform only
  - Depth 2: Config + smoke test with basic viewport/device coverage
  - Depth 3: Add patterns, naming conventions, and testID rules
  - Depth 4: Add CI integration and both mobile platforms
  - Depth 5: Full suite with baseline management, sub-flows, and cross-platform consistency

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

## Update Mode Specifics
- **Detect prior artifact**: playwright.config.ts/.js exists and/or maestro/
  directory exists with flow files
- **Preserve**: baseline screenshots, custom viewports, existing test flows,
  environment variables, testID naming conventions
- **Triggers for update**: new user stories with UI interactions added,
  platform targets changed in tech-stack.md, tdd-standards.md E2E section updated
- **Conflict resolution**: preserve existing baselines, add new flows alongside
  existing ones rather than replacing
