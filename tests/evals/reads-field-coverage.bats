#!/usr/bin/env bats
# Eval: Reads Field Coverage (8-N3, 8-W5)
# Validates reads: field adoption and Quality Criteria depth differentiation.
# Covers two previously-weak eval areas:
#   8-N3: Flag steps whose Inputs section references artifacts not declared in reads:
#   8-W5: Quality Criteria depth-differentiation coverage (Module 3)

setup() {
  load eval_helper
}

# ---------------------------------------------------------------------------
# Test 1 (8-N3): steps with reads: field that reference required artifacts
# whose producing step is not declared in reads: or dependencies:
#
# This catches cases where a step author declared reads: (showing awareness of
# the field) but left out specific artifacts listed as "(required)" in Inputs.
# Soft gate: warn at >15, fail at >40 to allow gradual remediation.
# ---------------------------------------------------------------------------

@test "steps with reads field declare required artifact producers in reads or dependencies" {
  # Build a lookup file: one line per "file_path:step_name" mapping outputs to steps.
  # This avoids associative arrays (unavailable in older bash used by bats).
  local output_map
  output_map="$(
    while IFS= read -r pipeline_file; do
      local step_name
      step_name="$(extract_field "$pipeline_file" "name")"
      local outputs_raw
      outputs_raw="$(extract_field "$pipeline_file" "outputs" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//')"
      while IFS= read -r out; do
        [[ -z "$out" ]] && continue
        [[ "$out" != *.md ]] && continue  # Only track .md file outputs
        printf '%s:%s\n' "$out" "$step_name"
      done <<< "$outputs_raw"
    done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)
  )"

  local violations=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local name stateless_raw
    name="$(extract_field "$pipeline_file" "name")"
    stateless_raw="$(extract_field "$pipeline_file" "stateless")"
    [[ "$stateless_raw" == "true" ]] && continue

    local reads_raw deps_raw
    reads_raw="$(extract_field "$pipeline_file" "reads" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//')"
    deps_raw="$(extract_field "$pipeline_file" "dependencies" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//')"

    # Only check steps that have a non-empty reads: field
    [[ -z "$(echo "$reads_raw" | grep -v '^$' || true)" ]] && continue

    # Build the set of declared step names (reads + deps), one per line
    local declared_steps
    declared_steps="$(printf '%s\n%s\n' "$reads_raw" "$deps_raw" | grep -v '^$' | sort -u)"

    # Extract Inputs section
    local inputs_section
    inputs_section="$(awk '/^## Inputs/{found=1; next} /^## /{if(found) exit} found{print}' "$pipeline_file")"
    [[ -z "$inputs_section" ]] && continue

    # Check each line that marks an artifact as "(required)"
    while IFS= read -r line; do
      [[ "$line" != *"(required)"* ]] && continue

      # Extract .md file paths from this line
      local md_refs
      md_refs="$(echo "$line" | grep -oE 'docs/[a-zA-Z0-9_/.-]+\.md' || true)"
      [[ -z "$md_refs" ]] && continue

      while IFS= read -r md_ref; do
        [[ -z "$md_ref" ]] && continue

        # Find all steps that produce this .md file
        local producers
        producers="$(echo "$output_map" | grep "^${md_ref}:" | cut -d: -f2 || true)"
        [[ -z "$producers" ]] && continue  # Not produced by any pipeline step

        checked=$((checked + 1))

        # Check if ANY producer (excluding self) is in the declared set
        local found_producer=false
        while IFS= read -r producer; do
          [[ -z "$producer" ]] && continue
          [[ "$producer" == "$name" ]] && continue  # Skip self
          if echo "$declared_steps" | grep -qx "$producer"; then
            found_producer=true
            break
          fi
        done <<< "$producers"

        if [[ "$found_producer" == "false" ]]; then
          local producers_inline
          producers_inline="$(echo "$producers" | tr '\n' ',' | sed 's/,$//')"
          violations+=("${name}: REQUIRED '${md_ref}' (from ${producers_inline}) not in reads/deps")
        fi
      done <<< "$md_refs"
    done <<< "$inputs_section"
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  local violation_count="${#violations[@]}"
  printf "Reads field coverage: %d required artifact checks, %d violations\n" "$checked" "$violation_count"

  if [[ "$violation_count" -gt 0 ]]; then
    printf "Violations (steps with reads: field but missing required artifact producers):\n"
    printf "  %s\n" "${violations[@]}"
  fi

  # Soft gate: warn at >15, fail at >40
  # Allows gradual reads: field adoption without immediately breaking the suite.
  if [[ "$violation_count" -gt 15 ]]; then
    printf "WARNING: %d violations exceed the 15-violation advisory threshold\n" "$violation_count"
  fi
  [[ "$violation_count" -le 40 ]]
}

# ---------------------------------------------------------------------------
# Test 2 (8-W5 — Module 3 coverage): steps with 5+ QC criteria have at least
# one depth-differentiated criterion tagged (deep) or (depth N+).
#
# Steps with 5+ all-(mvp) criteria suggest the QC section was written without
# depth differentiation — a coverage gap in Module 3 quality evaluation.
# ---------------------------------------------------------------------------

@test "steps with 5 or more QC criteria have at least one depth-differentiated criterion" {
  local violations=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local name stateless_raw
    name="$(extract_field "$pipeline_file" "name")"
    stateless_raw="$(extract_field "$pipeline_file" "stateless")"
    [[ "$stateless_raw" == "true" ]] && continue

    local qc_section
    qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$pipeline_file")"
    [[ -z "$qc_section" ]] && continue

    local total_criteria
    total_criteria="$(echo "$qc_section" | grep -c '^- ' || true)"
    [[ "$total_criteria" -lt 5 ]] && continue

    checked=$((checked + 1))

    # Check for any depth-differentiated criterion.
    # Accepts (deep) and (depth N+) markers.
    local deep_count
    deep_count="$(echo "$qc_section" | grep -cE '\(deep\)|\(depth [0-9]' || true)"

    if [[ "$deep_count" -eq 0 ]]; then
      violations+=("${name}: ${total_criteria} QC criteria but none tagged (deep) or (depth N+)")
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  printf "Checked %d steps with 5+ QC criteria for depth differentiation\n" "$checked"

  if [[ ${#violations[@]} -gt 0 ]]; then
    printf "Steps with 5+ QC criteria but no depth-differentiated criteria:\n"
    printf "  %s\n" "${violations[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}

# ---------------------------------------------------------------------------
# Test 3 (8-W5 — Module 3 coverage): no non-stateless pipeline step has fewer
# than 3 QC criteria.
#
# Steps with <3 QC criteria suggest an under-specified quality contract.
# ---------------------------------------------------------------------------

@test "no non-stateless pipeline step has fewer than 3 QC criteria" {
  local violations=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local name stateless_raw
    name="$(extract_field "$pipeline_file" "name")"
    stateless_raw="$(extract_field "$pipeline_file" "stateless")"
    [[ "$stateless_raw" == "true" ]] && continue

    local qc_section
    qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$pipeline_file")"

    local criteria_count
    criteria_count="$(echo "$qc_section" | grep -c '^- ' || true)"

    checked=$((checked + 1))

    if [[ "$criteria_count" -lt 3 ]]; then
      violations+=("${name}: only ${criteria_count} QC criteria (minimum 3 required)")
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  printf "Checked %d non-stateless steps for minimum QC criteria count\n" "$checked"

  if [[ ${#violations[@]} -gt 0 ]]; then
    printf "Steps with fewer than 3 QC criteria:\n"
    printf "  %s\n" "${violations[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
