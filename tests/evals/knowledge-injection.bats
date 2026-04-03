#!/usr/bin/env bats
# knowledge-injection.bats — Validates knowledge system structure and injection

setup() {
  load eval_helper
}

@test "knowledge entries with Summary section also have Deep Guidance section" {
  local missing_deep=()

  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    if grep -q "^## Summary" "$f"; then
      if ! grep -q "^## Deep Guidance" "$f"; then
        missing_deep+=("$(basename "$f")")
      fi
    fi
  done < <(find "${PROJECT_ROOT}/content/knowledge" -name '*.md' -type f)

  printf "Knowledge entries with Summary but no Deep Guidance: %d\n" "${#missing_deep[@]}"
  for entry in "${missing_deep[@]}"; do
    printf "  %s\n" "$entry"
  done

  [[ ${#missing_deep[@]} -eq 0 ]]
}

@test "knowledge entries referenced by pipeline steps exist as files" {
  local missing=()

  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    local kb_refs
    kb_refs="$(get_kb_refs "$f")"
    [[ -z "$kb_refs" ]] && continue

    while IFS= read -r entry; do
      [[ -z "$entry" ]] && continue
      # Check if a file with this name exists somewhere under knowledge/
      if ! find "${PROJECT_ROOT}/content/knowledge" -name "${entry}.md" -print -quit 2>/dev/null | grep -q .; then
        missing+=("$(basename "$f") references '$entry'")
      fi
    done <<< "$kb_refs"
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  printf "Missing knowledge entries: %d\n" "${#missing[@]}"
  for entry in "${missing[@]}"; do
    printf "  %s\n" "$entry"
  done

  [[ ${#missing[@]} -eq 0 ]]
}

@test "no pipeline step references more than 8 knowledge entries" {
  local bloated=()

  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    local kb_refs
    kb_refs="$(get_kb_refs "$f")"
    [[ -z "$kb_refs" ]] && continue

    local count
    count=$(echo "$kb_refs" | grep -c '[a-z]' || true)

    if [[ "$count" -gt 8 ]]; then
      bloated+=("$(basename "$f"): $count entries")
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  printf "Steps with >8 knowledge entries: %d\n" "${#bloated[@]}"
  for entry in "${bloated[@]}"; do
    printf "  %s\n" "$entry"
  done

  [[ ${#bloated[@]} -eq 0 ]]
}
