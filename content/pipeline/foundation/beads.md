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
- .beads/ directory — initialized Beads data store with git hooks (installed/repaired via `bd doctor --fix`)
- tasks/lessons.md — patterns and anti-patterns file for cross-session learning
- CLAUDE.md — marker-managed Beads integration block installed via `bd setup claude`
  (the recipe owns the section between `<!-- BEGIN BEADS INTEGRATION ... -->` and
  `<!-- END BEADS INTEGRATION -->`; survives re-runs). The recipe wires `bd prime
  --hook-json` into SessionStart/PreCompact hooks so agent context is loaded
  automatically. Scaffold adds its own Core Principles + commit convention sections
  AROUND that block but does NOT hand-roll the Beads command reference — `bd prime`
  is the single source of truth for agent context.

## Quality Criteria
- (mvp) `bd ready` executes without error (Beads is initialized)
- (mvp) .beads/ directory exists and contains Beads data files
- (mvp) Beads git hooks are installed; `bd doctor --fix` was run after `bd init` to
  ensure hooks/config are current (idempotent — also the canonical recovery path if
  `bd` is upgraded later)
- (mvp) tasks/lessons.md exists with Patterns, Anti-Patterns, and Common Gotchas sections
- (mvp) `bd setup claude` was run after `bd init` to install the upstream-managed
  Beads integration block in CLAUDE.md (marker-wrapped, hook-driven). For projects
  also targeting Codex CLI or Gemini CLI: `bd setup codex` and/or `bd setup gemini`
  were run. Verify with `bd setup claude --check`.
- (mvp) CLAUDE.md contains Core Principles with all four tenets (Simplicity, No Laziness, TDD, Prove It) — scaffold-owned content, ADJACENT to the Beads-managed block
- (mvp) CLAUDE.md contains commit-message convention requiring Beads task IDs — scaffold-owned content
- (mvp) CLAUDE.md contains an upgrade-remediation callout: "If `bd` was upgraded since
  last `bd init`, run `bd doctor --fix` to re-sync git hooks and project config. This
  fixes errors like `unknown command \"hook\" for \"bd\"` from stale post-checkout /
  post-merge hook shims."
- (mvp) Bootstrap commit uses `[bd-<id>]` convention (lowercase hash-style IDs per Beads v1.0.0+)
- (mvp) Auto-export to `.beads/issues.jsonl` is explicitly enabled after `bd init`:
  `bd config set export.auto true && bd config set export.git-add true`. As of
  Beads v1.0.4-Unreleased this is opt-in (previously default); explicit enable means
  release/version-bump tooling can rely on `.beads/issues.jsonl` being current.
- (mvp) Agents pick up Beads workflow context via `bd prime` (loaded automatically by
  the hooks `bd setup claude` installs). Scaffold does NOT hand-roll a Beads command
  reference table — that lives upstream in `bd prime` output. If a project wants
  custom prime content, write `.beads/PRIME.md`.
- (deep) Cross-doc consistency verified against git-workflow.md and coding-standards.md

## Methodology Scaling
- **deep**: Full Beads setup — `bd init`, then `bd doctor --fix`, then `bd setup
  claude` (and/or `bd setup codex`, `bd setup gemini` for multi-platform projects).
  Scaffold-owned CLAUDE.md content (Core Principles + commit convention +
  upgrade-remediation callout) is composed ADJACENT to the recipe-managed integration
  block. Detailed priority level documentation. Cross-doc consistency checks against
  existing git-workflow.md and coding-standards.md.
- **mvp**: `bd init`, `bd doctor --fix`, `bd setup claude`, create tasks/lessons.md,
  add minimal scaffold-owned CLAUDE.md sections (Core Principles + commit convention +
  upgrade-remediation callout). Skip cross-doc checks.
- **custom:depth(1-5)**:
  - Depth 1: `bd init` + `bd doctor --fix` + `bd setup claude` + create tasks/lessons.md. Minimal scaffold CLAUDE.md content (Core Principles only).
  - Depth 2: Depth 1 + add commit convention + upgrade-remediation callout.
  - Depth 3: Add priority level documentation and autonomous behavior rules.
  - Depth 4: Full setup with cross-doc consistency checks against git-workflow.md and coding-standards.md.
  - Depth 5: Full setup + detailed autonomous behavior rules + commit-message convention enforcement. Run `bd setup codex` and `bd setup gemini` if the project targets those CLIs.

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
