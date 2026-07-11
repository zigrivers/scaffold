#!/usr/bin/env bats

DEEP="content/methodology/deep.yml"
MVP="content/methodology/mvp.yml"
CUSTOM="content/methodology/custom-defaults.yml"
MULTISVC="content/methodology/multi-service-overlay.yml"
MCP="content/methodology/mcp-server-overlay.yml"

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

@test "mvp.yml keeps beads enabled (mvp floor, D5)" {
  # The mvp floor guarantees the Beads tracker + worktree ops are available.
  run grep -qE "^\s*beads: \{ enabled: true" "$MVP"
  [ "$status" -eq 0 ]
}

@test "mvp.yml keeps git-workflow enabled (mvp floor, D5)" {
  # git-workflow installs the agent-ops worktree scripts /work-beads depends on.
  run grep -qE "^\s*git-workflow: \{ enabled: true \}" "$MVP"
  [ "$status" -eq 0 ]
}

@test "multi-service overlay enables staging-environments (if-needed)" {
  # Archetypal case: a multi-service monorepo needs per-worktree Docker staging.
  run grep -qE "^\s*staging-environments: \{ enabled: true, conditional: \"if-needed\" \}" "$MULTISVC"
  [ "$status" -eq 0 ]
}

@test "mcp-server overlay disables staging-environments" {
  # A single-process MCP server does not need a per-worktree container stack.
  run grep -qE "^\s*staging-environments: \{ enabled: false \}" "$MCP"
  [ "$status" -eq 0 ]
}
