#!/bin/bash
# Update scaffold commands to the latest version.
# Usage: ./scripts/update.sh
#
# This script:
# 1. Clones or pulls the latest scaffold repo to ~/.cache/scaffold/
# 2. Shows what changed since last update
# 3. Prints relevant CHANGELOG entries
# 4. Runs install.sh -f from the fetched repo
# 5. Writes .scaffold-version marker
# 6. Reports results

set -e

REPO_URL="https://github.com/zigrivers/scaffold.git"
CACHE_DIR="$HOME/.cache/scaffold"
TARGET_DIR="$HOME/.claude/commands"
VERSION_FILE="$TARGET_DIR/.scaffold-version"

# ─── Fetch latest ─────────────────────────────────────────────────
echo "Checking for scaffold updates..."
echo ""

if [ -d "$CACHE_DIR/.git" ]; then
    # Already cloned — record current position, then pull
    cd "$CACHE_DIR"
    OLD_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    git pull --quiet origin main 2>/dev/null || git pull --quiet 2>/dev/null
    NEW_SHA=$(git rev-parse --short HEAD)

    if [ "$OLD_SHA" = "$NEW_SHA" ]; then
        echo "Already up to date ($NEW_SHA)."
        echo ""

        # Still run install in case local files are missing
        if [ -f "$CACHE_DIR/scripts/install.sh" ]; then
            echo "Re-installing commands to ensure local files are current..."
            bash "$CACHE_DIR/scripts/install.sh" -f
        fi
        exit 0
    fi

    echo "Updated $OLD_SHA → $NEW_SHA"
    echo ""

    # Show what changed
    echo "Changes since last update:"
    git log --oneline "$OLD_SHA..$NEW_SHA" 2>/dev/null || true
    echo ""
else
    # First time — clone
    echo "Downloading scaffold..."
    mkdir -p "$(dirname "$CACHE_DIR")"
    git clone --quiet "$REPO_URL" "$CACHE_DIR"
    cd "$CACHE_DIR"
    NEW_SHA=$(git rev-parse --short HEAD)
    echo "Cloned at $NEW_SHA"
    echo ""
fi

# ─── Show changelog ───────────────────────────────────────────────
if [ -f "$CACHE_DIR/CHANGELOG.md" ]; then
    echo "── Changelog ──────────────────────────────────────"
    cat "$CACHE_DIR/CHANGELOG.md"
    echo ""
    echo "───────────────────────────────────────────────────"
    echo ""
fi

# ─── Run install ──────────────────────────────────────────────────
if [ -f "$CACHE_DIR/scripts/install.sh" ]; then
    echo "Installing updated commands..."
    bash "$CACHE_DIR/scripts/install.sh" -f
else
    echo "Error: install.sh not found in fetched repo"
    exit 1
fi

echo ""
echo "Scaffold updated successfully."
