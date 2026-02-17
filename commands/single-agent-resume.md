---
description: "Resume work after a break"
long-description: "Recovers session context by reading CLAUDE.md, checking Beads status, reviewing git state, and resuming the execution loop from where you left off."
---

Follow the workflow in CLAUDE.md.

Check your current state:
- `git branch --show-current` — if on a feature branch, you may have in-progress work
- `bd list` — check if any tasks are in_progress
- `gh pr list --author="@me"` — check for open PRs that may have merged while you were away

If a PR shows as merged, close the corresponding task (`bd close <id> && bd sync`) and clean up before starting new work.
If there's in-progress work, finish it. Otherwise, start fresh with `bd ready`.
Keep working until `bd ready` shows no available tasks.
