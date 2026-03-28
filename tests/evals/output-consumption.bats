#!/usr/bin/env bats
# Eval 8: Output Consumption
# Pipeline step outputs that feed other steps are actually referenced downstream.
# Terminal outputs (reviews, validation, finalization) are exempt.

setup() {
  load eval_helper
}

# Steps whose outputs are terminal (consumed by the user, not pipeline).
# Review, validation, and finalization steps produce docs for humans.
TERMINAL_OUTPUT_EXEMPT=(
  "implementation-plan"
  "developer-onboarding-guide"
  "session-handoff-brief"
  "implementation-playbook"
  "apply-fixes-and-freeze"
  "ai-memory-setup"
  "automated-pr-review"
  "beads"
  "create-evals"
)

# Output path patterns that are terminal by nature
TERMINAL_PATH_PATTERNS=(
  "docs/reviews/"
  "docs/validation/"
  "docs/user-stories-innovation"
  "maestro/"
  ".beads/"
  "AGENTS.md"
)

is_terminal_exempt() {
  local name="$1"
  for exempt in "${TERMINAL_OUTPUT_EXEMPT[@]}"; do
    [[ "$name" == "$exempt" ]] && return 0
  done
  return 1
}

is_terminal_path() {
  local path="$1"
  for pattern in "${TERMINAL_PATH_PATTERNS[@]}"; do
    [[ "$path" == *"$pattern"* ]] && return 0
  done
  return 1
}

@test "non-terminal pipeline outputs are referenced by at least one downstream step" {
  local failures=()
  local checked=0

  while IFS= read -r file; do
    local name outputs_raw
    name="$(extract_field "$file" "name")"
    is_terminal_exempt "$name" && continue

    outputs_raw="$(extract_field "$file" "outputs" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//')"
    [[ -z "$outputs_raw" ]] && continue

    while IFS= read -r output_path; do
      [[ -z "$output_path" ]] && continue
      is_terminal_path "$output_path" && continue

      local basename_path
      basename_path="$(basename "$output_path")"
      local found=false

      # Search all OTHER pipeline steps for references to this output
      while IFS= read -r other_file; do
        local other_name
        other_name="$(extract_field "$other_file" "name")"
        [[ "$other_name" == "$name" ]] && continue

        if grep -q "$output_path\|$basename_path" "$other_file"; then
          found=true
          break
        fi
      done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

      if [[ "$found" == "false" ]]; then
        failures+=("${name}: output '${output_path}' not referenced by any downstream step")
      fi
      checked=$((checked + 1))
    done <<< "$outputs_raw"
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Unconsumed outputs (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}

@test "pipeline step reads fields reference valid step names" {
  local pipeline_names
  pipeline_names="$(get_pipeline_names)"
  local failures=()
  local checked=0

  while IFS= read -r file; do
    local reads_raw
    reads_raw="$(extract_field "$file" "reads" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//')"
    [[ -z "$reads_raw" ]] && continue

    while IFS= read -r read_ref; do
      [[ -z "$read_ref" ]] && continue
      checked=$((checked + 1))

      # reads field contains step names, not file paths
      if ! echo "$pipeline_names" | grep -qx "$read_ref"; then
        failures+=("$(basename "$file"): reads '${read_ref}' is not a valid pipeline step name")
      fi
    done <<< "$reads_raw"
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Invalid reads references (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
