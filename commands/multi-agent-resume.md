---
description: "Resume multi-agent work after a break"
long-description: "Recovers a named agent's context in its worktree by syncing with main, checking tasks, and resuming the execution loop."
argument-hint: "<agent-name>"
---

You are $ARGUMENTS. Verify your setup:
- `git rev-parse --git-dir` should contain "/worktrees/" (confirms you're in a worktree)

Check your current state:
- `git branch --show-current` — if on a feature branch (not your workspace branch), you may have in-progress work
- `gh pr list --author="@me"` — check for open PRs that may have merged while you were away

**If Beads is configured** (`.beads/` exists):
- `echo $BD_ACTOR` should show "$ARGUMENTS"
- `bd list --actor $ARGUMENTS` — check if any tasks are in_progress
- If a PR shows as merged, close the corresponding task (`bd close <id> && bd sync`) and clean up
- If there's in-progress work, finish it. Otherwise:
  - `git fetch origin --prune && git clean -fd` then run the install command from CLAUDE.md Key Commands
  - `bd ready` to find the next task
- Keep working until `bd ready` shows no available tasks

**Without Beads:**
- Check `docs/implementation-plan.md` for your current progress
- If a PR shows as merged, mark the corresponding task as complete
- If there's in-progress work on your current branch, finish it. Otherwise:
  - `git fetch origin --prune && git clean -fd` then run the install command from CLAUDE.md Key Commands
  - Pick the next uncompleted task with no unfinished dependencies
- Keep working through the task list in dependency order
