---
name: task-tracking
description: Task tracking patterns including Beads methodology, task hierarchies, progress tracking, and lessons-learned workflows
topics: [task-management, beads, progress-tracking, lessons-learned, autonomous-work]
---

# Task Tracking

Structured task tracking for AI agents ensures work continuity across sessions, prevents drift, and builds institutional memory. This knowledge covers the Beads methodology, task hierarchies, progress conventions, and the lessons-learned workflow that turns mistakes into permanent improvements.

## Summary

### Beads Methodology Overview

Beads is an AI-friendly issue tracker designed for single-developer and AI-agent workflows. Unlike heavyweight project management tools (Jira, Linear), Beads stores task data in the repository itself, making it accessible to AI agents without external API integration.

Core properties:
- **Repository-local** — Task data lives in `.beads/`, committed alongside code
- **Git-hook synced** — Task state updates automatically on commit via data-sync hooks
- **CLI-driven** — All operations via `bd` commands (create, list, status, ready)
- **ID-prefixed commits** — Every commit message includes `[BD-xxx]` for traceability

### Task Hierarchy

Tasks organize into three levels:

| Level | Scope | Example | Typical Count |
|-------|-------|---------|---------------|
| **Epic** | Large feature or milestone | "User authentication system" | 3-8 per project |
| **Task** | Single agent session (30-90 min) | "Implement login endpoint with validation" | 10-50 per project |
| **Subtask** | Atomic unit within a task | "Add password hashing util" | 0-5 per task |

Epics group related tasks. Tasks are the unit of work assignment — one task per agent session. Subtasks are optional decomposition within a task, useful when a task has distinct testable steps.

### Progress Tracking

Track task status through a simple state machine:

```
ready → in-progress → review → done
                  ↘ blocked
```

- **ready** — All dependencies met, can start immediately
- **in-progress** — Agent is actively working on it
- **review** — Implementation complete, awaiting PR merge
- **done** — PR merged, tests passing on main
- **blocked** — Cannot proceed, dependency or question unresolved

### Lessons-Learned Workflow

The `tasks/lessons.md` file captures patterns discovered during work. It has three sections:

1. **Patterns** — Approaches that worked well (reuse these)
2. **Anti-Patterns** — Approaches that failed (avoid these)
3. **Common Gotchas** — Project-specific traps (watch for these)

After ANY correction from the user, immediately update `tasks/lessons.md` with the pattern. Write the rule so that it prevents the same mistake in future sessions.

## Deep Guidance

### Beads Setup and Commands

#### Initialization

```bash
bd init              # Creates .beads/ directory with data store and git hooks
```

Initialization creates:
- `.beads/` — Data directory (committed to git)
- Git hooks for automatic data sync (these are Beads data hooks, not code-quality hooks like pre-commit linters)
- Initial `[BD-0]` bootstrap convention

#### Core Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `bd create "title"` | Create a new task | Starting new work |
| `bd list` | Show all tasks | Session start, planning |
| `bd status BD-xxx` | Check task state | Before picking up work |
| `bd start BD-xxx` | Mark task in-progress | Beginning work on a task |
| `bd done BD-xxx` | Mark task complete | After PR merged |
| `bd ready` | List tasks ready to start | Picking next task |
| `bd block BD-xxx "reason"` | Mark task blocked | When dependency is unmet |

#### Commit Message Convention

Every commit references its Beads task:

```
[BD-42] feat(api): implement user registration endpoint

- Add POST /api/v1/auth/register
- Add input validation with zod schema
- Add integration tests for happy path and validation errors
```

The `[BD-xxx]` prefix enables:
- Automatic task-to-commit traceability
- Progress tracking based on commit activity
- Session reconstruction (which commits belong to which task)

### Task Lifecycle Patterns

#### Session Start Protocol

1. Review `tasks/lessons.md` for recent patterns and corrections
2. Run `bd ready` to see available tasks
3. Pick the highest-priority ready task (or continue an in-progress task)
4. Run `bd start BD-xxx` to claim the task
5. Read the task description and acceptance criteria before writing code

#### Session End Protocol

1. Commit all work with `[BD-xxx]` prefix
2. If task is complete: create PR, run `bd done BD-xxx`
3. If task is incomplete: leave clear notes about current state and next steps
4. If lessons were learned: update `tasks/lessons.md`

#### Task Completion Criteria

A task is done when:
- All acceptance criteria from the task description are met
- Tests pass (`make check` or equivalent)
- Code follows project coding standards
- Changes are committed with proper `[BD-xxx]` message
- PR is created (or merged, depending on workflow)

Do not mark a task done based on "it seems to work." Prove it works — tests pass, logs clean, behavior verified.

### Lessons-Learned Workflow — Extended

#### When to Capture

Capture a lesson immediately when:
- The user corrects your approach or output
- A test fails due to a pattern you should have known
- You discover a project-specific convention by reading code
- A dependency or tool behaves differently than expected
- A workaround is needed for a known issue

#### How to Write Lessons

Each lesson should be specific, actionable, and preventive:

**Good lesson:**
```markdown
### Anti-Pattern: Using `git push -f` on shared branches
- **Trigger:** Pushed force to a branch with an open PR
- **Impact:** Overwrote collaborator's review comments
- **Rule:** Never force-push to branches with open PRs. Use `git push --force-with-lease` if force is truly needed.
```

**Bad lesson:**
```markdown
### Be careful with git
- Don't break things
```

The lesson must contain enough detail that a future agent (or the same agent in a new session) can apply the rule without additional context.

#### Integration with CLAUDE.md

The CLAUDE.md Self-Improvement section establishes the contract:

> After ANY correction from the user: update `tasks/lessons.md` with the pattern.
> Write rules that prevent the same mistake recurring.
> Review `tasks/lessons.md` at session start before picking up work.

This creates a feedback loop: correction → lesson → rule → prevention. Each session starts by reviewing lessons, ensuring that past mistakes inform current work.

#### Cross-Session Memory

`tasks/lessons.md` is the primary cross-session learning mechanism. It persists in the repository and is loaded via CLAUDE.md references. For projects using MCP memory servers (Tier 2 memory), lessons can also be stored in the knowledge graph for structured querying — but `tasks/lessons.md` remains the canonical file. Do not duplicate entries across both systems.

### Progress Tracking Conventions

#### Status Files

For complex projects, maintain a progress summary:

```markdown
# Progress

## Current Sprint
- [x] BD-10: Database schema migration (done)
- [x] BD-11: Auth middleware (done)
- [ ] BD-12: User registration endpoint (in-progress)
- [ ] BD-13: Login endpoint (ready)
- [ ] BD-14: Profile management (blocked — needs BD-12)

## Blocked
- BD-14: Waiting on BD-12 (user model finalization)
```

#### Completion Criteria Checklists

Each task should define explicit completion criteria, not vague goals:

```markdown
## BD-12: User registration endpoint

### Done when:
- [ ] POST /api/v1/auth/register endpoint exists
- [ ] Input validation rejects invalid email, weak password
- [ ] Password is hashed with bcrypt (cost factor 12)
- [ ] Duplicate email returns 409 Conflict
- [ ] Integration test covers happy path + 3 error cases
- [ ] `make check` passes
```

### Common Anti-Patterns

**Stale tasks.** Tasks created during planning but never updated as the project evolves. The task list says "implement X" but X was descoped two sessions ago. Fix: review the task list at the start of each session. Archive or close tasks that no longer apply.

**Unclear completion criteria.** "Implement the feature" with no acceptance criteria, no test requirements, no file paths. An agent starting this task has to guess what "done" means. Fix: every task specifies exact deliverables, test requirements, and a verifiable definition of done.

**Missing lessons.** The user corrects the same mistake three sessions in a row because nobody captured it in `tasks/lessons.md`. Fix: treat lesson capture as mandatory, not optional. After every correction, update the file before continuing with other work.

**Task ID drift.** Commits stop including `[BD-xxx]` prefixes partway through the project. Traceability breaks down. Fix: make task ID inclusion a habit enforced by review. If using a pre-commit hook, validate the prefix.

**Overloaded tasks.** A single task covers "implement the API, write the UI, add tests, update docs." This overflows a single session and makes progress tracking meaningless. Fix: split into tasks that each fit in one agent session (30-90 minutes).

**Lessons without rules.** A lesson says "we had trouble with X" but doesn't state a preventive rule. Future sessions read the lesson but don't know what to do differently. Fix: every lesson must include a concrete rule — "Always do Y" or "Never do Z" — not just a description of what went wrong.
