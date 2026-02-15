---
description: "Start multi-agent execution loop in a worktree"
argument-hint: "<agent-name>"
---

You are $ARGUMENTS. Verify your setup:
- `echo $BD_ACTOR` should show "$ARGUMENTS"
- `git rev-parse --git-dir` should contain "/worktrees/" (confirms you're in a worktree)

Follow the workflow in CLAUDE.md. Key differences for worktree agents:
- Never run `git checkout main` — it will fail (main is checked out in the main repo)
- Always branch from remote: `git fetch origin && git checkout -b bd-<id>/<desc> origin/main`
- Between tasks: `git fetch origin --prune && git clean -fd` then run the install command from CLAUDE.md Key Commands

Run `bd ready`, pick the lowest-ID unblocked task, and implement it. Keep working until `bd ready` shows no available tasks.
