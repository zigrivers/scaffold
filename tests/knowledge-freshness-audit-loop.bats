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
