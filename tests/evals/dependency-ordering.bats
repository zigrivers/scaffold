#!/usr/bin/env bats
# Eval 9: Dependency Ordering
# Transitive dependency ordering is consistent — if A depends on B and
# B depends on C, then A's phase must be >= C's phase.

setup() {
  load eval_helper
}

@test "transitive dependency ordering is consistent" {
  local failures=()
  local checked=0

  while IFS= read -r file; do
    local name step_phase step_phase_num
    name="$(extract_field "$file" "name")"
    step_phase="$(extract_field "$file" "phase")"
    step_phase_num="$(get_phase_number "$step_phase")"

    # Get direct dependencies
    local deps
    deps="$(get_dep_refs "$file" 2>/dev/null || true)"
    [[ -z "$deps" ]] && continue

    # For each direct dep, check THEIR deps (one level of transitivity)
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      local dep_file
      dep_file="$(find "${PROJECT_ROOT}/content/pipeline" -name "${dep}.md" -type f | head -1)"
      [[ -z "$dep_file" ]] && continue

      local transitive_deps
      transitive_deps="$(get_dep_refs "$dep_file" 2>/dev/null || true)"
      [[ -z "$transitive_deps" ]] && continue

      while IFS= read -r trans_dep; do
        [[ -z "$trans_dep" ]] && continue
        local trans_file
        trans_file="$(find "${PROJECT_ROOT}/content/pipeline" -name "${trans_dep}.md" -type f | head -1)"
        [[ -z "$trans_file" ]] && continue

        local trans_phase trans_phase_num
        trans_phase="$(extract_field "$trans_file" "phase")"
        trans_phase_num="$(get_phase_number "$trans_phase")"

        checked=$((checked + 1))

        # Step's phase should be >= transitive dep's phase
        if [ "$step_phase_num" -lt "$trans_phase_num" ]; then
          failures+=("${name} (phase ${step_phase_num}) transitively depends on ${trans_dep} (phase ${trans_phase_num}) — ordering violation")
        fi
      done <<< "$transitive_deps"
    done <<< "$deps"
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Transitive dependency ordering failures (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}

@test "no dependency creates a cycle through transitive chain" {
  local failures=()
  local checked=0

  while IFS= read -r file; do
    local start_name
    start_name="$(extract_field "$file" "name")"

    # Walk the dependency chain up to 15 levels deep
    local current_deps
    current_deps="$(get_dep_refs "$file" 2>/dev/null || true)"
    [[ -z "$current_deps" ]] && continue

    local visited="$start_name"
    local depth=0
    local queue="$current_deps"

    while [[ -n "$queue" && "$depth" -lt 15 ]]; do
      local next_queue=""
      while IFS= read -r dep; do
        [[ -z "$dep" ]] && continue
        checked=$((checked + 1))

        # Check if we've cycled back to the start
        if [[ "$dep" == "$start_name" ]]; then
          failures+=("${start_name}: cycle detected at depth ${depth}")
          break 2
        fi

        # Check if already visited (avoid infinite loops)
        if echo "$visited" | grep -qw "$dep"; then
          continue
        fi
        visited="$visited $dep"

        # Get this dep's deps for next iteration
        local dep_file
        dep_file="$(find "${PROJECT_ROOT}/content/pipeline" -name "${dep}.md" -type f | head -1)"
        [[ -z "$dep_file" ]] && continue

        local sub_deps
        sub_deps="$(get_dep_refs "$dep_file" 2>/dev/null || true)"
        [[ -n "$sub_deps" ]] && next_queue="${next_queue}
${sub_deps}"
      done <<< "$queue"

      queue="$(echo "$next_queue" | grep -v '^$' || true)"
      depth=$((depth + 1))
    done
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Transitive cycle failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
