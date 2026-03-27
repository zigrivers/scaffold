---
description: "Resume work after a break"
long-description: "Recovers session context by reading CLAUDE.md, checking task status, reviewing git state, and resuming the execution loop from where you left off."
---

Follow the workflow in CLAUDE.md.

Check your current state:
- `git branch --show-current` — if on a feature branch, you may have in-progress work
- `gh pr list --author="@me"` — check for open PRs that may have merged while you were away

**If Beads is configured** (`.beads/` exists):
- `bd list` — check if any tasks are in_progress
- If a PR shows as merged, close the corresponding task (`bd close <id> && bd sync`) and clean up before starting new work
- If there's in-progress work, finish it. Otherwise, start fresh with `bd ready`
- Keep working until `bd ready` shows no available tasks

**Without Beads:**
- Check `docs/implementation-plan.md` for your current progress
- If a PR shows as merged, mark the corresponding task as complete in the plan
- If there's in-progress work on your current branch, finish it
- Otherwise, pick the next uncompleted task with no unfinished dependencies
- Keep working through the task list in dependency order
