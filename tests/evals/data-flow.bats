#!/usr/bin/env bats
# Eval 11: Data Flow Validation
# Pipeline step reads fields should reference steps reachable through
# the transitive dependency closure.

setup() {
  load eval_helper
  source "${BATS_TEST_DIRNAME}/exemptions.bash"
}

# Build the transitive closure of dependencies for a given step name.
# Outputs one step name per line (including the step itself).
get_transitive_deps() {
  local start_name="$1"
  local visited=""
  local queue="$start_name"

  while [[ -n "$queue" ]]; do
    local current="${queue%%$'\n'*}"
    if [[ "$current" == "$queue" ]]; then
      queue=""
    else
      queue="${queue#*$'\n'}"
    fi

    [[ -z "$current" ]] && continue
    echo "$visited" | grep -qx "$current" && continue
    visited="${visited}${visited:+$'\n'}${current}"

    local dep_file
    dep_file="$(find "${PROJECT_ROOT}/content/pipeline" -name "${current}.md" -type f | head -1)"
    [[ -z "$dep_file" ]] && continue

    local deps
    deps="$(get_dep_refs "$dep_file" 2>/dev/null || true)"
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      if ! echo "$visited" | grep -qx "$dep"; then
        queue="${queue}${queue:+$'\n'}${dep}"
      fi
    done <<< "$deps"
  done

  echo "$visited"
}

@test "reads fields reference steps reachable through transitive dependencies or phase ordering" {
  local violations=()
  local checked=0

  while IFS= read -r file; do
    local name reads_raw
    name="$(extract_field "$file" "name")"

    reads_raw="$(extract_field "$file" "reads" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' || true)"
    [[ -z "$reads_raw" ]] && continue

    local trans_deps
    trans_deps="$(get_transitive_deps "$name")"

    local reader_phase reader_phase_num
    reader_phase="$(extract_field "$file" "phase")"
    reader_phase_num="$(get_phase_number "$reader_phase")"

    while IFS= read -r read_ref; do
      [[ -z "$read_ref" ]] && continue
      checked=$((checked + 1))

      # Already in transitive closure — OK
      if echo "$trans_deps" | grep -qx "$read_ref"; then
        continue
      fi

      # Check exemption list (legitimate phase-ordering reads)
      if is_phase_ordering_exempt "$name" "$read_ref"; then
        continue
      fi

      # Check implicit phase ordering: target must be in same or earlier phase
      local target_file target_phase target_phase_num
      target_file="$(find "${PROJECT_ROOT}/content/pipeline" -name "${read_ref}.md" -type f | head -1)"
      if [[ -n "$target_file" ]]; then
        target_phase="$(extract_field "$target_file" "phase")"
        target_phase_num="$(get_phase_number "$target_phase")"

        # Same or earlier phase — implicit ordering makes it safe
        if [[ "$target_phase_num" -le "$reader_phase_num" ]]; then
          continue
        fi
      fi

      # If we get here, this is a real violation
      violations+=("${name}: reads '${read_ref}' not reachable (not in deps, not in earlier phase, not exempt)")
    done <<< "$reads_raw"
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  local reachable=$(( checked - ${#violations[@]} ))
  printf "Data flow coverage: %d/%d reads entries are valid\n" "$reachable" "$checked"

  if [[ ${#violations[@]} -gt 0 ]]; then
    printf "Data flow violations (%d):\n" "${#violations[@]}"
    printf "  %s\n" "${violations[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
