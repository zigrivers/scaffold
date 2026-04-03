#!/usr/bin/env bats
# Eval 5: Cross-Channel Consistency
# Knowledge-base entries referenced by pipeline steps meet quality standards.

setup() {
  load eval_helper
  source "${BATS_TEST_DIRNAME}/exemptions.bash"
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
      kb_file="$(find "${PROJECT_ROOT}/content/knowledge" -name "${kb_name}.md" -type f | head -1)"
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
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Knowledge-base reference quality issues (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
