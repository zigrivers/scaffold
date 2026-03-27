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
Branch naming: `<type>/<desc>` (e.g., `feat/add-auth`). Read `docs/implementation-plan.md` for the task list. Pick the first uncompleted task with no unfinished dependencies. Implement it following the TDD workflow. Keep working through the list.
