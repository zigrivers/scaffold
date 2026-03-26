---
name: claude-md-optimization
description: Consolidate and optimize CLAUDE.md for maximum signal density
phase: "consolidation"
order: 70
dependencies: [git-workflow]
outputs: [CLAUDE.md]
conditional: null
knowledge-base: []
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
  verify before commit, worktrees for parallel, every commit needs task ID)
- An agent can skim CLAUDE.md in 30 seconds and get the critical points
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
Always operates in update mode (CLAUDE.md always exists by this point).
Consolidate and restructure existing content. Do not add new workflow steps or
rules — only consolidate and clarify what already exists.
