#!/bin/bash
# Install scaffold commands to ~/.claude/commands/
# Usage: ./scripts/install.sh [-f]
#   -f  Force overwrite existing files without prompting

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../commands"
TARGET_DIR="$HOME/.claude/commands"
FORCE=false

if [ "$1" = "-f" ]; then
    FORCE=true
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: commands/ directory not found at $SOURCE_DIR"
    exit 1
fi

mkdir -p "$TARGET_DIR"

count=0
skipped=0

for file in "$SOURCE_DIR"/*.md; do
    filename="$(basename "$file")"

    if [ -f "$TARGET_DIR/$filename" ] && [ "$FORCE" = false ]; then
        echo "Warning: $TARGET_DIR/$filename already exists (use -f to overwrite)"
        skipped=$((skipped + 1))
        continue
    fi

    cp "$file" "$TARGET_DIR/$filename"
    count=$((count + 1))
done

echo ""
echo "Installed $count command(s) to $TARGET_DIR"
if [ "$skipped" -gt 0 ]; then
    echo "Skipped $skipped file(s) — use -f to force overwrite"
fi

# Write version marker
VERSION=$(grep -m1 '^\## \[' "$SCRIPT_DIR/../CHANGELOG.md" 2>/dev/null | sed 's/.*\[\(.*\)\].*/\1/' || echo "unknown")
SHA=$(git -C "$SCRIPT_DIR/.." rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "$VERSION ($SHA)" > "$TARGET_DIR/.scaffold-version"

echo ""
echo "Commands available as /user:<command-name>"
