#!/usr/bin/env bash
set -euo pipefail

# ─── Preflight ──────────────────────────────────────────────

if [ $# -eq 0 ]; then
    echo "Usage: teardown-agent-worktree.sh <worktree-path>" >&2
    echo "  Harvests the worktree's ledger to the central archive, removes the worktree," >&2
    echo "  and (if its branch is not the primary repo's HEAD) deletes the workspace branch." >&2
    exit 1
fi

worktree_dir="$1"

if [ ! -d "$worktree_dir" ]; then
    echo "Error: worktree path does not exist: $worktree_dir" >&2
    exit 1
fi

command -v git >/dev/null 2>&1 || {
    echo "Error: git is required but not installed" >&2
    exit 2
}

# ─── Resolve primary repo from the worktree ─────────────────

git_common_dir="$(git -C "$worktree_dir" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$git_common_dir" ]; then
    echo "Error: could not resolve git common dir from worktree: $worktree_dir" >&2
    exit 1
fi
# git-common-dir is <primary-repo>/.git — primary repo root is one level up
REPO_DIR="$(cd "$git_common_dir/.." && pwd)"

# ─── Read the actual branch name from the worktree ──────────

branch_name="$(git -C "$worktree_dir" branch --show-current 2>/dev/null || true)"

# ─── Harvest the ledger to the central archive ──────────────

if command -v scaffold >/dev/null 2>&1; then
    scaffold observe harvest --worktree="$worktree_dir" || \
        echo "Warning: scaffold observe harvest failed; proceeding with worktree removal anyway" >&2
else
    echo "Warning: scaffold not on PATH; skipping ledger harvest" >&2
fi

# ─── Remove the worktree ────────────────────────────────────

git -C "$REPO_DIR" worktree remove "$worktree_dir"
echo "Removed worktree: $worktree_dir"

# ─── Optional branch cleanup ────────────────────────────────

if [ -n "$branch_name" ]; then
    primary_branch="$(git -C "$REPO_DIR" branch --show-current 2>/dev/null || true)"
    if [ "$branch_name" != "$primary_branch" ]; then
        if git -C "$REPO_DIR" branch -D "$branch_name" 2>/dev/null; then
            echo "Deleted branch: $branch_name"
        else
            echo "Note: branch '$branch_name' not deleted (may be checked out elsewhere or already gone)"
        fi
    fi
fi

echo "Teardown complete."
