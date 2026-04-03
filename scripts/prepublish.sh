#!/usr/bin/env bash
set -euo pipefail

echo "Running prepublish checks..."
npm run build
npm test

# Generate resolved skills for plugin auto-discovery
echo "Generating resolved skills..."
node dist/index.js build --root "$(pwd)" 2>/dev/null || {
  echo "Warning: scaffold build failed, generating skills manually..."
  for skill_dir in content/skills/*/; do
    skill_name=$(basename "$skill_dir")
    mkdir -p "skills/$skill_name"
    sed 's/{{INSTRUCTIONS_FILE}}/CLAUDE.md/g' "$skill_dir/SKILL.md" > "skills/$skill_name/SKILL.md"
  done
}

echo "Prepublish checks passed."
