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

@test "mvp.yml lists materialize-plan-to-beads disabled" {
  run grep -qE "^\s*materialize-plan-to-beads: \{ enabled: false \}" "$MVP"
  [ "$status" -eq 0 ]
}
