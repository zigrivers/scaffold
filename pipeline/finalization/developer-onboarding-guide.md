---
name: developer-onboarding-guide
description: Create a guide for developers (human or AI) joining the project
phase: "finalization"
order: 1420
dependencies: [apply-fixes-and-freeze]
outputs: [docs/onboarding-guide.md]
conditional: null
knowledge-base: [developer-onboarding]
---

## Purpose
Create a comprehensive onboarding guide that gives any developer (human or AI
agent) everything they need to understand the project and start contributing.
This is the "start here" document.

## Inputs
- All frozen phase artifacts

## Expected Outputs
- docs/onboarding-guide.md — developer onboarding guide

## Quality Criteria
- Covers: project purpose, architecture overview, key patterns, where to find what
- A new developer can set up and run the project following this guide
- Key architectural decisions are summarized (with pointers to ADRs)
- Development workflow is clear (branch, code, test, PR)

## Methodology Scaling
- **deep**: Comprehensive guide. Architecture walkthrough, key pattern explanations,
  common tasks with examples, troubleshooting section.
- **mvp**: Quick start. Setup instructions, key files, how to run tests.
- **custom:depth(1-5)**: Scale detail with depth.

## Mode Detection
Update mode if guide exists.
