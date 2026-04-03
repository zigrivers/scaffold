#!/usr/bin/env bats
# Eval 2: Knowledge Quality Gates
# All knowledge files meet minimum quality thresholds.

setup() {
  load eval_helper
  source "${BATS_TEST_DIRNAME}/exemptions.bash"
}

# Minimum line counts by category
min_lines_core=200
min_lines_review=150
min_lines_validation=150
min_lines_finalization=150
min_lines_product=200

get_min_lines() {
  case "$1" in
    core)         echo $min_lines_core ;;
    review)       echo $min_lines_review ;;
    validation)   echo $min_lines_validation ;;
    finalization) echo $min_lines_finalization ;;
    product)      echo $min_lines_product ;;
    *)            echo 100 ;;
  esac
}

@test "all knowledge files have required frontmatter fields" {
  local failures=()
  while IFS= read -r file; do
    is_wip "$file" && continue
    local name desc topics
    name="$(extract_field "$file" "name")"
    desc="$(extract_field "$file" "description")"
    topics="$(extract_field "$file" "topics")"

    [[ -z "$name" ]] && failures+=("$file: missing name")
    [[ -z "$desc" ]] && failures+=("$file: missing description")
    [[ -z "$topics" ]] && failures+=("$file: missing topics")
  done < <(find "${PROJECT_ROOT}/content/knowledge" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Knowledge frontmatter failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "all knowledge files meet minimum line count for their category" {
  local failures=()
  while IFS= read -r file; do
    is_wip "$file" && continue
    local category lines min
    category="$(get_category "$file")"
    lines="$(count_lines "$file")"
    min="$(get_min_lines "$category")"

    if [[ "$lines" -lt "$min" ]]; then
      failures+=("$(basename "$file") (${category}): ${lines} lines < ${min} minimum")
    fi
  done < <(find "${PROJECT_ROOT}/content/knowledge" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Knowledge files below minimum line count:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "core and review knowledge files have at least 1 code block" {
  local failures=()
  while IFS= read -r file; do
    is_wip "$file" && continue
    local category blocks
    category="$(get_category "$file")"
    [[ "$category" != "core" && "$category" != "review" ]] && continue

    blocks="$(count_code_blocks "$file")"
    if [[ "$blocks" -lt 1 ]]; then
      failures+=("$(basename "$file") (${category}): 0 code blocks")
    fi
  done < <(find "${PROJECT_ROOT}/content/knowledge" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Knowledge files missing code blocks:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

is_knowledge_template() {
  local name="$1"
  for exempt in "${KNOWLEDGE_TEMPLATE_EXEMPT[@]}"; do
    [[ "$name" == "$exempt" ]] && return 0
  done
  return 1
}

@test "all knowledge entries are referenced by at least one pipeline step or tool" {
  local orphans=()

  # Collect all knowledge-base references from pipeline steps and tools
  local all_refs=""
  while IFS= read -r file; do
    local refs
    refs="$(extract_field "$file" "knowledge-base" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' || true)"
    [[ -n "$refs" ]] && all_refs="${all_refs}${all_refs:+$'\n'}${refs}"
  done < <(find "${PROJECT_ROOT}/content/pipeline" "${PROJECT_ROOT}/content/tools" -name '*.md' -type f 2>/dev/null)
  all_refs="$(echo "$all_refs" | sort -u)"

  # Check each knowledge entry
  while IFS= read -r file; do
    local name
    name="$(extract_field "$file" "name")"
    [[ -z "$name" ]] && continue
    is_knowledge_template "$name" && continue

    if ! echo "$all_refs" | grep -qx "$name"; then
      orphans+=("$name")
    fi
  done < <(find "${PROJECT_ROOT}/content/knowledge" -name '*.md' -type f)

  if [[ ${#orphans[@]} -gt 0 ]]; then
    printf "Orphaned knowledge entries (not referenced by any pipeline step or tool):\n"
    printf "  %s\n" "${orphans[@]}"
    return 1
  fi
}
