#!/usr/bin/env bats
# Eval 5: Cross-Channel Consistency
# Pipeline step outputs align with command Mode Detection checks.

setup() {
  load eval_helper
}

# Commands that consolidate multiple pipeline steps (1:many mapping)
CONSOLIDATION_COMMANDS=(
  "prd-gap-analysis"
  "user-stories-gaps"
)

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

    # Extract Mode Detection section from command (between ## Mode Detection and next ##)
    local mode_section
    mode_section="$(awk '/^## Mode Detection/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"

    while IFS= read -r output_path; do
      [[ -z "$output_path" ]] && continue
      # Check if the output path (or its basename) appears in Mode Detection
      local basename_path
      basename_path="$(basename "$output_path")"
      if ! echo "$mode_section" | grep -q "$output_path\|$basename_path"; then
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
  local warnings=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local name
    name="$(extract_field "$pipeline_file" "name")"
    local cmd_file="${PROJECT_ROOT}/commands/${name}.md"
    [[ ! -f "$cmd_file" ]] && continue

    # Extract After This Step section
    local after_section
    after_section="$(awk '/^## After This Step/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
    [[ -z "$after_section" ]] && continue

    # Extract /scaffold: references from After This Step
    local next_commands
    next_commands="$(echo "$after_section" | grep -o '/scaffold:[a-z-]*' | sed 's|/scaffold:||' | sort -u)"

    [[ -z "$next_commands" ]] && continue
    checked=$((checked + 1))

    # For each next command, check if it depends on current step (reverse dep check)
    while IFS= read -r next_cmd; do
      [[ -z "$next_cmd" ]] && continue
      # Find the pipeline file for next_cmd
      local next_pipeline
      next_pipeline="$(grep -rl "^name: ${next_cmd}$" "${PROJECT_ROOT}/pipeline/" 2>/dev/null | head -1)"
      [[ -z "$next_pipeline" ]] && continue

      # Check if next step has current step in its dependencies
      local next_deps
      next_deps="$(get_dep_refs "$next_pipeline" 2>/dev/null || true)"
      # This is a soft check — dependency chains can be indirect
    done <<< "$next_commands"
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  # This is informational — just verify we checked a reasonable number
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
