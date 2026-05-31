#!/usr/bin/env bats

F="content/pipeline/finalization/materialize-plan-to-beads.md"

@test "materializer file exists" {
  [ -f "$F" ]
}

@test "materializer has correct frontmatter" {
  run grep -qE "^name: materialize-plan-to-beads$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "^phase: \"?finalization\"?$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "^order: 144[0-9]$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "^conditional: \"if-needed\"$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "^stateless: true$" "$F"; [ "$status" -eq 0 ]
  run grep -qE "implementation-playbook" "$F"; [ "$status" -eq 0 ]
}

@test "materializer has Mode Detection and Update Mode blocks" {
  run grep -qiE "## Mode Detection" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "## Update Mode" "$F"; [ "$status" -eq 0 ]
}
