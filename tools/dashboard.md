---
name: dashboard
description: Open visual pipeline dashboard in browser
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: []
---

## Purpose

Open a visual pipeline dashboard in the browser showing progress, phase grouping,
step details, and what's next.

## Instructions

Run the `scaffold dashboard` CLI command:

```bash
scaffold dashboard
```

### Flags

- `--no-open` — Generate HTML but don't open in browser
- `--json-only` — Output JSON data to stdout (for scripting)
- `--output FILE` — Write HTML to a specific file path

### What It Shows

- **Progress bar** with color-coded segments (completed, skipped, pending)
- **Summary cards** with counts for completed, skipped, pending, and total steps
- **Phase-grouped steps** in collapsible sections, organized by the 16 pipeline phases
- **Step detail modals** with descriptions, dependencies, outputs, and full prompt content
- **"What's Next" banner** highlighting the recommended next step
- **Decision log** showing recorded project decisions
- **Dark/light theme** (automatic, follows system preference)

### Modes

- **With `.scaffold/` directory**: Shows actual progress — completed/skipped/pending status from state
- **Without `.scaffold/` directory**: Shows full pipeline overview as a reference guide (all steps pending)

## Process Rules

1. This is a standalone command — use it anytime during the pipeline to check progress.
2. No files in the project are modified (the dashboard HTML is written to a temp directory).

**Pipeline reference:** `/scaffold:prompt-pipeline`
