---
name: add-maestro
description: Configure Maestro for mobile app UI testing with flow definitions
phase: "integration"
order: 61
dependencies: [git-workflow]
outputs: [maestro/, docs/tdd-standards.md]
conditional: "if-needed"
knowledge-base: [testing-strategy]
---

## Purpose
Install and configure Maestro for mobile UI testing in Expo/React Native projects.
Set up YAML flow definitions, reusable sub-flows, screenshot organization, testID
conventions, and integrate mobile E2E testing into the existing TDD workflow.
Updates CLAUDE.md with mobile testing procedures and coding-standards.md with
testID requirements.

## Inputs
- docs/tech-stack.md (required) — Expo/React Native configuration
- docs/tdd-standards.md (required) — E2E section to extend with mobile testing
- docs/coding-standards.md (required) — testID conventions to add
- CLAUDE.md (required) — mobile testing section to add

## Expected Outputs
- maestro/config.yaml — app configuration and environment variables
- maestro/flows/ — test flow files organized by feature
- maestro/shared/ — reusable sub-flows (login, logout, etc.)
- maestro/screenshots/baseline/ — known-good reference screenshots
- maestro/screenshots/current/ — test run screenshots (gitignored)
- package.json updated with test:e2e, test:e2e:ios, test:e2e:android scripts
- docs/tdd-standards.md updated with mobile E2E testing section
- docs/coding-standards.md updated with testID naming conventions
- CLAUDE.md updated with Mobile Testing with Maestro section

## Quality Criteria
- Maestro CLI installed and accessible
- Development build created and running on simulator (not Expo Go)
- Sample verification flow executes successfully
- Screenshot captured to correct directory
- testID props accessible in the app
- testID naming convention defined ({feature}-{element}-{descriptor})
- All interactive elements require testID prop (documented in coding standards)
- Flow patterns cover screen verification, user flow, error state, and sub-flows
- Both iOS and Android testing documented

## Methodology Scaling
- **deep**: Full Maestro setup with all flow patterns, sub-flows for common
  journeys, both platform testing, CI integration, baseline management, and
  comprehensive documentation updates.
- **mvp**: Basic config, verification flow, testID conventions. Single platform
  (iOS or Android). Minimal documentation updates.
- **custom:depth(1-5)**: Depth 1-2: config + verification. Depth 3: add flow
  patterns and testID rules. Depth 4: add both platforms. Depth 5: full suite
  with sub-flows and CI.

## Mode Detection
Update mode if maestro/ directory exists. In update mode: never delete existing
flow files or sub-flows, never delete baseline screenshots, preserve custom
environment variables in maestro/config.yaml, update tdd-standards.md E2E
section in-place.
