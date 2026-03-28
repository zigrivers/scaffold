---
name: claude-md-optimization
description: Consolidate and optimize CLAUDE.md for maximum signal density
phase: "consolidation"
order: 1110
dependencies: [git-workflow]
outputs: [CLAUDE.md]
reads: [create-prd, tdd]
conditional: null
knowledge-base: [claude-md-patterns]
---

## Purpose
Review all project documentation and consolidate CLAUDE.md into the definitive,
optimized reference for AI agents. Eliminate redundancy from incremental additions
by multiple setup prompts, fix inconsistencies in terminology and commands, fill
gaps in workflow coverage, and front-load the most critical information for agent
scannability.

## Inputs
- CLAUDE.md (required) — current state with incremental additions
- docs/plan.md (required) — PRD for context
- docs/tech-stack.md (required) — technology choices
- docs/coding-standards.md (required) — code conventions
- docs/tdd-standards.md (required) — testing approach
- docs/git-workflow.md (required) — branching and PR workflow
- docs/project-structure.md (required) — file placement rules
- docs/user-stories.md (optional) — feature context

## Expected Outputs
- CLAUDE.md — restructured and consolidated with Core Principles, Git Workflow,
  Workflow (session start through next task), Parallel Sessions, Quick Reference
  (structure, Key Commands, doc lookup), Rules (git, code, coordination, error
  recovery), Browser/E2E Testing, Self-Improvement, Autonomous Behavior

## Quality Criteria
- No duplicated instructions within CLAUDE.md
- No verbatim repetition of content from other docs (reference instead)
- Consistent terminology throughout (task vs. ticket, etc.)
- Key Commands table matches actual Makefile/package.json commands
- Critical patterns are prominent (TDD, never push to main, keep working,
  verify before commit, worktrees for parallel). If Beads: every commit needs task ID.
- CLAUDE.md is <= 200 lines or critical patterns appear in the first 50 lines
- Workflow scenarios cover error cases (test failures, merge conflicts, CI failures,
  crashed sessions, blocked tasks)
- Tracking comment added: <!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->

## Methodology Scaling
- **deep**: Full four-phase analysis (redundancy, consistency, gap, priority audits)
  with detailed changelog. Comprehensive error recovery section. All nine critical
  patterns verified present and prominent.
- **mvp**: Quick pass to remove obvious duplicates and ensure workflow section is
  complete. Fix any command inconsistencies. Skip detailed audit.
- **custom:depth(1-5)**: Depth 1-2: dedup + workflow check. Depth 3: add
  consistency pass. Depth 4: add gap analysis. Depth 5: full four-phase audit.

## Mode Detection
Always operates in update mode (CLAUDE.md always exists by this point). Check
for tracking comment `<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->`
to detect prior optimization. If present, compare current CLAUDE.md against
the prior version date to identify sections added or changed since last
optimization. Preserve manually-added sections (user customizations not from
setup prompts). Only consolidate sections that originated from setup prompts —
do not restructure user-authored content. Do not add new workflow steps or
rules — only consolidate and clarify what already exists.

## Update Mode Specifics
- **Detect prior artifact**: tracking comment in CLAUDE.md with version and date
- **Preserve**: manually-added sections, user-customized rules, project-specific
  command aliases, any content not traceable to a pipeline setup prompt
- **Triggers for update**: new setup prompts completed, coding-standards updated,
  tdd-standards updated, git-workflow updated, terminology inconsistencies
  introduced by incremental additions
- **Conflict resolution**: if a user-customized section conflicts with a setup
  prompt's output, keep the user version and flag the conflict in a comment
