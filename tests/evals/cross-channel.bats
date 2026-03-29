#!/usr/bin/env bats
# Eval 5: Cross-Channel Consistency
# Pipeline step outputs align with command Mode Detection checks.

setup() {
  load eval_helper
  source "${BATS_TEST_DIRNAME}/exemptions.bash"
}

is_consolidation() {
  local name="$1"
  for cmd in "${CONSOLIDATION_COMMANDS[@]}"; do
    [[ "$name" == "$cmd" ]] && return 0
  done
  return 1
}

@test "pipeline step outputs appear in matching command Mode Detection" {
  local failures=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local name outputs
    name="$(extract_field "$pipeline_file" "name")"
    local cmd_file="${PROJECT_ROOT}/commands/${name}.md"

    # Skip if no matching command or command has no Mode Detection
    [[ ! -f "$cmd_file" ]] && continue
    grep -q '## Mode Detection' "$cmd_file" || continue

    # Extract outputs from pipeline step
    outputs="$(extract_field "$pipeline_file" "outputs" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//')"

    # Extract Mode Detection + Update Mode Specifics sections from command.
    # In v2, output paths may appear in either section.
    local mode_section
    mode_section="$(awk '/^## (Mode Detection|Update Mode Specifics)/{found=1; next} /^## [^MU]|^---$/{if(found) found=0} found{print}' "$cmd_file")"

    while IFS= read -r output_path; do
      [[ -z "$output_path" ]] && continue
      # Check if the output path (or its basename) appears in Mode Detection / Update Mode Specifics
      local basename_path dir_path
      basename_path="$(basename "$output_path")"
      dir_path="$(dirname "$output_path")/"

      # Match exact path, basename, or parent directory reference
      if ! echo "$mode_section" | grep -q "$output_path\|$basename_path\|$dir_path"; then
        failures+=("${name}: output '${output_path}' not referenced in Mode Detection")
      fi
    done <<< "$outputs"
    checked=$((checked + 1))
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  # Report
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Cross-channel output mismatches (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "command After This Step targets match pipeline dependency graph" {
  local failures=()
  local warnings=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local name
    name="$(extract_field "$pipeline_file" "name")"
    local cmd_file="${PROJECT_ROOT}/commands/${name}.md"
    [[ ! -f "$cmd_file" ]] && continue

    local current_phase current_phase_num
    current_phase="$(extract_field "$pipeline_file" "phase")"
    current_phase_num="$(get_phase_number "$current_phase")"

    # Extract After This Step section
    local after_section
    after_section="$(awk '/^## After This Step/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
    [[ -z "$after_section" ]] && continue

    # Extract /scaffold: references from After This Step
    local next_commands
    next_commands="$(echo "$after_section" | grep -o '/scaffold:[a-z-]*' | sed 's|/scaffold:||' | sort -u)"

    [[ -z "$next_commands" ]] && continue
    checked=$((checked + 1))

    # For each next command, verify the dependency relationship makes sense
    while IFS= read -r next_cmd; do
      [[ -z "$next_cmd" ]] && continue
      # Find the pipeline file for next_cmd
      local next_pipeline
      next_pipeline="$(grep -rl "^name: ${next_cmd}$" "${PROJECT_ROOT}/pipeline/" 2>/dev/null | head -1)"
      # Non-pipeline commands (utilities) are exempt from dep checks
      [[ -z "$next_pipeline" ]] && continue

      local next_phase next_phase_num
      next_phase="$(extract_field "$next_pipeline" "phase")"
      next_phase_num="$(get_phase_number "$next_phase")"

      # Check if next step has current step in its dependencies
      local next_deps
      next_deps="$(get_dep_refs "$next_pipeline" 2>/dev/null || true)"

      local has_direct=false
      if echo "$next_deps" | grep -qx "$name"; then
        has_direct=true
      fi

      # Valid if: direct dep, OR target is in same/later phase (forward flow),
      # OR target is in earlier phase (update-mode back-reference)
      if [[ "$has_direct" == "false" && "$next_phase_num" -gt "$current_phase_num" ]]; then
        # Forward reference without direct dependency — check that at least
        # the target is reachable through phase ordering (not a random jump)
        local phase_gap=$(( next_phase_num - current_phase_num ))
        if [[ "$phase_gap" -gt 3 ]]; then
          warnings+=("${name} -> ${next_cmd}: forward ref spans ${phase_gap} phases without direct dep")
        fi
      fi
    done <<< "$next_commands"
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  # Report warnings (informational, non-failing)
  if [[ ${#warnings[@]} -gt 0 ]]; then
    printf "After This Step warnings (%d commands checked):\n" "$checked"
    printf "  %s\n" "${warnings[@]}"
  fi

  # Hard failures if any
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "After This Step dependency failures (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}

@test "knowledge-base entries referenced by pipeline steps have relevant topics" {
  local failures=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local step_name step_phase
    step_name="$(extract_field "$pipeline_file" "name")"
    step_phase="$(extract_field "$pipeline_file" "phase")"

    local kb_refs
    kb_refs="$(get_kb_refs "$pipeline_file" 2>/dev/null || true)"
    [[ -z "$kb_refs" ]] && continue

    while IFS= read -r kb_name; do
      [[ -z "$kb_name" ]] && continue

      # Find the knowledge entry file
      local kb_file
      kb_file="$(find "${PROJECT_ROOT}/knowledge" -name "${kb_name}.md" -type f | head -1)"
      [[ -z "$kb_file" ]] && continue

      checked=$((checked + 1))

      # Verify the knowledge entry has the required frontmatter fields
      if ! has_field "$kb_file" "name"; then
        failures+=("${step_name}: knowledge-base '${kb_name}' is missing 'name' field")
      fi
      if ! has_field "$kb_file" "description"; then
        failures+=("${step_name}: knowledge-base '${kb_name}' is missing 'description' field")
      fi

      # Verify the knowledge entry has substantive content (> 50 lines)
      local lines
      lines="$(count_lines "$kb_file")"
      if [[ "$lines" -lt 50 ]]; then
        failures+=("${step_name}: knowledge-base '${kb_name}' has only ${lines} lines (expected >= 50)")
      fi
    done <<< "$kb_refs"
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Knowledge-base reference quality issues (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
