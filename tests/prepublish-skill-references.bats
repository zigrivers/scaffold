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

@test "prepublish fallback preserves complete output and cleans staging after render failure" {
  cd "$WORK"
  REAL_SED=$(command -v sed)
  cat > "$WORK/bin/sed" <<'SCRIPT'
#!/usr/bin/env bash
if [[ "$2" == */"$FAIL_FILE" ]]; then
  printf 'Incomplete page'
  exit 1
fi
exec "$REAL_SED" "$@"
SCRIPT
  chmod +x "$WORK/bin/sed"
  mkdir -p skills/example/references
  for failed in SKILL.md references/run.md; do
    printf 'Complete entry' > skills/example/SKILL.md
    printf 'Complete reference' > skills/example/references/run.md
    run env PATH="$WORK/bin:$PATH" REAL_SED="$REAL_SED" FAIL_FILE="$failed" bash "$SCRIPT"
    [ "$status" -ne 0 ]
    if [ "$failed" = SKILL.md ]; then
      [ "$(cat skills/example/SKILL.md)" = 'Complete entry' ]
    else
      [ "$(cat skills/example/references/run.md)" = 'Complete reference' ]
    fi
    [ -z "$(find skills -name '.scaffold-publish.*' -print)" ]
  done
}
