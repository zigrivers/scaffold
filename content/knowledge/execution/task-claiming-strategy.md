---
name: task-claiming-strategy
description: Task selection and management patterns for AI agent execution
topics: [tasks, execution, agents, planning]
volatility: stable
last-reviewed: 2026-07-14
version-pin: null
sources: []
---

# Task Claiming Strategy

Expert knowledge for how AI agents select, claim, and manage tasks during implementation. Covers deterministic selection algorithms, dependency awareness, and multi-agent conflict avoidance patterns.

## Summary

### Task Selection Algorithm

Select the lowest-ID unblocked task. This provides deterministic, conflict-free ordering when multiple agents operate on the same task list.

### Dependency Awareness

Before starting a task, verify all its blockers are resolved. After completing each task, re-check the dependency graph — your completion may have unblocked downstream tasks.

### Multi-Agent Conflict Avoidance

- Claim the task before starting work — an atomic `bd` claim plus a draft PR is the claim signal (not branch creation)
- Communicate via the draft PR and `bd` status — an open/draft PR and an `in_progress` bead signal ownership
- Detect file overlap in implementation plans before starting — if two tasks modify the same files, they should not run in parallel

## Deep Guidance

### Task Selection — Extended

**The algorithm:**
1. List all tasks in the backlog
2. Filter to tasks with status "ready" or "unblocked"
3. Sort by task ID (ascending)
4. Select the first task in the sorted list
5. Claim the task you selected atomically (`bd update <id> --claim`) and open a draft PR on the first push; a claim lost to another agent means re-run from step 2. (Skipping explicit selection? `bd ready --claim` claims by Beads' own sort order, not your step-4 choice — only use it when that is acceptable, and add `--exclude-label gt:slot` where a merge slot exists: the slot bead is claimable infrastructure, not work)

**Why lowest-ID first:**
- Deterministic — two agents independently applying this rule will never pick the same task (the first agent claims it, the second sees it as taken)
- Dependency-friendly — lower IDs are typically earlier in the plan and have fewer blockers
- Predictable — humans can anticipate which tasks agents will pick next

**Exceptions:**
- If the lowest-ID task requires skills or context the agent doesn't have, skip it and document why
- If a task is labeled "high priority" or "urgent," it takes precedence over ID ordering
- If a human has assigned a specific task to the agent, honor the assignment

### Dependency Awareness — Extended

**Before starting a task:**
1. Read the task's dependency list (blockers, prerequisites)
2. Verify each blocker is in "done" or "merged" state
3. If any blocker is incomplete, skip this task and select the next eligible one
4. Pull the latest main branch to ensure you have the outputs from completed blockers

**After completing a task:**
1. Check which downstream tasks list the completed task as a blocker
2. If any downstream tasks are now fully unblocked, they become eligible for selection
3. If you're continuing work, re-run the selection algorithm — the next task may have changed

**Dependency types:**
- **Hard dependency** — cannot start until blocker is merged (e.g., "implement auth" blocks "implement protected routes")
- **Soft dependency** — can start with a stub/mock, but must integrate before PR (e.g., "design API" informs "implement client," but the client can start with a contract)
- **Data dependency** — needs output artifacts from another task (e.g., database schema must exist before writing queries)

### Multi-Agent Conflict Avoidance — Extended

**Claiming a task:**
- The claim is an atomic `bd ready --claim` (sets `in_progress` + assignee) plus a draft PR opened on the first push — not branch creation. The draft PR is the visible claim other agents see; the bead ID stays out of the branch name and rides in the PR body as `Closes bd-a3f8`. Claims key on the Beads actor and same-actor claims are idempotent — each concurrent agent needs its own stable `BEADS_ACTOR`. Select one task at a time, at claim time; a claim lost to another agent means take the next candidate
- Other agents should check open/draft PRs and `bd` status before claiming the same task
- If two agents accidentally claim the same task, the one with fewer commits yields

**Detecting file overlap:**
- Before starting, review the implementation plan for file-level scope
- If two tasks both modify `src/auth/middleware.ts`, they should not run in parallel
- When overlap is detected: serialize the tasks (one blocks the other), or split the overlapping file into two files first

**Communication via draft PRs and `bd`:**
- Bead `in_progress` + open draft PR = task claimed
- PR merged + bead `closed` = task complete
- Bead released back to `ready` (PR closed unmerged) = task abandoned, available for re-claim (release = `bd update <id> --status open --assignee ""` — clearing the assignee is what makes it claimable again)

### What to Do When Blocked

When no eligible tasks remain (all are blocked or claimed):

1. **Document the blocker** — note which task you need and what it produces
2. **Skip to the next available task** — don't wait idle; there may be non-dependent tasks further down the list
3. **Look for prep work** — can you write tests, set up scaffolding, or create stubs for the blocked task?
4. **If truly nothing is available** — report status and wait for new tasks to become unblocked

**Never:**
- Start a blocked task hoping the blocker will finish soon
- Work on the same task as another agent without coordination
- Sit idle without communicating status

### Conditional Beads Integration

Beads is an optional task-tracking tool. Detect its presence and adapt.

**When `.beads/` directory exists:**
- Use `bd ready` to list tasks that are ready for work
- Use `bd update <id> --claim` to atomically claim a task (or `bd ready --claim --json` to find and claim the first available in one call)
- Use `bd close <id>` after PR is merged to mark task complete
- Task IDs come from Beads (`bd-a3f8`, `bd-a3f9`, etc. — hash-based, lowercase)
- Branch naming follows the `<type>/<short-desc>` convention (worktree
  branches use `agent/<name>`) — bead IDs never appear in the branch name;
  reference the task ID in the commit/PR body instead (e.g. `Closes bd-a3f8`)

**Without Beads:**
- Parse `implementation-plan.md` task list for task IDs and dependencies
- Or use the project's task tracking system (GitHub Issues, Linear, Jira)
- Branch naming uses the project's convention (e.g., `feat/user-registration`) — no work-item IDs in the branch name; put the ID in the PR body as `Closes <id>`
- Task status is tracked via PR state: open PR = in progress, merged PR = done

### Task Completion Criteria

A task is complete when all of the following are true:

1. **All acceptance criteria met** — every criterion listed in the task description is satisfied
2. **Tests passing** — new tests written for the task, plus the full existing suite, all pass
3. **PR created** — code is pushed and a pull request is open with a structured description
4. **Local quality gates pass** — pre-commit hooks + `make check` are green on the branch HEAD and `mmr review` passed (CI is deferred until a launch target is chosen; it applies only post-launch)
5. **No regressions** — existing functionality is unchanged unless the task explicitly modifies it

Only after all five criteria are met should the task be marked as done.

## Discovered Work

While implementing a claimed task, you may discover bugs or follow-up tasks. Don't silently expand the current task's scope — file the new work as a separate Beads issue with `discovered-from`:

```bash
bd create "fix(parser): handle empty input edge case" \
  --type bug -p 2 \
  --deps discovered-from:$CURRENT_TASK_ID
```

`discovered-from` is metadata for traceability — the new issue appears in `bd ready` normally and does NOT block the current task. This preserves the audit trail of why the new task exists.

## See Also

- [tdd-execution-loop](./tdd-execution-loop.md) — Red-green-refactor cycle and commit timing
- [worktree-management](./worktree-management.md) — Parallel agent worktree setup
- [task-tracking](../core/task-tracking.md) — Task tracking systems and conventions
