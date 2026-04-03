#!/usr/bin/env bats
# Eval 3: Pipeline Step Completeness
# All pipeline steps have valid frontmatter and required body sections.

setup() {
  load eval_helper
}

REQUIRED_FIELDS=(name description phase order dependencies outputs conditional knowledge-base)
REQUIRED_SECTIONS=("## Purpose" "## Inputs" "## Expected Outputs" "## Quality Criteria" "## Methodology Scaling" "## Mode Detection")

@test "all pipeline steps have required frontmatter fields" {
  local failures=()
  while IFS= read -r file; do
    for field in "${REQUIRED_FIELDS[@]}"; do
      if ! has_field "$file" "$field"; then
        failures+=("$(basename "$file"): missing field '$field'")
      fi
    done
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Pipeline frontmatter failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "all pipeline steps have required body sections" {
  local failures=()
  while IFS= read -r file; do
    local content
    content="$(cat "$file")"
    for section in "${REQUIRED_SECTIONS[@]}"; do
      if ! echo "$content" | grep -q "^${section}"; then
        failures+=("$(basename "$file"): missing section '${section}'")
      fi
    done
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Pipeline section failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "pipeline step order values are unique within each phase" {
  local failures=()
  local phases
  phases="$(grep -rh '^phase:' "${PROJECT_ROOT}/content/pipeline/" | sed 's/phase: //' | sed 's/"//g' | sort -u)"

  while IFS= read -r phase; do
    local dupes
    dupes="$(grep -rl "^phase:.*${phase}" "${PROJECT_ROOT}/content/pipeline/" | while read -r f; do
      extract_field "$f" "order"
    done | sort | uniq -d)"

    if [[ -n "$dupes" ]]; then
      failures+=("phase '${phase}': duplicate order(s): ${dupes}")
    fi
  done <<< "$phases"

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Duplicate order values:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "all pipeline dependency references resolve to existing steps" {
  local pipeline_names
  pipeline_names="$(get_pipeline_names)"
  local failures=()

  while IFS= read -r file; do
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      if ! echo "$pipeline_names" | grep -qx "$dep"; then
        failures+=("$(basename "$file"): dependency '$dep' not found")
      fi
    done <<< "$(get_dep_refs "$file")"
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Dangling dependency references:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "pipeline step order values fall within phase-aligned range" {
  local failures=()
  while IFS= read -r file; do
    local phase order range min max
    phase="$(extract_field "$file" "phase")"
    order="$(extract_field "$file" "order")"
    range="$(get_phase_order_range "$phase")"

    [[ -z "$range" ]] && { failures+=("$(basename "$file"): unknown phase '$phase'"); continue; }

    min="${range%% *}"
    max="${range##* }"

    if [[ "$order" -lt "$min" || "$order" -gt "$max" ]]; then
      failures+=("$(basename "$file"): order $order outside phase '$phase' range ($min-$max)")
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Order/phase alignment failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "all pipeline dependencies point to same or earlier phase" {
  local failures=()
  while IFS= read -r file; do
    local step_phase step_phase_num dep_phase dep_phase_num
    step_phase="$(extract_field "$file" "phase")"
    step_phase_num="$(get_phase_number "$step_phase")"

    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      # Find the dependency's file
      local dep_file
      dep_file="$(find "${PROJECT_ROOT}/content/pipeline" -name "${dep}.md" -type f | head -1)"
      [[ -z "$dep_file" ]] && continue  # dangling dep caught by other test

      dep_phase="$(extract_field "$dep_file" "phase")"
      dep_phase_num="$(get_phase_number "$dep_phase")"

      if [[ "$dep_phase_num" -gt "$step_phase_num" ]]; then
        failures+=("$(basename "$file") (phase $step_phase_num/$step_phase) depends on $(basename "$dep_file") (phase $dep_phase_num/$dep_phase) — forward dependency")
      fi
    done <<< "$(get_dep_refs "$file")"
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Forward dependency failures (deps should point to same or earlier phase):\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "all pipeline knowledge-base references resolve to existing entries" {
  local kb_names
  kb_names="$(get_knowledge_names)"
  local failures=()

  while IFS= read -r file; do
    while IFS= read -r ref; do
      [[ -z "$ref" ]] && continue
      if ! echo "$kb_names" | grep -qx "$ref"; then
        failures+=("$(basename "$file"): knowledge-base '$ref' not found")
      fi
    done <<< "$(get_kb_refs "$file")"
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Dangling knowledge-base references:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "steps with Mode Detection also have Update Mode Specifics" {
  local missing=()
  local checked=0

  while IFS= read -r file; do
    local mode_section
    mode_section="$(awk '/^## Mode Detection/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$mode_section" ]] && continue

    # Skip steps where Mode Detection says "Not applicable" or "N/A"
    if echo "$mode_section" | grep -qiE 'not applicable|N/A'; then
      continue
    fi

    checked=$((checked + 1))

    if ! grep -q '^## Update Mode Specifics' "$file"; then
      missing+=("$(basename "$file")")
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  local present=$(( checked - ${#missing[@]} ))
  printf "Update Mode Specifics coverage: %d/%d steps with active Mode Detection\n" "$present" "$checked"

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "FAIL: %d steps have Mode Detection but no Update Mode Specifics:\n" "${#missing[@]}"
    printf "  %s\n" "${missing[@]}"
  fi

  [[ ${#missing[@]} -eq 0 ]]
}

@test "eval_helper phase mappings cover all phases found in pipeline frontmatter" {
  local failures=()

  # Extract unique phase values from pipeline frontmatter
  local pipeline_phases
  pipeline_phases="$(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f -exec \
    awk '/^---$/{fm++; next} fm==1 && /^phase:/{sub("^phase:[ ]*",""); gsub(/["'\'']/, ""); print; exit} fm>=2{exit}' {} \; | sort -u)"

  while IFS= read -r phase; do
    [[ -z "$phase" ]] && continue
    local range
    range="$(get_phase_order_range "$phase")"
    if [[ -z "$range" ]]; then
      failures+=("phase '${phase}' found in pipeline but missing from get_phase_order_range() in eval_helper.bash")
    fi

    local num
    num="$(get_phase_number "$phase")"
    if [[ "$num" == "-1" ]]; then
      failures+=("phase '${phase}' found in pipeline but missing from get_phase_number() in eval_helper.bash")
    fi
  done <<< "$pipeline_phases"

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Phase mapping failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "conditional steps document their conditions in the body" {
  local failures=()
  while IFS= read -r file; do
    local conditional
    conditional="$(extract_field "$file" "conditional")"
    # Skip steps that are not conditional (null, false, or empty)
    [[ -z "$conditional" || "$conditional" == "null" || "$conditional" == "false" ]] && continue

    # Conditional steps should mention their condition in Mode Detection
    # or have a section explaining when to run
    local body
    body="$(awk '/^---$/{ if(++c==2) start=1; next } start{print}' "$file")"

    # Check for conditional language in Mode Detection or body
    if ! echo "$body" | grep -qi "conditional\|only.*when\|skip.*if\|required.*when\|applicable.*to\|web.*app\|mobile\|expo\|multi.platform\|if.needed\|when.*present\|if.*exists\|optional\|may.*skip\|not.*all.*projects\|relevant.*project"; then
      failures+=("$(basename "$file"): conditional='${conditional}' but body lacks conditional guidance")
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Conditional steps missing condition documentation:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}
