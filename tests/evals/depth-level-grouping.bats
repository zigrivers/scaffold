#!/usr/bin/env bats
# Eval: Depth Level Grouping Regression
# Prevents regression of grouped depth levels (e.g., "Depth 1-2" or "Depth 4-5")
# in pipeline QC and Methodology Scaling sections.
#
# Background: Grouped depth levels (like "Depth 1-2") collapse distinct guidance
# into a single bucket, losing granularity. This was regression 2-R1, which
# persisted across R4 and R5. Each depth level (1 through 5) must have its own
# independent entry.

setup() {
  load eval_helper
}

# --- Test 1: No grouped depth levels in Quality Criteria sections ---

@test "no grouped depth levels in pipeline Quality Criteria sections" {
  local violations=()

  while IFS= read -r file; do
    [[ -f "$file" ]] || continue

    local qc_section
    qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$qc_section" ]] && continue

    # Check for grouped depth patterns like "Depth 1-2", "Depth 3-4", "Depth 4-5"
    local matches
    matches="$(echo "$qc_section" | grep -oE 'Depth [0-9]+-[0-9]+' || true)"
    if [[ -n "$matches" ]]; then
      while IFS= read -r match; do
        violations+=("$(basename "$file"): QC section contains '${match}'")
      done <<< "$matches"
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#violations[@]} -gt 0 ]]; then
    printf "FAIL: Found grouped depth levels in Quality Criteria sections (%d violations):\n" "${#violations[@]}"
    printf "  %s\n" "${violations[@]}"
    printf "\nEach depth level (1-5) must have its own independent entry.\n"
    return 1
  fi
}

# --- Test 2: No grouped depth levels in Methodology Scaling sections ---

@test "no grouped depth levels in pipeline Methodology Scaling sections" {
  local violations=()

  while IFS= read -r file; do
    [[ -f "$file" ]] || continue

    local ms_section
    ms_section="$(awk '/^## Methodology Scaling/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$ms_section" ]] && continue

    # Check for grouped depth patterns like "Depth 1-2", "Depth 3-4", "Depth 4-5"
    local matches
    matches="$(echo "$ms_section" | grep -oE 'Depth [0-9]+-[0-9]+' || true)"
    if [[ -n "$matches" ]]; then
      while IFS= read -r match; do
        violations+=("$(basename "$file"): Methodology Scaling contains '${match}'")
      done <<< "$matches"
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#violations[@]} -gt 0 ]]; then
    printf "FAIL: Found grouped depth levels in Methodology Scaling sections (%d violations):\n" "${#violations[@]}"
    printf "  %s\n" "${violations[@]}"
    printf "\nEach depth level (1-5) must have its own independent entry.\n"
    return 1
  fi
}

# --- Test 3: Each custom:depth section has exactly 5 individual depth entries ---

@test "custom depth sections have 5 individual depth entries (1 through 5)" {
  local violations=()
  local checked=0

  while IFS= read -r file; do
    [[ -f "$file" ]] || continue

    local ms_section
    ms_section="$(awk '/^## Methodology Scaling/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$ms_section" ]] && continue

    # Only check files that have a custom:depth block
    if ! echo "$ms_section" | grep -q 'custom:depth'; then
      continue
    fi

    checked=$((checked + 1))

    # Count individual depth entries (Depth 1, Depth 2, ..., Depth 5)
    local missing=()
    for level in 1 2 3 4 5; do
      if ! echo "$ms_section" | grep -qE "Depth ${level}[^-0-9]|Depth ${level}$"; then
        missing+=("$level")
      fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
      violations+=("$(basename "$file"): missing individual Depth entries: ${missing[*]}")
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  printf "Checked %d pipeline steps with custom:depth sections\n" "$checked"

  if [[ ${#violations[@]} -gt 0 ]]; then
    printf "FAIL: Steps with incomplete depth entries (%d):\n" "${#violations[@]}"
    printf "  %s\n" "${violations[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
