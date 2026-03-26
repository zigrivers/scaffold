---
name: beads
description: Initialize Beads task tracking with CLAUDE.md conventions and lessons file
phase: "foundation"
order: 40
dependencies: []
outputs: [.beads/, tasks/lessons.md, CLAUDE.md]
conditional: "if-needed"
knowledge-base: []
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
- `bd ready` executes without error (Beads is initialized)
- .beads/ directory exists and contains Beads data files
- Beads git hooks are installed (data-sync hooks, not code-quality hooks)
- tasks/lessons.md exists with Patterns, Anti-Patterns, and Common Gotchas sections
- CLAUDE.md contains Core Principles with all four tenets (Simplicity, No Laziness, TDD, Prove It)
- CLAUDE.md contains Beads command reference table
- CLAUDE.md contains commit-message convention requiring Beads task IDs
- Bootstrap commit uses `[BD-0]` convention

## Methodology Scaling
- **deep**: Full Beads setup with all CLAUDE.md sections, detailed command reference
  table, priority level documentation, and cross-doc consistency checks against
  existing git-workflow.md and coding-standards.md.
- **mvp**: Initialize Beads, create tasks/lessons.md, add minimal CLAUDE.md
  sections (Core Principles + Beads commands). Skip cross-doc checks.
- **custom:depth(1-5)**: Depth 1-2: MVP Beads init + minimal CLAUDE.md. Depth 3:
  add full command table and priority docs. Depth 4-5: full setup with cross-doc
  consistency and detailed autonomous behavior rules.

## Mode Detection
Update mode if .beads/ directory exists. In update mode: never re-initialize
.beads/ (existing task data is irreplaceable), never overwrite tasks/lessons.md
(only add missing sections), update CLAUDE.md Beads sections in-place preserving
project-specific customizations.
