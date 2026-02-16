---
description: "Initialize Beads task tracking in this project"
---
Set up **Beads** (https://github.com/steveyegge/beads) in this project for AI-friendly task tracking. Beads is already installed on the system (the `bd` CLI should be available).

## Mode Detection

Before starting, check if `.beads/` directory already exists:

**If `.beads/` does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If `.beads/` exists → UPDATE MODE**:
1. **Read & analyze**: Read `CLAUDE.md` completely. Check for Beads-related sections (Task Management, Core Principles, Self-Improvement, Autonomous Behavior). Check `tasks/lessons.md` for existing entries.
2. **Diff against current structure**: Compare the existing CLAUDE.md Beads sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing CLAUDE.md
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read `docs/git-workflow.md` and `docs/coding-standards.md` and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `.beads/` directory, `CLAUDE.md` Beads sections, `tasks/lessons.md`
- **Preserve**: All `tasks/lessons.md` entries, existing Beads task data, project-specific CLAUDE.md customizations
- **Related docs**: `docs/git-workflow.md`, `docs/coding-standards.md`
- **Special rules**: **Never re-initialize `.beads/`** — existing task data is irreplaceable. Never overwrite `tasks/lessons.md` — only add missing sections. Update CLAUDE.md Beads sections in-place.

## Why Beads

This project can use parallel Claude Code sessions. Beads provides:
- Persistent memory across sessions (git-backed)
- Dependency-aware task tracking (know what's blocked vs ready)
- Merge-safe IDs (no conflicts between agents)
- Fast queries (`bd ready` shows unblocked work)

## Setup Steps

1. **Initialize Beads** in the project root:
   ```bash
   bd init --quiet
   ```

2. **Install git hooks** for automatic sync:
   ```bash
   bd hooks install
   ```
   Note: These are Beads data-sync hooks only (not code quality hooks). They ensure task data is committed alongside code changes. This is separate from CI checks which handle linting and tests.

3. **Verify setup**:
   ```bash
   bd ready        # Should return empty (no tasks yet)
   ls .beads/      # Should show Beads data directory
   ```

4. **Create tasks/lessons.md** for capturing patterns and anti-patterns:
   ```bash
   mkdir -p tasks
   cat > tasks/lessons.md << 'EOF'
   # Lessons Learned

   Patterns and anti-patterns discovered during development. Review before starting new tasks.

   ## Patterns (Do This)

   <!-- Add patterns as you discover them -->

   ## Anti-Patterns (Avoid This)

   <!-- Add anti-patterns as you discover them -->

   ## Common Gotchas

   <!-- Add gotchas specific to this project -->
   EOF
   ```

5. **Create or update CLAUDE.md** with the sections below.

   If CLAUDE.md does not exist, create it first. This is the initial skeleton — subsequent setup prompts (Git Workflow, Dev Setup, Playwright/Maestro, etc.) will add their own sections:

   ```markdown
   # CLAUDE.md

   <!-- Core Principles and Task Management added by Beads Setup -->
   <!-- Git workflow, dev commands, and testing sections will be added by later setup prompts -->
   ```

   Then add the sections below to it.

6. **Commit the setup**:
   ```bash
   git add .beads/ tasks/lessons.md CLAUDE.md
   git commit -m "[BD-0] chore: initialize Beads task tracking"
   ```
   Note: `[BD-0]` is a bootstrap convention for setup commits made before any real tasks exist. The first real task created via `bd create` will receive an auto-generated ID.

## CLAUDE.md Sections to Add

### Core Principles

Add at the very top of CLAUDE.md:

```markdown
## Core Principles

- **Simplicity First**: Make every change as simple as possible. Minimal code, minimal impact. Don't over-engineer.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **TDD Always**: Write failing tests first, then make them pass, then refactor. No exceptions.
- **Prove It Works**: Never mark a task complete without demonstrating correctness — tests pass, logs clean, behavior verified.
```

### Task Management (Beads)

```markdown
## Task Management (Beads)

All task tracking lives in Beads — no separate todo files.

### Creating Tasks
```bash
bd create "Imperative, specific title" -p <0-3>
bd update <id> --claim                   # Always claim after creating
bd dep add <child> <parent>              # Child blocked by parent
```

Priority levels:
- 0 = blocking release
- 1 = must-have v1
- 2 = should-have
- 3 = nice-to-have

Good titles: `"Fix streak calculation for timezone edge case"`
Bad titles: `"Backend stuff"`

### Closing Tasks
```bash
bd close <id>                            # Marks complete — use this, not bd update --status completed
bd sync                                  # Force sync to git
```

### Beads Commands
| Command | Purpose |
|---------|---------|
| `bd ready` | Show unblocked tasks ready for work |
| `bd create "Title" -p N` | Create task with priority |
| `bd update <id> --status S` | Update status (in_progress, blocked, etc.) |
| `bd update <id> --claim` | Claim task (uses BD_ACTOR for attribution) |
| `bd close <id>` | Close completed task |
| `bd dep add <child> <parent>` | Add dependency |
| `bd dep tree <id>` | View dependency graph |
| `bd show <id>` | Full task details |
| `bd sync` | Force sync to git |
| `bd list` | List all tasks |
| `bd dep cycles` | Debug stuck/circular dependencies |

**NEVER** use `bd edit` — it opens an interactive editor and breaks AI agents.

### Every Commit Needs a Task

All commits require a Beads task ID in the message: `[BD-<id>] type(scope): description`

If you encounter a bug or need to make an ad-hoc fix:
```bash
bd create "fix: <description>" -p 1
bd update <id> --claim
# implement fix, then close when done
bd close <id>
```
This keeps Beads as the single source of truth for all changes.
```

### Self-Improvement

```markdown
## Self-Improvement

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake recurring
- Review `tasks/lessons.md` at session start before picking up work
```

### Autonomous Behavior

```markdown
## Autonomous Behavior

- **Fix bugs on sight**: When encountering bugs, errors, or failing tests — create a Beads task and fix them. Zero hand-holding required.
- **Use subagents**: Offload research, exploration, and parallel analysis to subagents. Keeps main context clean.
- **Keep working**: Continue until `bd ready` returns no available tasks.
- **Re-plan when stuck**: If implementation goes sideways, stop and rethink your approach rather than pushing through. (Do NOT enter interactive `/plan` mode — just think through the problem and adjust.)
```

## What This Prompt Does NOT Set Up

The following are handled by separate prompts that run later:
- **Git workflow** (branching, PRs, merge strategy) → Git Workflow prompt
- **Full development workflow** (session start → implementation → PR → task closure → next task) → CLAUDE.md Optimization + Workflow Audit prompts
- **Parallel agent worktrees** → Git Workflow prompt
- **CI/CD pipeline** → Git Workflow prompt
- **TDD standards** → TDD prompt
- **Coding standards** → Coding Standards prompt

This prompt establishes Beads as the task tracking system and adds the Beads reference to CLAUDE.md. The full workflow that ties Beads into git, PRs, and CI is composed by later prompts.

## After Setup

Tell me:
1. That Beads is initialized
2. What files were created in .beads/
3. That tasks/lessons.md was created
4. That CLAUDE.md has been updated with Beads sections
5. Any issues encountered

## After This Step

When this step is complete, tell the user:

---
**Phase 2 started** — Beads initialized, `tasks/lessons.md` created, `CLAUDE.md` updated.

**Next:** Run `/scaffold:tech-stack` — Research and document tech stack decisions.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
