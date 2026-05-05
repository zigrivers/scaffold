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
agent_suffix="$(echo "$raw_name" | tr '[:upper:]' '[:lower:]' | tr '_' '-' | tr -cd 'a-z0-9-')"

if [ -z "$agent_suffix" ]; then
    echo "Error: agent name '${raw_name}' normalizes to empty string — use alphanumeric characters" >&2
    exit 1
fi

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

echo "Created worktree at $worktree_dir on branch $branch_name"

# ─── Write .scaffold/identity.json (for build observability) ────────────
mkdir -p "$worktree_dir/.scaffold"
if [ ! -f "$worktree_dir/.scaffold/identity.json" ]; then
    if command -v uuidgen >/dev/null 2>&1; then
        identity_uuid="$(uuidgen | tr 'A-Z' 'a-z')"
    else
        # Fallback: RFC 4122 UUID v4 via python3 or /dev/urandom with version/variant bits set
        if command -v python3 >/dev/null 2>&1; then
            identity_uuid="$(python3 -c 'import uuid; print(uuid.uuid4())')"
        else
            raw="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
            p1="${raw:0:8}" p2="${raw:8:4}" p3="4${raw:13:3}"
            hi="$(printf '%x' "$(( (16#${raw:16:1} & 3) | 8 ))")"
            identity_uuid="${p1}-${p2}-${p3}-${hi}${raw:17:3}-${raw:20:12}"
        fi
    fi
    created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '{\n  "worktree_id": "%s",\n  "worktree_label": "%s",\n  "created_at": "%s"\n}\n' \
        "$identity_uuid" "$agent_suffix" "$created_at" \
        > "$worktree_dir/.scaffold/identity.json"
    echo "Wrote $worktree_dir/.scaffold/identity.json (worktree_id=$identity_uuid)"
fi
