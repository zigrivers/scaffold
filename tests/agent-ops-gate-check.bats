#!/usr/bin/env bats
# tests/agent-ops-gate-check.bats — generated full-gate seed (gate component).

setup() {
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/scripts"
  render() { # $1=ensure_deps $2=runtime_probes $3=probe_cmds $4=full_cmds
    sed -e "s|{{GATE_ENSURE_DEPS}}|$1|g" \
        -e "s|{{GATE_RUNTIME_PROBES}}|$2|g" \
        -e "s|{{GATE_PROBE_COMMANDS}}|$3|g" \
        -e "s|{{GATE_FULL_COMMANDS}}|$4|g" \
      "$BATS_TEST_DIRNAME/../content/assets/agent-ops/gate/gate-check.sh.tmpl" \
      > "$TMP/scripts/gate-check.sh"
    chmod +x "$TMP/scripts/gate-check.sh"
  }
  render ":" "touch runtime-probed" "touch probe-cmds-ran" "touch full-ran"
}

teardown() { rm -rf "$TMP"; }

@test "GATE_PROBE=1 runs prerequisites but NOT the suite, and says so" {
  cd "$TMP"
  GATE_PROBE=1 run "$TMP/scripts/gate-check.sh"
  [ "$status" -eq 0 ]
  [ -f "$TMP/runtime-probed" ]
  [ -f "$TMP/probe-cmds-ran" ]
  [ ! -f "$TMP/full-ran" ]
  [[ "$output" == *"suite not run"* ]]
}

@test "GATE_PROBE=1 does NOT install dependencies (read-only health check)" {
  cd "$TMP"
  render "touch deps-installed" "touch runtime-probed" ":" "touch full-ran"
  GATE_PROBE=1 run "$TMP/scripts/gate-check.sh"
  [ "$status" -eq 0 ]
  [ ! -f "$TMP/deps-installed" ]     # ensure-deps skipped under the probe
  [ -f "$TMP/runtime-probed" ]        # functional runtime probes still run
  [ ! -f "$TMP/full-ran" ]
}

@test "full mode installs deps, runs runtime probes, then the full commands" {
  cd "$TMP"
  render "touch deps-installed" "touch runtime-probed" ":" "touch full-ran"
  run "$TMP/scripts/gate-check.sh"
  [ "$status" -eq 0 ]
  [ -f "$TMP/deps-installed" ]        # ensure-deps runs in full mode
  [ -f "$TMP/runtime-probed" ]
  [ -f "$TMP/full-ran" ]
}

@test "a failing full command fails the gate" {
  cd "$TMP"
  render ":" ":" ":" "false"
  run "$TMP/scripts/gate-check.sh"
  [ "$status" -ne 0 ]
}

@test "a failing runtime probe fails even probe mode (functional check, not command -v)" {
  cd "$TMP"
  render ":" "false" ":" "touch full-ran"
  GATE_PROBE=1 run "$TMP/scripts/gate-check.sh"
  [ "$status" -ne 0 ]
  [ ! -f "$TMP/full-ran" ]
}

@test "runs from the repo root regardless of caller cwd" {
  mkdir -p "$TMP/elsewhere"
  cd "$TMP/elsewhere"
  run "$TMP/scripts/gate-check.sh"
  [ "$status" -eq 0 ]
  [ -f "$TMP/full-ran" ]
  [ ! -f "$TMP/elsewhere/full-ran" ]
}
