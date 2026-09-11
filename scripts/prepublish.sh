#!/usr/bin/env bash
set -euo pipefail

echo "Running prepublish checks..."
npm run build
npm test

# Generate resolved skills for plugin auto-discovery
echo "Generating resolved skills..."
node dist/index.js build --root "$(pwd)" 2>/dev/null || {
  echo "Warning: scaffold build failed, generating skills manually..."
  render_skill_file() {
    local source_file="$1" destination="$2" temporary_dir
    temporary_dir=$(mktemp -d "$(dirname "$destination")/.scaffold-publish.XXXXXX") || return 1
    if sed 's/{{INSTRUCTIONS_FILE}}/CLAUDE.md/g' "$source_file" > "$temporary_dir/content.tmp" &&
      mv "$temporary_dir/content.tmp" "$destination"; then
      rmdir "$temporary_dir"
    else
      rm -f "$temporary_dir/content.tmp"
      rmdir "$temporary_dir"
      return 1
    fi
  }
  for skill_dir in content/skills/*/; do
    skill_name=$(basename "$skill_dir")
    mkdir -p "skills/$skill_name"
    render_skill_file "$skill_dir/SKILL.md" "skills/$skill_name/SKILL.md"
    for reference in "$skill_dir"references/*.md; do
      [ -f "$reference" ] || continue
      mkdir -p "skills/$skill_name/references"
      render_skill_file "$reference" "skills/$skill_name/references/$(basename "$reference")"
    done
  done
}

echo "Prepublish checks passed."
