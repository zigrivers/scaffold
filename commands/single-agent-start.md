---
description: "Start single-agent execution loop"
long-description: "Begins the TDD execution loop: pulls the next task, writes failing tests, implements until green, creates a PR, and repeats. Works with Beads or standalone task list."
---

Follow the workflow in CLAUDE.md.

**If Beads is configured** (`.beads/` exists):
Run `bd ready`, pick the lowest-ID unblocked task, and implement it. Keep working until `bd ready` shows no available tasks.

**Without Beads:**
Read `docs/implementation-plan.md` (or `docs/implementation-playbook.md` if it exists). Pick the first uncompleted task that has no unfinished dependencies. Implement it following the TDD workflow in CLAUDE.md. Mark it complete in the plan. Keep working through the task list in dependency order.
