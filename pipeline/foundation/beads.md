---
name: beads
description: Initialize Beads task tracking with CLAUDE.md conventions and lessons file
summary: "Sets up Beads task tracking with a lessons-learned file for cross-session learning, and creates the initial CLAUDE.md skeleton with core principles and workflow conventions."
phase: "foundation"
order: 210
dependencies: []
outputs: [.beads/, tasks/lessons.md, CLAUDE.md]
conditional: "if-needed"
knowledge-base: [task-tracking]
---

## Purpose
Initialize the Beads issue tracker for AI-friendly task tracking, create the
lessons-learned file for cross-session memory, and establish the initial CLAUDE.md
skeleton with core principles, task management commands, self-improvement rules,
and autonomous behavior guidelines.

## Inputs
- Project root directory (required) — must be a git repository
- Existing CLAUDE.md (optional) — if present, operates in update mode

## Expected Outputs
- .beads/ directory — initialized Beads data store with git hooks
- tasks/lessons.md — patterns and anti-patterns file for cross-session learning
- CLAUDE.md — initial skeleton with Core Principles, Task Management (Beads),
  Self-Improvement, and Autonomous Behavior sections

## Quality Criteria
- (mvp) `bd ready` executes without error (Beads is initialized)
- (mvp) .beads/ directory exists and contains Beads data files
- (mvp) Beads git hooks are installed (data-sync hooks, not code-quality hooks)
- (mvp) tasks/lessons.md exists with Patterns, Anti-Patterns, and Common Gotchas sections
- (mvp) CLAUDE.md contains Core Principles with all four tenets (Simplicity, No Laziness, TDD, Prove It)
- (mvp) CLAUDE.md contains Beads command reference table
- CLAUDE.md contains commit-message convention requiring Beads task IDs
- Bootstrap commit uses `[BD-0]` convention
- (deep) Cross-doc consistency verified against git-workflow.md and coding-standards.md

## Methodology Scaling
- **deep**: Full Beads setup with all CLAUDE.md sections, detailed command reference
  table, priority level documentation, and cross-doc consistency checks against
  existing git-workflow.md and coding-standards.md.
- **mvp**: Initialize Beads, create tasks/lessons.md, add minimal CLAUDE.md
  sections (Core Principles + Beads commands). Skip cross-doc checks.
- **custom:depth(1-5)**:
  - Depth 1: Initialize Beads + create tasks/lessons.md. Minimal CLAUDE.md with Core Principles only.
  - Depth 2: Depth 1 + add Beads command reference table to CLAUDE.md.
  - Depth 3: Add full command table, priority level documentation, and autonomous behavior rules.
  - Depth 4: Full setup with cross-doc consistency checks against git-workflow.md and coding-standards.md.
  - Depth 5: Full setup + detailed autonomous behavior rules + commit-message convention enforcement.

## Conditional Evaluation
Enable when: project uses Beads task tracking methodology (user selects Beads during
setup), or user explicitly enables structured task management. Skip when: user prefers
GitHub Issues, Linear, or another task tracker, or explicitly declines Beads setup.

## Mode Detection
Update mode if .beads/ contains a config.json or tasks directory (not just an
empty directory). In update mode: never re-initialize
.beads/ (existing task data is irreplaceable), never overwrite tasks/lessons.md
(only add missing sections), update CLAUDE.md Beads sections in-place preserving
project-specific customizations.

## Update Mode Specifics
- **Detect prior artifact**: .beads/ directory exists with data files
- **Preserve**: all existing task data in .beads/, tasks/lessons.md content
  (patterns, anti-patterns, gotchas), CLAUDE.md Beads command table
  customizations, git hook configurations
- **Triggers for update**: new CLAUDE.md sections need Beads references,
  Beads CLI version changed requiring command updates, git hooks need
  reconfiguration after workflow changes
- **Conflict resolution**: if CLAUDE.md Beads section was manually customized,
  merge new content around existing customizations rather than replacing
