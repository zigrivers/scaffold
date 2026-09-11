#!/usr/bin/env bats

setup() {
  WORK=$(mktemp -d)
  mkdir -p "$WORK/bin" "$WORK/content/skills/example/references"
  printf '# Skill\n[Run](references/run.md)\n' > "$WORK/content/skills/example/SKILL.md"
  printf 'Read {{INSTRUCTIONS_FILE}}.\n' > "$WORK/content/skills/example/references/run.md"
  printf '#!/bin/sh\nexit 0\n' > "$WORK/bin/npm"
  printf '#!/bin/sh\nexit 1\n' > "$WORK/bin/node"
  chmod +x "$WORK/bin/npm" "$WORK/bin/node"
  SCRIPT="$BATS_TEST_DIRNAME/../scripts/prepublish.sh"
}

teardown() {
  rm -rf "$WORK"
}

@test "prepublish fallback bundles and resolves linked skill reference pages" {
  cd "$WORK"
  run env PATH="$WORK/bin:$PATH" bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [ -f skills/example/references/run.md ]
  [ "$(cat skills/example/references/run.md)" = 'Read CLAUDE.md.' ]
}
