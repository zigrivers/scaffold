---
description: "Show installed and latest scaffold version"
---

Show the installed scaffold version and check if a newer version is available. Follow these steps exactly:

**Bundled version:** 1.3.0

## Step 1 — Detect Installed Version

Determine the currently installed scaffold version:

1. Run `cat ~/.claude/commands/.scaffold-version 2>/dev/null` to check for the user-command version marker.
   - If the file exists, parse the version from it (format: `1.2.0 (abc1234)` — extract the version number before the space).
2. If `.scaffold-version` does not exist (plugin install), use the **Bundled version** shown above in this command as the installed version.

Store the detected version for comparison.

## Step 2 — Fetch Latest Version

Check the latest available version from GitHub:

```bash
curl -sf https://raw.githubusercontent.com/zigrivers/scaffold/main/CHANGELOG.md
```

From the output, extract the version number from the **first** `## [X.Y.Z]` line. This is the latest released version.

If the `curl` command fails (non-zero exit, empty output), note that the remote check failed and skip to Step 3.

## Step 3 — Compare and Report

Display the results to the user:

---

**Scaffold version check**

- **Installed:** `<installed version>`
- **Latest:** `<latest version>` (or "couldn't reach GitHub" if the remote check failed)
- **Status:** one of:
  - "Up to date" — if installed version matches latest
  - "Update available" — if latest is newer than installed
  - "Couldn't check remote" — if the fetch failed

If an update is available, suggest:

> Run `/scaffold:update` (or `/user:update` for user-command installs) to update.

---

## Process

- This command is **read-only** — do NOT modify any files
- Run each step in order
- If the remote check fails, still report the installed version — don't treat it as an error
- Keep the output concise — no need for extra explanation beyond the version report
