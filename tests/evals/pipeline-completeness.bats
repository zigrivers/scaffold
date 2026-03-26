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
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

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
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Pipeline section failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "pipeline step order values are unique within each phase" {
  local failures=()
  local phases
  phases="$(grep -rh '^phase:' "${PROJECT_ROOT}/pipeline/" | sed 's/phase: //' | sed 's/"//g' | sort -u)"

  while IFS= read -r phase; do
    local dupes
    dupes="$(grep -rl "^phase:.*${phase}" "${PROJECT_ROOT}/pipeline/" | while read -r f; do
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
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Dangling dependency references:\n"
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
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Dangling knowledge-base references:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}
