#!/usr/bin/env bats
# Eval: MVP Path Simulation
# Validates that the MVP preset's enabled steps form a valid dependency chain
# and that the step count is sane (minimal but sufficient).

setup() {
  load eval_helper
}

# --- Test 1: MVP-enabled step dependencies reference real pipeline steps ---

@test "every MVP-enabled step's dependencies reference existing pipeline steps" {
  local mvp_file="${PROJECT_ROOT}/content/methodology/mvp.yml"
  [[ -f "$mvp_file" ]] || {
    echo "methodology/mvp.yml not found"
    return 1
  }

  # Build list of MVP-enabled step names from mvp.yml
  local -a mvp_enabled=()
  while IFS= read -r line; do
    # Parse lines like: "  create-vision: { enabled: true }"
    local step_name enabled_val
    step_name="$(echo "$line" | sed -E -n 's/^[[:space:]]*([a-z][a-z0-9-]*):[[:space:]]*\{.*enabled:[[:space:]]*(true|false).*/\1/p')"
    enabled_val="$(echo "$line" | sed -E -n 's/.*enabled:[[:space:]]*(true|false).*/\1/p')"
    if [[ -n "$step_name" && "$enabled_val" == "true" ]]; then
      mvp_enabled+=("$step_name")
    fi
  done < "$mvp_file"

  if [[ ${#mvp_enabled[@]} -eq 0 ]]; then
    echo "FAIL: Could not parse any enabled steps from mvp.yml"
    return 1
  fi

  # Build set of ALL pipeline step names (enabled or disabled)
  local -a all_pipeline_names=()
  while IFS= read -r file; do
    local name
    name="$(extract_field "$file" "name")"
    [[ -n "$name" ]] && all_pipeline_names+=("$name")
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  printf "MVP-enabled steps: %d, Total pipeline steps: %d\n" "${#mvp_enabled[@]}" "${#all_pipeline_names[@]}"

  # For each MVP-enabled step, check that its dependencies reference real steps.
  # Dependencies may be disabled in MVP (that's intentional — the step works at
  # reduced depth), but they must not reference non-existent step names.
  local failures=()
  local unsatisfied=()

  for step_name in "${mvp_enabled[@]}"; do
    # Find the pipeline file for this step
    local pipeline_file=""
    while IFS= read -r candidate; do
      local candidate_name
      candidate_name="$(extract_field "$candidate" "name")"
      if [[ "$candidate_name" == "$step_name" ]]; then
        pipeline_file="$candidate"
        break
      fi
    done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

    # Skip steps without pipeline files (e.g., build phase steps)
    [[ -z "$pipeline_file" ]] && continue

    # Extract dependencies (get_dep_refs exits non-zero when deps are empty)
    local deps
    deps="$(get_dep_refs "$pipeline_file" 2>/dev/null || true)"
    [[ -z "$deps" ]] && continue

    # Check each dependency exists as a real pipeline step
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      local dep_exists=0
      for pname in "${all_pipeline_names[@]}"; do
        if [[ "$pname" == "$dep" ]]; then
          dep_exists=1
          break
        fi
      done
      if [[ "$dep_exists" -eq 0 ]]; then
        failures+=("${step_name}: depends on '${dep}' which does NOT exist as a pipeline step")
      fi

      # Track unsatisfied deps (disabled in MVP) as informational
      local dep_enabled=0
      for enabled_step in "${mvp_enabled[@]}"; do
        if [[ "$enabled_step" == "$dep" ]]; then
          dep_enabled=1
          break
        fi
      done
      if [[ "$dep_enabled" -eq 0 ]]; then
        unsatisfied+=("${step_name} -> ${dep} (disabled in MVP)")
      fi
    done <<< "$deps"
  done

  if [[ ${#unsatisfied[@]} -gt 0 ]]; then
    printf "INFO: %d MVP dependencies are on disabled steps (expected — step works at reduced depth):\n" "${#unsatisfied[@]}"
    printf "  %s\n" "${unsatisfied[@]}"
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "FAIL: MVP dependency chain references non-existent steps (%d):\n" "${#failures[@]}"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Test 2: MVP step count sanity check ---

@test "MVP preset enables between 10 and 30 steps" {
  local mvp_file="${PROJECT_ROOT}/content/methodology/mvp.yml"
  [[ -f "$mvp_file" ]] || {
    echo "methodology/mvp.yml not found"
    return 1
  }

  local enabled_count
  enabled_count="$(grep -c 'enabled: true' "$mvp_file")"

  printf "MVP enabled step count: %d (expected: 10-30)\n" "$enabled_count"

  if [[ "$enabled_count" -lt 10 ]]; then
    printf "FAIL: Too few MVP steps (%d < 10) — MVP path may be too thin to scaffold a project\n" "$enabled_count"
    return 1
  fi

  if [[ "$enabled_count" -gt 30 ]]; then
    printf "FAIL: Too many MVP steps (%d > 30) — MVP path should be minimal, not comprehensive\n" "$enabled_count"
    return 1
  fi
}

# --- Test 3: MVP-enabled steps all resolve to existing pipeline files ---

@test "every MVP-enabled step has a corresponding pipeline file" {
  local mvp_file="${PROJECT_ROOT}/content/methodology/mvp.yml"
  [[ -f "$mvp_file" ]] || {
    echo "methodology/mvp.yml not found"
    return 1
  }

  # Build set of all pipeline step names
  local -a pipeline_names=()
  while IFS= read -r file; do
    local name
    name="$(extract_field "$file" "name")"
    [[ -n "$name" ]] && pipeline_names+=("$name")
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  # Parse MVP-enabled steps and verify each has a pipeline file
  local missing=()
  while IFS= read -r line; do
    local step_name enabled_val
    step_name="$(echo "$line" | sed -E -n 's/^[[:space:]]*([a-z][a-z0-9-]*):[[:space:]]*\{.*enabled:[[:space:]]*(true|false).*/\1/p')"
    enabled_val="$(echo "$line" | sed -E -n 's/.*enabled:[[:space:]]*(true|false).*/\1/p')"
    if [[ -n "$step_name" && "$enabled_val" == "true" ]]; then
      local found=0
      for pname in "${pipeline_names[@]}"; do
        if [[ "$pname" == "$step_name" ]]; then
          found=1
          break
        fi
      done
      if [[ "$found" -eq 0 ]]; then
        missing+=("$step_name")
      fi
    fi
  done < "$mvp_file"

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "FAIL: MVP-enabled steps without pipeline files (%d):\n" "${#missing[@]}"
    printf "  %s\n" "${missing[@]}"
    return 1
  fi
}
