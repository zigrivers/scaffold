---
description: "Start single-agent execution loop"
long-description: "Begins the TDD execution loop: pulls the next unblocked Beads task, writes failing tests, implements until green, creates a PR, and repeats."
---

Follow the workflow in CLAUDE.md. Run `bd ready`, pick the lowest-ID unblocked task, and implement it. Keep working until `bd ready` shows no available tasks.
