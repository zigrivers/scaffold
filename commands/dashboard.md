---
description: "Open visual pipeline dashboard in browser"
long-description: "Generates and opens a self-contained HTML dashboard showing pipeline progress, prompt status, beads tasks, and what to do next."
---

Generate and open a self-contained HTML dashboard showing the full Scaffold pipeline with completion status, descriptions, and "what's next" guidance.

**Run the following command:**

```bash
bash "$(dirname "$(find ~/.claude/plugins -path '*/scaffold/scripts/generate-dashboard.sh' 2>/dev/null | head -1)")/generate-dashboard.sh"
```

If the script is not found at the plugin path, try running it from the local repo:

```bash
bash scripts/generate-dashboard.sh
```

## What It Shows

- **Progress bar** with color-coded segments (green = completed, blue = likely done, gray = skipped)
- **Summary cards** with counts for completed, skipped, pending, and total prompts
- **"What's Next" banner** highlighting the recommended next command
- **Phase sections** (collapsible) with prompt cards showing status, descriptions, and click-to-copy commands
- **Dependency indicators** showing which prompts are blocked
- **Beads task counts** (when `bd` is available)
- **Dark/light mode** (automatic, follows system preference)

## Modes

- **With `.scaffold/` directory**: Shows actual progress — completed/skipped/pending status from config and artifact detection
- **Without `.scaffold/` directory**: Shows full pipeline overview as a reference guide (all prompts pending)

## Flags

- `--no-open` — Generate HTML but don't open in browser
- `--json-only` — Output JSON data to stdout (for scripting)
- `--output FILE` — Write HTML to a specific file path

## After This Step

This is a standalone command — use it anytime during the pipeline to check progress.

**Pipeline reference:** `/scaffold:prompt-pipeline`
