---
name: developer-onboarding-guide
description: Create a guide for developers (human or AI) joining the project
summary: "Synthesizes all frozen docs into a single onboarding narrative — project purpose, architecture overview, top coding patterns, key commands, and a quick-start checklist — so anyone joining the project knows exactly where to begin."
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
This is the "start here" document. It synthesizes information from all frozen
artifacts into a single coherent narrative that new contributors can read
before their first task.

## Inputs
- All frozen phase artifacts

## Expected Outputs
- docs/onboarding-guide.md — developer onboarding guide

## Quality Criteria
- (mvp) Contains sections for: project purpose, architecture overview (with component diagram reference), top 3 coding patterns with examples, and a file/doc lookup table
- (mvp) Guide includes: clone instructions, dependency install command, dev server start command, and test run command
- (deep) Every ADR referenced by number with one-sentence summary
- (deep) Key architectural decisions are summarized (with pointers to ADRs)
- (mvp) Development workflow section documents: branch creation command, commit message format, test command, and PR creation command
- (mvp) Guide explicitly states relationship to implementation-playbook: what the guide covers vs what the playbook covers

## Methodology Scaling
- **deep**: Comprehensive guide. Architecture walkthrough, key pattern explanations,
  common tasks with examples, troubleshooting section.
- **mvp**: Quick-start guide with: clone command, dependency install, dev server
  start, test run command. Skip architecture overview, key patterns, and
  troubleshooting sections.
- **custom:depth(1-5)**:
  - Depth 1: clone command and dependency install only.
  - Depth 2: quick start with setup, dev server start, and test run commands.
  - Depth 3: add architecture overview, key patterns, and common tasks.
  - Depth 4: add troubleshooting section, entry points documentation, and development workflow detail.
  - Depth 5: full guide with architecture walkthrough, decision rationale, and team-specific onboarding paths.

## Mode Detection
Check if `docs/onboarding-guide.md` already exists.
- If exists: UPDATE MODE — read current guide, diff against upstream docs for changes, propose targeted updates while preserving project-specific customizations and environment-specific instructions.
- If not: FRESH MODE — generate from scratch using all pipeline artifacts.

## Update Mode Specifics

- **Detect**: `docs/onboarding-guide.md` exists with tracking comment
- **Preserve**: Team-specific customizations, troubleshooting entries added from experience, getting-started verification results
- **Triggers**: Architecture changes, new tooling, new patterns established
- **Conflict resolution**: Merge new sections with existing customizations; never remove team-contributed troubleshooting entries
