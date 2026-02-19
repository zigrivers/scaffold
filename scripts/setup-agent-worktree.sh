#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Preflight ──────────────────────────────────────────────

if [ $# -eq 0 ]; then
    echo "Usage: setup-agent-worktree.sh <agent-name>" >&2
    echo "  Creates a permanent git worktree for a parallel agent session." >&2
    exit 1
fi

command -v git >/dev/null 2>&1 || {
    echo "Error: git is required but not installed" >&2
    exit 2
}

# ─── Normalize agent name ───────────────────────────────────

raw_name="$1"
agent_suffix="$(echo "$raw_name" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"

# ─── Resolve paths ──────────────────────────────────────────

repo_name="$(basename "$REPO_DIR")"
worktree_dir="$(cd "$REPO_DIR/.." && pwd)/${repo_name}-${agent_suffix}"
branch_name="${agent_suffix}-workspace"

# ─── Create worktree ────────────────────────────────────────

if [ -d "$worktree_dir" ]; then
    echo "Worktree already exists at $worktree_dir"
    exit 0
fi

# Create the workspace branch if it doesn't exist
if ! git -C "$REPO_DIR" rev-parse --verify "$branch_name" >/dev/null 2>&1; then
    git -C "$REPO_DIR" branch "$branch_name"
fi

git -C "$REPO_DIR" worktree add "$worktree_dir" "$branch_name"

# ─── Set up shared Beads database ───────────────────────────

if command -v bd >/dev/null 2>&1; then
    (cd "$worktree_dir" && bd worktree create 2>/dev/null) || true
fi

echo "Created worktree at $worktree_dir on branch $branch_name"
echo "All agents share one Beads database — task state is visible immediately across worktrees."
