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

Tell the user to update the plugin by running:

```
/plugin update scaffold
```

Explain that Claude Code will pull the latest version of the plugin. If that doesn't work, they can uninstall first with `/plugin uninstall scaffold`, remove the marketplace with `/plugin marketplace remove scaffold`, then re-add and re-install.

## Step 5 — Confirm

After updating, tell the user:

---
**Scaffold updated.** Run `/scaffold:prompt-pipeline` (or `/user:prompt-pipeline`) to verify the commands are working.

Check the changelog above for what's new. If any prompts you've already run were changed, you may want to re-run them.

---

## Process

- Run each step in order
- Do NOT skip the changelog display — users need to see what changed
- If any step fails, report the error clearly and suggest running `./scripts/update.sh` from the scaffold repo directory as a fallback
