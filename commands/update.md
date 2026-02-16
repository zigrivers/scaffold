---
description: "Check for and apply scaffold updates"
---

Check for and apply updates to the scaffold prompt pipeline. Follow these steps exactly:

## Step 1 — Detect Installation Method

Check which installation method is in use:

1. Run `ls ~/.claude/commands/.scaffold-version 2>/dev/null` to check for the user-command version marker.
2. Check if this command was invoked as `/scaffold:update` (plugin install) or `/user:update` (user command install).

Report the detected method to the user.

## Step 2 — Fetch Latest Version

Clone or pull the latest scaffold repo:

```bash
CACHE_DIR="$HOME/.cache/scaffold"
if [ -d "$CACHE_DIR/.git" ]; then
    cd "$CACHE_DIR" && git pull origin main
else
    mkdir -p "$(dirname "$CACHE_DIR")"
    git clone https://github.com/zigrivers/scaffold.git "$CACHE_DIR"
fi
```

## Step 3 — Show What Changed

Read `~/.cache/scaffold/CHANGELOG.md` and display the entries to the user so they can see what's new.

If `~/.claude/commands/.scaffold-version` exists, read it to determine the currently installed version and highlight only the newer entries.

## Step 4 — Apply Update

**For user command installs** (files in `~/.claude/commands/`):

Run the install script from the fetched repo to update all command files:

```bash
bash ~/.cache/scaffold/scripts/install.sh -f
```

Report the result to the user.

**For plugin installs** (`/scaffold:` prefix):

Update the plugin in-place by pulling the latest code into the marketplace clone:

1. Locate the marketplace clone directory:
   ```bash
   PLUGIN_DIR="$HOME/.claude/plugins/marketplaces/zigrivers-scaffold"
   ```

2. Verify it exists and is a git repo. If the directory doesn't exist or has no `.git`, fall back to telling the user to run `/plugin marketplace update zigrivers-scaffold` and stop here.

3. Record the current state before updating:
   ```bash
   cd "$PLUGIN_DIR" && git rev-parse --short HEAD
   ```

4. Pull the latest changes:
   ```bash
   cd "$PLUGIN_DIR" && git pull origin main
   ```

5. Read the new version from the plugin manifest:
   ```bash
   cat "$PLUGIN_DIR/.claude-plugin/plugin.json"
   ```
   Extract the `version` field from the JSON.

6. **Best-effort metadata sync** — Update `~/.claude/plugins/installed_plugins.json` to keep Claude Code's metadata in sync. Read the file, find the entry for `scaffold@zigrivers-scaffold`, and update its `version`, `commitSha` (from `git rev-parse HEAD`), and `lastUpdated` (current ISO timestamp) fields. Write the updated JSON back. **Wrap this in error handling** — if reading/writing fails, skip it silently. The update still worked because commands are served directly from the clone.

7. **Best-effort timestamp sync** — Update the `lastUpdated` field for `zigrivers-scaffold` in `~/.claude/plugins/known_marketplaces.json`. Same error handling approach — skip silently on failure.

8. Report the result: old SHA → new SHA, old version → new version.

## Step 5 — Confirm

After updating, tell the user:

---
**Scaffold updated.** Run `/scaffold:prompt-pipeline` (or `/user:prompt-pipeline`) to verify the commands are working.

Check the changelog above for what's new. If any prompts you've already run were changed, you may want to re-run them.

**Note:** For plugin installs, updated commands take effect immediately for new invocations. If anything seems stale, start a fresh Claude Code session.

---

## Process

- Run each step in order
- Do NOT skip the changelog display — users need to see what changed
- If any step fails, report the error clearly and suggest running `./scripts/update.sh` from the scaffold repo directory as a fallback
