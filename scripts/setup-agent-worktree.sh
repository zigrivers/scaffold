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
# Worktrees live project-local under <repo>/.worktrees/<agent> for a single,
# consistent location (see docs/git-workflow.md §7). This matches the
# superpowers `using-git-worktrees` convention and keeps every agent worktree
# discoverable from one place rather than scattered as repo siblings.

worktree_dir="$REPO_DIR/.worktrees/${agent_suffix}"
branch_name="${agent_suffix}-workspace"

# ─── Ensure .worktrees/ is gitignored ───────────────────────
# Critical: a project-local worktree dir must be ignored or its contents (a full
# checkout) would show as untracked and could be committed. Add the rule if the
# repo does not already ignore it.
#
# Use the trailing-slash path ('.worktrees/') in the check: a directory-only
# pattern like '.worktrees/' only matches a path git knows to be a directory.
# Without the slash, `git check-ignore` false-negatives here because this runs
# *before* the worktree dir exists, which would append a duplicate ignore rule.
if ! git -C "$REPO_DIR" check-ignore -q .worktrees/ 2>/dev/null; then
    gitignore_file="$REPO_DIR/.gitignore"
    if [ -f "$gitignore_file" ] && [ -s "$gitignore_file" ] && [ "$(tail -c1 "$gitignore_file")" != "" ]; then
        printf '\n' >> "$gitignore_file"
    fi
    printf '# Git worktrees (scaffold parallel agents)\n.worktrees/\n' >> "$gitignore_file"
    echo "Added .worktrees/ to $gitignore_file"
fi

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
# don't block worktree setup.
#
# Note on worktree registration: upstream Beads v1.0.4 documents that worktrees
# automatically share the same Beads DB as the main repository via git common
# directory discovery — there is nothing to "register" from the worktree side.
# `bd worktree create <name>` is a CREATOR (creates a new git worktree), not a
# registrar; calling it inside an existing worktree is the wrong shape. So we
# just run `bd doctor --fix` here.
if [ -d "$worktree_dir/.beads" ] && command -v bd >/dev/null 2>&1; then
    if ! (cd "$worktree_dir" && bd doctor --fix >/dev/null 2>&1); then
        echo "Note: 'bd doctor --fix' reported issues in $worktree_dir. Run it manually for details." >&2
    fi
fi
