---
description: "Start multi-agent execution loop in a worktree"
long-description: "Initializes a named agent in a git worktree, claims a Beads task, and begins the TDD execution loop with worktree-aware branching and rebasing."
argument-hint: "<agent-name>"
---

You are $ARGUMENTS. Verify your setup:
- `echo $BD_ACTOR` should show "$ARGUMENTS"
- `git rev-parse --git-dir` should contain "/worktrees/" (confirms you're in a worktree)

This worktree uses a shared Beads database (set up by `scripts/setup-agent-worktree.sh`). Task state is visible across all agents immediately — no `bd sync` needed between agents for visibility.

Follow the workflow in CLAUDE.md. Key differences for worktree agents:
- Never run `git checkout main` — it will fail (main is checked out in the main repo)
- Always branch from remote: `git checkout -b bd-<id>/<desc> origin/main`
- After each task: `bd close <id> && bd sync && git fetch origin --prune`
- Next task: branch directly from `origin/main` again

Run `bd ready`, pick the lowest-ID unblocked task, and implement it. Keep working until `bd ready` shows no available tasks.
