---
description: "Start single-agent execution loop"
long-description: "Begins the TDD execution loop: pulls the next task, writes failing tests, implements until green, creates a PR, and repeats. Works with Beads or standalone task list."
---

Follow the workflow in CLAUDE.md.

**If Beads is configured** (`.beads/` exists):
Run `bd ready`, pick the lowest-ID unblocked task, and implement it. Keep working until `bd ready` shows no available tasks.

**Without Beads:**
1. Read `docs/onboarding-guide.md` first for project context (if it exists).
2. Use `docs/implementation-playbook.md` as the primary task execution reference (if it exists); fall back to `docs/implementation-plan.md` when no playbook is present.
3. If `tests/acceptance/` exists, check for TDD test skeletons that correspond to the current task — use them as your starting point for red-green-refactor.
4. Pick the first uncompleted task that has no unfinished dependencies. Implement it following the TDD workflow in CLAUDE.md. Mark it complete in the plan/playbook.
5. Before creating a PR, run `make eval` (or the equivalent eval command from CLAUDE.md Key Commands) as a required quality gate, in addition to `make check`.
6. Keep working through the task list in dependency order.
