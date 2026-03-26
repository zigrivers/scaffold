#!/usr/bin/env bats
# Eval 1: Channel Parity
# Every pipeline step has a matching command file.

setup() {
  load eval_helper
}

# Pipeline steps that are intentionally command-free (none currently)
PIPELINE_EXEMPT=()

# Commands that are utility/execution (no pipeline step expected)
COMMAND_EXEMPT=(
  "single-agent-start"
  "single-agent-resume"
  "multi-agent-start"
  "multi-agent-resume"
  "dashboard"
  "knowledge"
  "prompt-pipeline"
  "session-analyzer"
  "update"
  "version"
  "version-bump"
  "release"
  "quick-task"
  "new-enhancement"
  "prd-gap-analysis"
  "user-stories-gaps"
)

is_exempt() {
  local name="$1"
  shift
  local list=("$@")
  for exempt in "${list[@]}"; do
    [[ "$name" == "$exempt" ]] && return 0
  done
  return 1
}

@test "every pipeline step has a matching command file" {
  local missing=()
  while IFS= read -r name; do
    is_exempt "$name" "${PIPELINE_EXEMPT[@]}" && continue
    if [[ ! -f "${PROJECT_ROOT}/commands/${name}.md" ]]; then
      missing+=("$name")
    fi
  done <<< "$(get_pipeline_names)"

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "Pipeline steps missing commands:\n"
    printf "  %s\n" "${missing[@]}"
    return 1
  fi
}

@test "every non-exempt command has a matching pipeline step" {
  local pipeline_names
  pipeline_names="$(get_pipeline_names)"
  local missing=()

  for cmd_file in "${PROJECT_ROOT}"/commands/*.md; do
    local slug
    slug="$(basename "$cmd_file" .md)"
    is_exempt "$slug" "${COMMAND_EXEMPT[@]}" && continue
    if ! echo "$pipeline_names" | grep -qx "$slug"; then
      missing+=("$slug")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "Commands missing pipeline steps:\n"
    printf "  %s\n" "${missing[@]}"
    return 1
  fi
}

@test "no duplicate pipeline step names" {
  local dupes
  dupes="$(grep -rh '^name:' "${PROJECT_ROOT}/pipeline/" | sort | uniq -d)"
  if [[ -n "$dupes" ]]; then
    printf "Duplicate pipeline step names:\n%s\n" "$dupes"
    return 1
  fi
}

@test "no duplicate knowledge entry names" {
  local dupes
  dupes="$(grep -rh '^name:' "${PROJECT_ROOT}/knowledge/" | sort | uniq -d)"
  if [[ -n "$dupes" ]]; then
    printf "Duplicate knowledge entry names:\n%s\n" "$dupes"
    return 1
  fi
}
