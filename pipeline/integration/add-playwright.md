---
name: add-playwright
description: Configure Playwright MCP for browser automation and visual testing
phase: "integration"
order: 60
dependencies: [git-workflow]
outputs: [docs/tdd-standards.md, tests/screenshots/]
conditional: "if-needed"
knowledge-base: [testing-strategy]
---

## Purpose
Configure Playwright MCP for browser automation and visual testing of web
frontend features. Establish screenshot organization, visual testing patterns
(page load, user flow, responsive, error state), and integrate browser testing
into the existing TDD workflow. Updates CLAUDE.md with browser testing procedures
and fills in the E2E placeholder in tdd-standards.md.

## Inputs
- docs/tech-stack.md (required) — frontend framework and rendering approach
- docs/tdd-standards.md (required) — E2E placeholder section to fill
- CLAUDE.md (required) — browser testing section to add
- docs/user-stories.md (optional) — key user flows for visual verification

## Expected Outputs
- Playwright configuration file (playwright.config.ts or .js)
- tests/screenshots/baseline/ directory for known-good reference screenshots
- tests/screenshots/current/ directory for test run screenshots (gitignored)
- docs/tdd-standards.md updated with E2E / Visual Testing (Playwright) section
- CLAUDE.md updated with Browser Testing with Playwright MCP section
- .claude/settings.local.json with Playwright MCP tool permissions as fallback

## Quality Criteria
- Base URL configuration points to local dev server
- Default viewport sizes defined (desktop 1280px, mobile 375px minimum)
- Screenshot naming convention follows {story-id}_{feature}_{viewport}_{state}.png
- Smoke test passes (navigate to app, take screenshot, close browser)
- E2E section in tdd-standards.md distinguishes when to use Playwright vs. unit tests
- Baseline screenshots committed, current screenshots gitignored
- Playwright MCP tools run without prompting (bare server-name entry in permissions)

## Methodology Scaling
- **deep**: Full Playwright setup with all visual testing patterns, baseline
  management strategy, responsive verification at 3+ viewports, CI integration
  for visual regression, and comprehensive tdd-standards.md E2E section.
- **mvp**: Basic config, screenshot directories, smoke test verification, minimal
  CLAUDE.md and tdd-standards.md updates. Two viewports (desktop, mobile).
- **custom:depth(1-5)**: Depth 1-2: config + smoke test. Depth 3: add screenshot
  patterns and naming. Depth 4: add tdd-standards integration. Depth 5: full
  suite with baseline management and CI.

## Mode Detection
Update mode if Playwright config file exists (playwright.config.ts or .js).
In update mode: never delete baseline screenshots, preserve custom viewport
configurations, update tdd-standards.md E2E section in-place rather than
appending duplicates.
