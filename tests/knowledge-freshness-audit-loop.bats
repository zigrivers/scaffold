#!/usr/bin/env bats
# Tests the audit-loop script with a stubbed `node`.
# The script lives at scripts/knowledge-freshness-audit-loop.sh.

setup() {
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/bin"
  export PATH="$TMP/bin:$PATH"
  export CANDIDATES_FILE="$TMP/candidates.json"
}
teardown() { rm -rf "$TMP"; }

@test "a skip envelope continues without failing the job" {
  printf '[{"name":"a","path":"a.md"}]\n' > "$CANDIDATES_FILE"
  cat > "$TMP/bin/node" <<'EOF'
#!/usr/bin/env bash
echo '{"skipped":true,"reason":"source-unusable","url":"u","detail":"stub"}'
EOF
  chmod +x "$TMP/bin/node"
  run bash scripts/knowledge-freshness-audit-loop.sh "$CANDIDATES_FILE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"skip a"* ]]
}

@test "a non-zero audit exit fails the job (not swallowed)" {
  printf '[{"name":"a","path":"a.md"}]\n' > "$CANDIDATES_FILE"
  cat > "$TMP/bin/node" <<'EOF'
#!/usr/bin/env bash
echo "boom" >&2
exit 1
EOF
  chmod +x "$TMP/bin/node"
  run bash scripts/knowledge-freshness-audit-loop.sh "$CANDIDATES_FILE"
  [ "$status" -ne 0 ]
}

@test "F3: audit-apply dry-run failure restores the file (git checkout called before continue)" {
  # Verify the script calls `git checkout -- <path>` when the pre-gates dry-run audit-apply fails.
  # We stub both `node` and `git`, and track whether `git checkout` was called.
  ENTRY="$TMP/entry.md"
  printf 'original content\n' > "$ENTRY"
  printf '[{"name":"x","path":"%s"}]\n' "$ENTRY" > "$CANDIDATES_FILE"

  GIT_CALLS="$TMP/git-calls.log"
  touch "$GIT_CALLS"

  # `node` stubs:
  #   - audit-run-entry → valid non-skipped verdict with a known verdict value
  #   - audit-apply (dry-run, no --open-pr) → exit 1 (simulates failure)
  cat > "$TMP/bin/node" <<EOF
#!/usr/bin/env bash
# Detect which sub-command is being run by scanning the argument list.
for arg in "\$@"; do
  case "\$arg" in
    audit-run-entry)
      echo '{"verdict":"current","entry_name":"x","sources_checked":[]}'
      exit 0
      ;;
    audit-apply)
      # If --open-pr is present this is the real apply; we should not reach it.
      for a in "\$@"; do [ "\$a" = "--open-pr" ] && { echo "unexpectedly reached --open-pr"; exit 1; }; done
      # Pre-gates dry-run → fail
      exit 1
      ;;
  esac
done
# Fallback for other node calls (validate-knowledge etc.) — succeed silently.
exit 0
EOF
  chmod +x "$TMP/bin/node"

  # Stub `git` so we can record calls without touching a real repo.
  cat > "$TMP/bin/git" <<EOF
#!/usr/bin/env bash
echo "git \$*" >> "$GIT_CALLS"
# checkout -- <path> → restore "original content" (simulates git restoring the file)
if [ "\$1" = "checkout" ] && [ "\$2" = "--" ]; then
  printf 'original content\n' > "\$3"
fi
exit 0
EOF
  chmod +x "$TMP/bin/git"

  run bash scripts/knowledge-freshness-audit-loop.sh "$CANDIDATES_FILE"
  # Job should succeed (dry-run failure is non-fatal, just skips the entry).
  [ "$status" -eq 0 ]
  # git checkout -- <path> must have been called to restore the dirty file.
  grep -q "checkout -- $ENTRY" "$GIT_CALLS"
}
