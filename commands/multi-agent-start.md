---
description: "Start multi-agent execution loop in a worktree"
long-description: "Initializes a named agent in a git worktree, claims a task, and begins the TDD execution loop with worktree-aware branching and rebasing."
argument-hint: "<agent-name>"
---

You are $ARGUMENTS. Verify your setup:
- `git rev-parse --git-dir` should contain "/worktrees/" (confirms you're in a worktree)

**If Beads is configured** (`.beads/` exists):
- `echo $BD_ACTOR` should show "$ARGUMENTS"

Follow the workflow in CLAUDE.md. Key differences for worktree agents:
- Never run `git checkout main` — it will fail (main is checked out in the main repo)
- Always branch from remote: `git fetch origin && git checkout -b <branch-name> origin/main`
- Between tasks: `git fetch origin --prune && git clean -fd` then run the install command from CLAUDE.md Key Commands

**If Beads is configured:**
Branch naming: `bd-<id>/<desc>`. Run `bd ready`, pick the lowest-ID unblocked task, and implement it. Keep working until `bd ready` shows no available tasks.

**Without Beads:**
Branch naming: `<type>/<desc>` (e.g., `feat/add-auth`).
1. Read `docs/onboarding-guide.md` first for project context (if it exists).
2. Use `docs/implementation-playbook.md` as the primary task execution reference (if it exists); fall back to `docs/implementation-plan.md` when no playbook is present.
3. If `tests/acceptance/` exists, check for TDD test skeletons that correspond to the current task — use them as your starting point for red-green-refactor.
4. Pick the first uncompleted task with no unfinished dependencies. Implement it following the TDD workflow.
5. Before creating a PR, run `make eval` (or the equivalent eval command from CLAUDE.md Key Commands) as a required quality gate, in addition to `make check`.
6. Keep working through the task list in dependency order.
