#!/usr/bin/env bats
# tests/agent-ops-gate-affected.bats — generated affected-gate seed (mq contract).

setup() {
  TMP="$(mktemp -d)"
  cd "$TMP"
  git init -q -b main .
  git config user.email t@t.t
  git config user.name t
  mkdir -p scripts .mq
  sed -e 's|{{DEFAULT_BRANCH}}|main|g' \
      -e 's|{{GATE_ENSURE_DEPS}}|:|g' \
      -e 's|{{GATE_AFFECTED_INVOCATION}}|touch .affected-ran; printf "%s " "${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}" > .exclude-args|g' \
      -e 's|{{GATE_TIA_INVOCATION}}|printf "%s" "$TIA_TESTS" > .tia-tests; touch .tia-ran|g' \
    "$BATS_TEST_DIRNAME/../content/assets/agent-ops/gate/gate-check-affected.sh.tmpl" \
    > scripts/gate-check-affected.sh
  chmod +x scripts/gate-check-affected.sh
  cat > scripts/gate-check.sh <<'EOF'
#!/usr/bin/env bash
if [ "${GATE_PROBE:-0}" = "1" ]; then touch .probe-delegated; exit 0; fi
touch .full-ran
EOF
  chmod +x scripts/gate-check.sh
  echo base > app.txt
  git add -A && git commit -qm base
  git checkout -qb feat
}

teardown() { rm -rf "$TMP"; }

@test "source change on the branch runs the affected selection" {
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .affected-ran ]
  [ ! -f .full-ran ]
}

@test "infra change (package.json) forces the FULL gate" {
  echo '{}' > package.json && git add -A && git commit -qm deps
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [ ! -f .affected-ran ]
  [[ "$output" == *"infra change"* ]]
}

@test "nested infra change (packages/app/vitest.config.ts) forces the FULL gate in a monorepo" {
  mkdir -p packages/app
  echo 'export default {}' > packages/app/vitest.config.ts
  git add -A && git commit -qm nested-config
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [ ! -f .affected-ran ]
  [[ "$output" == *"infra change"* ]]
}

@test "nested migrations change (packages/api/migrations/002.rb) forces the FULL gate in a monorepo" {
  mkdir -p packages/api/migrations
  echo 'class M; end' > packages/api/migrations/002.rb
  git add -A && git commit -qm nested-migration
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [ ! -f .affected-ran ]
  [[ "$output" == *"infra change"* ]]
}

@test "nested shared test-utils change (packages/web/src/test-utils/x.ts) forces the FULL gate" {
  mkdir -p packages/web/src/test-utils
  echo 'export const x = 1' > packages/web/src/test-utils/x.ts
  git add -A && git commit -qm nested-testutils
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [ ! -f .affected-ran ]
  [[ "$output" == *"infra change"* ]]
}

@test "empty diff against base forces the FULL gate, never zero tests" {
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [[ "$output" == *"empty diff"* ]]
}

@test "unresolvable base ref forces the FULL gate" {
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=origin/does-not-exist run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [[ "$output" == *"base ref"* ]]
}

@test "quarantined ids become --exclude args for the merge gate" {
  echo change >> app.txt && git commit -qam change
  printf 'tests/flaky.test.ts\n' > .mq/quarantine.txt
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .affected-ran ]
  grep -q -- '--exclude tests/flaky.test.ts' .exclude-args
}

@test "GATE_PROBE=1 delegates to gate-check.sh probe mode without selecting" {
  echo change >> app.txt && git commit -qam change
  GATE_PROBE=1 MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .probe-delegated ]
  [ ! -f .affected-ran ]
  [ ! -f .full-ran ]
}

@test "uses a three-dot diff (base advancing does not force selection of base-side files)" {
  echo change >> app.txt && git commit -qam change
  git checkout -q main
  echo '{}' > package.json && git add -A && git commit -qm base-moved  # infra file lands on BASE
  git checkout -q feat
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  # two-dot would see base's package.json and force full; three-dot must not
  [ -f .affected-ran ]
  [ ! -f .full-ran ]
}

@test "TIA layer: a selection runs the TIA invocation, not the runner selection" {
  mkdir -p stub-bin .mq/tia
  echo '{}' > .mq/tia/map.json
  cat > stub-bin/scaffold <<'STUB'
#!/usr/bin/env bash
if [ "$1 $2" = "tia affected" ]; then echo tests/picked.test.ts; exit 0; fi
exit 0
STUB
  chmod +x stub-bin/scaffold
  export MQ_SCAFFOLD_BIN="$PWD/stub-bin/scaffold"
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .tia-ran ]
  grep -q 'tests/picked.test.ts' .tia-tests
  [ ! -f .affected-ran ]
  [ ! -f .full-ran ]
}

@test "TIA layer: exit 3 (stale / low confidence) falls back to the FULL suite" {
  mkdir -p stub-bin .mq/tia
  echo '{}' > .mq/tia/map.json
  cat > stub-bin/scaffold <<'STUB'
#!/usr/bin/env bash
if [ "$1 $2" = "tia affected" ]; then exit 3; fi
exit 0
STUB
  chmod +x stub-bin/scaffold
  export MQ_SCAFFOLD_BIN="$PWD/stub-bin/scaffold"
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [ ! -f .tia-ran ]
  [ ! -f .affected-ran ]
  [[ "$output" == *"TIA recommends the full suite"* ]]
}

@test "TIA layer: no coverage map leaves the runner-selection layer in charge" {
  mkdir -p stub-bin
  printf '#!/usr/bin/env bash\nexit 0\n' > stub-bin/scaffold
  chmod +x stub-bin/scaffold
  export MQ_SCAFFOLD_BIN="$PWD/stub-bin/scaffold"
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .affected-ran ]
  [ ! -f .tia-ran ]
}
