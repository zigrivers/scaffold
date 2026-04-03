#!/usr/bin/env bats
# Eval 1: Channel Parity
# Pipeline and knowledge entries have no duplicates.

setup() {
  load eval_helper
}

@test "no duplicate pipeline step names" {
  local dupes
  dupes="$(grep -rh '^name:' "${PROJECT_ROOT}/content/pipeline/" | sort | uniq -d)"
  if [[ -n "$dupes" ]]; then
    printf "Duplicate pipeline step names:\n%s\n" "$dupes"
    return 1
  fi
}

@test "no duplicate knowledge entry names" {
  local dupes
  dupes="$(grep -rh '^name:' "${PROJECT_ROOT}/content/knowledge/" | sort | uniq -d)"
  if [[ -n "$dupes" ]]; then
    printf "Duplicate knowledge entry names:\n%s\n" "$dupes"
    return 1
  fi
}
