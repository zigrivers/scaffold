#!/bin/bash
# Remove scaffold commands from ~/.claude/commands/
# Only removes known scaffold files — won't touch other commands.

set -e

TARGET_DIR="$HOME/.claude/commands"

# Hardcoded list of the 25 known scaffold command files
FILES=(
    "create-prd.md"
    "prd-gap-analysis.md"
    "beads.md"
    "tech-stack.md"
    "claude-code-permissions.md"
    "coding-standards.md"
    "tdd.md"
    "project-structure.md"
    "dev-env-setup.md"
    "design-system.md"
    "git-workflow.md"
    "multi-model-review.md"
    "add-playwright.md"
    "add-maestro.md"
    "user-stories.md"
    "user-stories-gaps.md"
    "platform-parity-review.md"
    "claude-md-optimization.md"
    "workflow-audit.md"
    "implementation-plan.md"
    "implementation-plan-review.md"
    "single-agent-start.md"
    "single-agent-resume.md"
    "new-enhancement.md"
    "prompt-pipeline.md"
)

count=0

for filename in "${FILES[@]}"; do
    filepath="$TARGET_DIR/$filename"
    if [ -f "$filepath" ]; then
        rm "$filepath"
        count=$((count + 1))
    fi
done

echo "Removed $count scaffold command(s) from $TARGET_DIR"
