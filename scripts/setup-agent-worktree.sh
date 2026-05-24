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
agent_suffix="$(echo "$raw_name" | tr '[:upper:]' '[:lower:]' | tr '_' '-' | tr -cd 'a-z0-9-' | sed 's/^-*//;s/-*$//')"

if [ -z "$agent_suffix" ]; then
    echo "Error: agent name '${raw_name}' normalizes to empty string — use alphanumeric characters" >&2
    exit 1
fi

# ─── Resolve paths ──────────────────────────────────────────

repo_name="$(basename "$REPO_DIR")"
worktree_dir="$(cd "$REPO_DIR/.." && pwd)/${repo_name}-${agent_suffix}"
branch_name="${agent_suffix}-workspace"

# ─── Create worktree ────────────────────────────────────────

if [ ! -d "$worktree_dir" ]; then
    # Create the workspace branch if it doesn't exist
    if ! git -C "$REPO_DIR" rev-parse --verify "$branch_name" >/dev/null 2>&1; then
        git -C "$REPO_DIR" branch "$branch_name"
    fi

    git -C "$REPO_DIR" worktree add "$worktree_dir" "$branch_name"

    echo "Created worktree at $worktree_dir on branch $branch_name"
else
    echo "Worktree already exists at $worktree_dir"
fi

# ─── Write .scaffold/identity.json (for build observability) ────────────
mkdir -p "$worktree_dir/.scaffold"
if [ ! -f "$worktree_dir/.scaffold/identity.json" ]; then
    if command -v uuidgen >/dev/null 2>&1; then
        identity_uuid="$(uuidgen | tr 'A-Z' 'a-z')"
    else
        # Fallback: RFC 4122 UUID v4 via python3, Linux kernel, or od as last resort
        if command -v python3 >/dev/null 2>&1; then
            identity_uuid="$(python3 -c 'import uuid; print(uuid.uuid4())')"
        elif [ -r /proc/sys/kernel/random/uuid ]; then
            identity_uuid="$(cat /proc/sys/kernel/random/uuid)"
        else
            # od: strip all non-hex chars for portability across platforms
            raw="$(od -vAn -N16 -tx1 /dev/urandom | tr -dc '0-9a-f')"
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

# ─── Beads remediation (if .beads/ exists) ──────────────────
# Run bd doctor --fix to re-sync git hooks and project config against the installed
# bd version. Idempotent and fail-soft so non-Beads users (or stale bd installs)
# don't block worktree setup. Also register the worktree with Beads so hook/DB
# resolution stays correct across linked worktrees.
if [ -d "$worktree_dir/.beads" ] && command -v bd >/dev/null 2>&1; then
    if ! (cd "$worktree_dir" && bd doctor --fix >/dev/null 2>&1); then
        echo "Note: 'bd doctor --fix' reported issues in $worktree_dir. Run it manually for details." >&2
    fi
    # Register this worktree with Beads. Idempotent — bd worktree create is a no-op
    # if the worktree is already registered. Fail-soft for older bd versions that
    # don't have the `worktree` subcommand.
    if ! (cd "$worktree_dir" && bd worktree create >/dev/null 2>&1); then
        echo "Note: 'bd worktree create' was not run (older bd?). Multi-worktree DB resolution may be suboptimal." >&2
    fi
fi
