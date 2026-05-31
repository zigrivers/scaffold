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

@test "guards on beads_usable: .beads + bd>=1.0.5 + jq, never bare [ -d .beads ] && bd" {
  run grep -qE "beads_usable" "$F"; [ "$status" -eq 0 ]
  run grep -qE "1\.0\.5" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "command -v jq" "$F"; [ "$status" -eq 0 ]
}

@test "uses metadata join keys, --all --limit 0, and scoped queries (no --external-ref filter)" {
  run grep -qE "plan_task_id" "$F"; [ "$status" -eq 0 ]
  run grep -qE -e "--has-metadata-key" "$F"; [ "$status" -eq 0 ]
  run grep -qE -e "--all --limit 0" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd list --external-ref" "$F"; [ "$status" -ne 0 ]
}

@test "defines the four reconcile passes incl. duplicate guard and stale reconcile" {
  run grep -qiE "Pass 0a|duplicate guard" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "container upsert|Pass 0b" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "dependency reconcile|Pass 2" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "stale reconcile|Pass 3" "$F"; [ "$status" -eq 0 ]
}

@test "Retire convention orders label before close before unset" {
  run grep -qiE "Retire convention" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "label.*(then|→|before).*close" "$F"; [ "$status" -eq 0 ]
  run grep -qE -e "--unset-metadata" "$F"; [ "$status" -eq 0 ]
}

@test "tracks materializer-owned deps via plan_deps and uses --set-metadata" {
  run grep -qE "plan_deps" "$F"; [ "$status" -eq 0 ]
  run grep -qE -e "--set-metadata" "$F"; [ "$status" -eq 0 ]
}

@test "uses story/epic types directly (no types.custom probe) and bd dep cycles" {
  run grep -qE "\-t story|\-t epic" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd dep cycles" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "types.custom" "$F"; [ "$status" -ne 0 ]
}

@test "emits a deterministic summary line and a run-stamped completion signal" {
  run grep -qiE "materialize:.*created" "$F"; [ "$status" -eq 0 ]
  run grep -qiE "completion signal|materialized_at|run_id|run-stamped" "$F"; [ "$status" -eq 0 ]
}
