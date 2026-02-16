---
description: "Consolidate and optimize CLAUDE.md"
---

Review all project documentation and consolidate CLAUDE.md into the definitive, optimized reference for AI agents working on this project.

## Context

Throughout project setup, multiple prompts have added sections to CLAUDE.md:
- Core workflow and TDD process
- Beads task management
- Git workflow procedures (branching, PRs, protected main)
- Parallel agent coordination (worktrees, BD_ACTOR)
- Browser testing with Playwright or Maestro
- Project structure quick reference

These incremental additions may have created redundancy, inconsistency, or gaps. This prompt consolidates everything into a single, tight document.

**Ordering note:** This prompt should run BEFORE the Workflow Audit prompt. This prompt consolidates; the Workflow Audit verifies alignment with the canonical workflow.

## Documents to Review

Read and cross-reference ALL of these:
- `CLAUDE.md` (current state)
- `docs/plan.md` (PRD)
- `docs/tech-stack.md`
- `docs/coding-standards.md`
- `docs/tdd-standards.md`
- `docs/git-workflow.md`
- `docs/project-structure.md`
- `docs/user-stories.md`

## Analysis Phase

### 1. Redundancy Audit
- Identify instructions that appear in multiple places within CLAUDE.md
- Identify CLAUDE.md content that duplicates what's in other docs verbatim
- Principle: CLAUDE.md should reference other docs, not repeat them

### 2. Consistency Audit
- Terminology: Are we consistent? (task vs. ticket, feature vs. story, etc.)
- Commands: Are Beads commands, git commands, and test commands shown consistently?
- Workflow steps: Does the session-start and session-end sequence appear once, clearly?
- Branching pattern: Use `git checkout -b bd-<id>/<desc> origin/main` consistently (branch from origin/main, not checkout-pull-branch)
- Commit format: Use `[BD-<id>] type(scope): description` consistently (task ID prefix in brackets)

### 3. Gap Audit
- Is every doc referenced appropriately? (Agent should know when to consult each)
- Are there workflow scenarios not covered? (What if tests fail? What if there's a merge conflict? What if `bd ready` returns nothing? What if push to main is rejected? What if an agent session crashes mid-task?)
- Are the most common agent mistakes addressed with explicit rules?
- Is the parallel agent workflow clear? (Permanent worktrees with workspace branches, BD_ACTOR, agents cannot checkout main, always branch from origin/main)
- Is the PR workflow explicit and complete? (Rebase, push, create PR, auto-merge with --delete-branch, watch CI, confirm merge)
- Is task closure documented with both variants? (Single agent: checkout main, delete branch, prune. Worktree: fetch, prune, clean. Both: `bd close`, `bd sync`)
- Is the continuous work loop clear? (Keep working until `bd ready` returns nothing)
- Is it clear that every commit requires a Beads task? (All fixes and enhancements need a task for the commit message)
- Does the Key Commands table include all project-specific commands? (lint, test, install, dev server — these must match what's in Makefile/package.json/pyproject.toml, and the workflow references this table instead of hardcoding commands)
- Does the planning guidance explicitly warn against Claude Code's interactive `/plan` mode? (Agents should think through their approach, NOT enter `/plan` which blocks autonomous execution)

### 4. Priority Audit
- What are the 6 most important things an agent must do correctly?
  - TDD (failing test first)
  - Never push to main (always PR with squash)
  - Keep working until no tasks remain
  - Verify before committing (tests pass, lint clean)
  - Use worktrees for parallel agents
  - Every commit needs a Beads task (for commit message ID)
- Are these prominent and unambiguous, or buried in prose?
- Could an agent skim CLAUDE.md in 30 seconds and get the critical points?

## CLAUDE.md Structure

After analysis, restructure CLAUDE.md to follow this format:

```markdown
# CLAUDE.md

## Core Principles
[3-5 non-negotiable rules - the things that matter most]

## Git Workflow (CRITICAL)
[Never commit to main, full PR workflow: rebase → push → create PR → auto-merge with --delete-branch → watch CI → confirm merge, key commands]

## Workflow

### Session Start
[Exact steps - Beads, lessons review, etc.]

### Plan Before Building
[Think through approach for non-trivial work. Write specs upfront. CRITICAL: Do NOT enter Claude Code's interactive `/plan` mode — it blocks autonomous execution. Just think through the problem internally.]

### Implementation Loop
[TDD cycle repeating per piece of functionality, verification using Key Commands lint+test, commits with [BD-<id>] format. Multiple commits per task are normal — they squash-merge. Self-review before push (claude -p subagent checks against docs/review-standards.md for P0/P1/P2). Rebase onto origin/main before push. One clear flow.]

### Task Closure and Next Task
[Confirm merge, bd close, bd sync. Single agent: checkout main, delete branch, prune. Worktree agent: fetch, prune, clean, branch from origin/main (cannot checkout main). Keep working until no tasks remain]

### Session End
[Exact steps - mandatory, in order]

## Parallel Sessions (Worktrees)
[For multiple simultaneous agents - permanent worktrees with workspace branches, BD_ACTOR, agents cannot checkout main (it's checked out in main repo), always branch from origin/main, workspace cleanup between tasks, batch branch cleanup]

## Quick Reference

### Project Structure
[Where things go - table or brief list, link to full doc]

### Key Commands
[Beads, git, PR commands — these are universal]
[Lint, test, install, dev server commands — these are project-specific, populated by the Dev Setup prompt. The workflow references this table instead of hardcoding commands.]

### When to Consult Other Docs
| Situation | Document |
|-----------|----------|
| Need to understand a feature | docs/user-stories.md |
| Architecture decision questions | docs/tech-stack.md |
| Code style question | docs/coding-standards.md |
| Testing approach question | docs/tdd-standards.md |
| Git/branching question | docs/git-workflow.md |
| Where to put a file | docs/project-structure.md |
| Running multiple agents in parallel | docs/git-workflow.md |
| Review criteria / severity definitions | docs/review-standards.md |
| Codex Cloud review instructions | AGENTS.md |

## Rules

### Git Rules
[Branch format, commit format with [BD-<id>] prefix, forbidden actions like push to main, --force-with-lease only]

### Code Rules
[AI-Specific pitfalls to avoid - consolidated from all docs]

### Coordination
[High-conflict files and how to handle them]

### Error Recovery
[What to do when things go wrong - test failures, merge conflicts, blocked tasks, CI failures, crashed agent sessions, orphaned worktree work]

## Browser/E2E Testing
[Playwright MCP or Maestro usage - keep brief, patterns only]

## Self-Improvement
[Lessons file location, when to update it]

## Autonomous Behavior
[Fix bugs on sight, keep working until no tasks, use subagents]
[Every fix/enhancement needs a Beads task — commit messages require task ID]
```

## Optimization Principles

### Brevity Over Completeness
CLAUDE.md is read at the start of every task. Every unnecessary sentence costs attention. If something is in another doc and can be referenced, reference it — don't repeat it.

### Scannability
- Use tables for lookups
- Use numbered steps for sequences
- Use bullet points sparingly and only for truly parallel items
- Bold the most critical words in any rule

### Front-Load the Important Stuff
The first thing an agent reads should be the most important. Core principles and session-start workflow should be at the top, not buried after background context.

### Actionable Over Aspirational
Every sentence should either be:
- A specific action to take
- A specific thing to avoid
- A pointer to where to find more detail

Remove any "philosophy" or "background" that doesn't directly change agent behavior.

### Key Commands Is Source of Truth
The Key Commands table in Quick Reference is the single source of truth for project-specific commands (lint, test, install, dev server). The canonical workflow, git workflow, CI pipeline, and worktree cleanup all reference this table instead of hardcoding commands. Do NOT remove, rename, or split this table. Ensure all project commands are present and match the actual Makefile/package.json/pyproject.toml.

## What to Deliver

1. **Analysis summary**: Brief list of redundancies, inconsistencies, and gaps found
2. **Optimized CLAUDE.md**: The restructured, consolidated document
3. **Changelog**: What was removed, what was added, what was reorganized
4. **Verification checklist**: Confirm the critical patterns are explicit and prominent

## Process

- Do NOT use AskUserQuestionTool unless you find a genuine conflict between docs that requires a decision
- Do NOT add new workflow steps or rules — only consolidate and clarify what already exists
- Do NOT remove anything that was intentionally added by previous prompts — consolidate it
- After rewriting, read CLAUDE.md fresh and verify an agent could follow it without consulting other docs for the basic workflow
- Add a tracking comment as the last line of `CLAUDE.md`: `<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->` (use actual date)

### Critical Patterns to Verify Are Present

Before finalizing, verify CLAUDE.md explicitly covers:

1. **Never push to main** — main is protected, all changes via PR
2. **PR workflow** — rebase onto origin/main, then `gh pr create`, then `gh pr merge --squash --auto --delete-branch`, then `gh pr checks --watch --fail-fast`, then `gh pr view --json state -q .state` must show "MERGED"
3. **Self-review before push** — `claude -p` subagent checks against `docs/review-standards.md` for P0/P1/P2 issues, fixes them, runs lint+test
4. **Task closure** — two variants: single agent (checkout main, delete branch, prune) and worktree agent (fetch, prune, clean — cannot checkout main). Both use `bd close`, `bd sync`
5. **Continuous work loop** — clean workspace between tasks, keep working until `bd ready` returns nothing
6. **Parallel agent setup** — permanent worktrees with workspace branches, BD_ACTOR, agents always branch from `origin/main`, never `git checkout main`
7. **TDD always** — failing test before implementation, loop repeats per piece of functionality, multiple commits per task squash-merge
8. **Every commit needs a Beads task** — commit messages require `[BD-<id>]` format
9. **Error recovery** — test failures, merge conflicts, CI failures, crashed sessions, orphaned worktree work

## After This Step

When this step is complete, tell the user:

---
**Phase 6 in progress** — `CLAUDE.md` consolidated and optimized.

**Next:** Run `/scaffold:workflow-audit` — Verify workflow consistency across all docs.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
