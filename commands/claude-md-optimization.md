---
description: "Consolidate and optimize CLAUDE.md"
long-description: "Reorganizes and deduplicates CLAUDE.md to maximize signal density, ensuring all project conventions are clear and non-redundant for AI agents."
---

Review all project documentation and consolidate CLAUDE.md into the definitive, optimized reference for AI agents working on this project.

## Mode Detection

Before starting, check if `CLAUDE.md` contains a tracking comment `<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->`:

**If the tracking comment is NOT found → FRESH MODE**: Skip to the next section and consolidate from scratch.

**If the tracking comment IS found → UPDATE MODE**:
1. **Read & analyze**: Read the existing CLAUDE.md completely. Note the version date from the tracking comment.
2. **Identify changes since last optimization**: Check which setup prompts have appended new sections or modified existing content since the last optimization date.
3. **Preserve user customizations**: Identify manually-added sections, user-customized rules, and project-specific command aliases — do not restructure these.
4. **Propose targeted updates**: Present the user a summary of what will be consolidated, deduplicated, or restructured. Only consolidate sections that originated from setup prompts.
5. **Execute update**: Apply consolidation while preserving all user-authored content. If a user-customized section conflicts with a setup prompt's output, keep the user version and flag the conflict in a comment.
6. **Update tracking comment**: Update the date in `<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->`.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

## Beads Detection

Check if `.beads/` directory exists. This determines whether task management sections use Beads commands or conventional alternatives:
- **Beads project**: `.beads/` exists → include Beads command references, `bd` CLI workflows, `[BD-<id>]` commit prefixes, `BD_ACTOR` for parallel agents
- **Non-Beads project**: `.beads/` does not exist → use conventional commits (`type(scope): description`), standard branch naming (`feat/`, `fix/`), skip all `bd` command references

Apply this detection throughout all sections below. When this prompt says "If Beads:" or "Without Beads:", use the detected mode.

## Context

Throughout project setup, multiple prompts have added sections to CLAUDE.md:
- Core workflow and TDD process
- Task management (Beads, if configured)
- Git workflow procedures (branching, PRs, protected main)
- Parallel agent coordination (worktrees)
- Browser testing with Playwright or Maestro
- Project structure quick reference

These incremental additions may have created redundancy, inconsistency, or gaps. This prompt consolidates everything into a single, tight document.

**Ordering note:** This prompt should run BEFORE the Workflow Audit prompt. This prompt consolidates; the Workflow Audit verifies alignment with the canonical workflow.

## Rules Detection

Check if `.claude/rules/` directory exists. If it does:
- **Rules exist**: Read all `.md` files in `.claude/rules/`. These contain path-scoped conventions extracted from project docs. CLAUDE.md should use the **pointer pattern** — reference rules and docs instead of inlining their content.
- **No rules**: Proceed normally. Recommend running `/scaffold:ai-memory-setup` in the After This Step guidance if CLAUDE.md exceeds 200 lines.

When rules exist, actively move inline convention blocks from CLAUDE.md into rule files or replace them with pointers:
```markdown
## Coding Conventions
See `docs/coding-standards.md` for full reference. Path-scoped rules in `.claude/rules/`.
```

## Documents to Review

Read and cross-reference ALL of these:
- `CLAUDE.md` (current state)
- `.claude/rules/*.md` (if directory exists — modular rules for AI agents)
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
- Commands: Are task management commands (if any), git commands, and test commands shown consistently?
- Workflow steps: Does the session-start and session-end sequence appear once, clearly?
- **If Beads:** Branching pattern uses `git checkout -b bd-<id>/<desc> origin/main` consistently. Commit format uses `[BD-<id>] type(scope): description` consistently.
- **Without Beads:** Branching pattern uses `git checkout -b <type>/<desc> origin/main` (e.g., `feat/add-auth`, `fix/login-bug`). Commit format uses conventional commits: `type(scope): description`.

### 3. Gap Audit
- Is every doc referenced appropriately? (Agent should know when to consult each)
- Are there workflow scenarios not covered? (What if tests fail? What if there's a merge conflict? What if push to main is rejected? What if an agent session crashes mid-task?)
- Are the most common agent mistakes addressed with explicit rules?
- Is the parallel agent workflow clear? (Permanent worktrees with workspace branches, agents cannot checkout main, always branch from origin/main)
- Is the PR workflow explicit and complete? (Rebase, push, create PR, auto-merge with --delete-branch, watch CI, confirm merge)
- Is branch cleanup documented with both variants? (Single agent: checkout main, delete branch, prune. Worktree: fetch, prune, clean.)
- **If Beads:** Is task closure clear? (`bd close`, `bd sync` after merge.) Is the continuous work loop clear? (Keep working until `bd ready` returns nothing.) Is it clear every commit requires a task ID? (`[BD-<id>]` prefix.)
- **Without Beads:** Is the continuous work loop clear? (Keep working on assigned tasks until done.)
- Does the Key Commands table include all project-specific commands? (lint, test, install, dev server — these must match what's in Makefile/package.json/pyproject.toml, and the workflow references this table instead of hardcoding commands)
- Does the planning guidance explicitly warn against Claude Code's interactive `/plan` mode? (Agents should think through their approach, NOT enter `/plan` which blocks autonomous execution)
- Does CLAUDE.md include anti-sycophancy guidance? (Agent should push back on approaches with clear problems rather than agreeing — state the downside, propose alternatives, accept override)
- Does CLAUDE.md include scope discipline? (Agent should flag when a task is growing beyond its original scope and suggest breaking it into phases)
- Are critical rules written in structured formats (numbered steps, tables, bold imperatives) rather than buried in prose paragraphs?

### 4. Priority Audit
- What are the most important things an agent must do correctly?
  - TDD (failing test first)
  - Never push to main (always PR with squash)
  - Keep working until no tasks remain
  - Verify before committing (tests pass, lint clean)
  - Use worktrees for parallel agents
  - **If Beads:** Every commit needs a Beads task ID (`[BD-<id>]` prefix)
- Are these prominent and unambiguous, or buried in prose?
- Could an agent skim CLAUDE.md in 30 seconds and get the critical points?

## CLAUDE.md Structure

After analysis, restructure CLAUDE.md to follow this format:

```markdown
# CLAUDE.md

## Core Principles
[3-5 non-negotiable rules - the things that matter most. Candidates: TDD always, never push to main, honesty over agreement (push back on flawed approaches rather than complying), scope discipline (flag scope creep, suggest phased approach)]

## Git Workflow (CRITICAL)
[Never commit to main, full PR workflow: rebase → push → create PR → auto-merge with --delete-branch → watch CI → confirm merge, key commands]

## Workflow

### Session Start
[Exact steps - review lessons file (if exists), check for available tasks, etc. **If Beads:** `bd ready` to find next task.]

### Plan Before Building
[Think through approach for non-trivial work. Write specs upfront. CRITICAL: Do NOT enter Claude Code's interactive `/plan` mode — it blocks autonomous execution. Just think through the problem internally.]

### Implementation Loop
[TDD cycle repeating per piece of functionality, verification using Key Commands lint+test, AI review subagent before push (checks diff against CLAUDE.md + coding-standards.md, fix P0/P1). Multiple commits per task are normal — they squash-merge. Rebase onto origin/main before push. One clear flow. **If Beads:** commits use `[BD-<id>] type(scope): description` format. **Without Beads:** commits use `type(scope): description` (conventional commits).]

### Task Closure and Next Task
[Confirm merge. Single agent: checkout main, delete branch, prune. Worktree agent: fetch, prune, clean, branch from origin/main (cannot checkout main). Keep working until no tasks remain. **If Beads:** `bd close <id>`, `bd sync` after merge.]

### Session End
[Exact steps - mandatory, in order]

## Parallel Sessions (Worktrees)
[For multiple simultaneous agents - permanent worktrees with workspace branches, agents cannot checkout main (it's checked out in main repo), always branch from origin/main, workspace cleanup between tasks, batch branch cleanup. **If Beads:** BD_ACTOR for agent attribution.]

## Quick Reference

### Project Structure
[Where things go - table or brief list, link to full doc]

### Key Commands
[Git, PR commands — these are universal. **If Beads:** include Beads commands (`bd ready`, `bd create`, `bd close`, etc.).]
[Lint, test, install, dev server commands — these are project-specific, populated by the Dev Setup prompt. The workflow references this table instead of hardcoding commands.]

### When to Consult Other Docs
[Progressive disclosure: this table is the primary mechanism for keeping CLAUDE.md lean. Instead of duplicating guide content, agents load situational context on-demand when they hit a matching scenario.]
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
| AI memory stack documentation | docs/ai-memory-setup.md |

## Rules

[**If `.claude/rules/` exists**: Reference the rules directory here — "Path-scoped rules in `.claude/rules/` activate automatically per file type. See `docs/ai-memory-setup.md` for details." Do NOT inline rule content.]

### Git Rules
[Branch format, commit format, forbidden actions like push to main, --force-with-lease only. **If Beads:** commit format uses `[BD-<id>]` prefix and branch format uses `bd-<id>/`. **Without Beads:** conventional commits and `<type>/` branch prefixes.]

### Code Rules
[AI-Specific pitfalls to avoid - consolidated from all docs]

### Coordination
[High-conflict files and how to handle them]

### Error Recovery
[What to do when things go wrong - test failures, merge conflicts, blocked tasks, CI failures, crashed agent sessions, orphaned worktree work]

## Browser/E2E Testing
[Playwright MCP or Maestro usage - keep brief, patterns only]

## Self-Improvement
[Lessons file location, when to update it, periodic CLAUDE.md health check: regularly ask "Is every instruction still earning its place in always-loaded context?" and move stale or situational rules to docs/]

## Autonomous Behavior
[Fix bugs on sight, keep working until no tasks, use subagents]
[**If Beads:** Every fix/enhancement needs a Beads task — commit messages require task ID]
```

## Optimization Principles

### Every Instruction Must Earn Its Place
CLAUDE.md is loaded into context on every interaction — every line costs tokens and attention. Apply the "earn its place" test: if an instruction doesn't directly change agent behavior on most tasks, move it to a situational doc and reference it instead. If something is in another doc, reference it — don't repeat it.

**If `.claude/rules/` exists**: Convention-specific rules (naming, formatting, imports, test patterns) belong in path-scoped rule files, NOT in CLAUDE.md. Rule files activate automatically when the agent works on matching files. Move any inline convention blocks to the appropriate rule file and replace with a pointer. Target: CLAUDE.md under 200 lines total.

### Scannability
- Use tables for lookups
- Use numbered steps for sequences
- Use bullet points sparingly and only for truly parallel items
- Bold the most critical words in any rule

### Structured Formats for Critical Rules
For rules agents MUST follow without exception, use structured formats — numbered steps, tables, or bold imperatives — over plain prose paragraphs. Agents process structured content more reliably than narrative text. Reserve prose for context and rationale.

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
3. **AI review before push** — spawn review subagent to check diff against CLAUDE.md + docs/coding-standards.md, fix P0/P1 findings, re-run lint+test, log recurring patterns to tasks/lessons.md (if it exists)
4. **Branch cleanup** — two variants: single agent (checkout main, delete branch, prune) and worktree agent (fetch, prune, clean — cannot checkout main)
5. **Continuous work loop** — clean workspace between tasks, keep working until no tasks remain
6. **Parallel agent setup** — permanent worktrees with workspace branches, agents always branch from `origin/main`, never `git checkout main`
7. **TDD always** — failing test before implementation, loop repeats per piece of functionality, multiple commits per task squash-merge
8. **Error recovery** — test failures, merge conflicts, CI failures, crashed sessions, orphaned worktree work
9. **Honesty over agreement** — if an approach has clear problems, say so directly, explain the downside, propose an alternative, and accept override. Never comply with a flawed approach just to avoid friction
10. **Scope discipline** — flag when a task is growing beyond its original scope, suggest breaking it into phases, and get explicit confirmation before expanding

**If Beads, also verify:**
11. **Task closure** — `bd close <id>` and `bd sync` after merge (both single-agent and worktree variants)
12. **Every commit needs a Beads task** — commit messages require `[BD-<id>]` format
13. **BD_ACTOR** — set in parallel agent worktrees for attribution

## After This Step

When this step is complete, tell the user:

---
**Phase 6 in progress** — `CLAUDE.md` consolidated and optimized.

**Next:** Run `/scaffold:workflow-audit` — Verify workflow consistency across all docs.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
