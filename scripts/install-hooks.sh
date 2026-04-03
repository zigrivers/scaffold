#!/bin/bash
# Install composite pre-commit and pre-push git hooks
# Usage: ./scripts/install-hooks.sh
#
# Creates hooks with project-specific quality checks
# (ShellCheck, stale pipeline detection, tests).
# Backs up existing hooks before overwriting.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="${SCRIPT_DIR}/.."
HOOKS_DIR="${REPO_DIR}/.git/hooks"

mkdir -p "${HOOKS_DIR}"

# --- Back up existing hooks ---

for hook in pre-commit pre-push; do
    if [[ -f "${HOOKS_DIR}/${hook}" ]] && ! grep -q 'scaffold-composite-hook' "${HOOKS_DIR}/${hook}"; then
        cp "${HOOKS_DIR}/${hook}" "${HOOKS_DIR}/${hook}.bak"
        echo "Backed up existing ${hook} hook to ${hook}.bak"
    fi
done

# --- Install pre-commit hook ---

cat > "${HOOKS_DIR}/pre-commit" << 'HOOK'
#!/usr/bin/env sh
# scaffold-composite-hook v2
# Project quality checks for pre-commit

# 1. ShellCheck on staged .sh files
staged_sh=$(git diff --cached --name-only --diff-filter=ACM | grep '\.sh$' || true)
if [ -n "$staged_sh" ]; then
    if command -v shellcheck >/dev/null 2>&1; then
        echo "$staged_sh" | xargs shellcheck --severity=warning || exit 1
    else
        echo "Warning: shellcheck not installed, skipping lint check" >&2
    fi
fi

# 2. Check for stale pipeline/knowledge (changed without running scaffold build)
staged_content=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^(content/pipeline|content/knowledge)/' || true)
if [ -n "$staged_content" ]; then
    echo "" >&2
    echo "Warning: content/pipeline/ or content/knowledge/ files changed." >&2
    echo "  Remember to run 'npx scaffold build' if commands need regenerating." >&2
    echo "" >&2
fi
HOOK

chmod 755 "${HOOKS_DIR}/pre-commit"

# --- Install pre-push hook ---

cat > "${HOOKS_DIR}/pre-push" << 'HOOK'
#!/usr/bin/env sh
# scaffold-composite-hook v2
# Full test suite for pre-push

# 1. Run full test suite
# Unset git hook environment variables that interfere with git operations
# inside tests (e.g. git clone fails when GIT_DIR is set by the hook env)
if command -v bats >/dev/null 2>&1; then
    script_dir="$(cd "$(dirname "$0")" && pwd)"
    repo_dir="$script_dir/../.."
    unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
    bats "$repo_dir/tests/" || exit 1
else
    echo "Warning: bats not installed, skipping test suite" >&2
fi
HOOK

chmod 755 "${HOOKS_DIR}/pre-push"

echo "Hooks installed successfully."
echo "  pre-commit: ShellCheck + stale pipeline warning"
echo "  pre-push:   bats test suite"
