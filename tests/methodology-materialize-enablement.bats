#!/usr/bin/env bats

DEEP="content/methodology/deep.yml"
MVP="content/methodology/mvp.yml"
CUSTOM="content/methodology/custom-defaults.yml"

@test "deep.yml enables materialize-plan-to-beads as conditional if-needed" {
  run grep -qE "^\s*materialize-plan-to-beads: \{ enabled: true, conditional: \"if-needed\" \}" "$DEEP"
  [ "$status" -eq 0 ]
}

@test "custom-defaults.yml enables materialize-plan-to-beads as conditional if-needed" {
  run grep -qE "^\s*materialize-plan-to-beads: \{ enabled: true, conditional: \"if-needed\" \}" "$CUSTOM"
  [ "$status" -eq 0 ]
}

@test "mvp.yml enables materialize-plan-to-beads as conditional if-needed" {
  # D5 (spec 2026-07-10): mvp floor raised — materialize-plan-to-beads is
  # enabled (conditional if-needed) in every preset, not just deep/custom.
  run grep -qE "^\s*materialize-plan-to-beads: \{ enabled: true, conditional: \"if-needed\" \}" "$MVP"
  [ "$status" -eq 0 ]
}
