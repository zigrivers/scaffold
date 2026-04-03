#!/usr/bin/env bats
# Eval 6: Redundancy Detection
# Knowledge files with Summary/Deep Guidance sections have appropriate balance.

setup() {
  load eval_helper
}

@test "restructured knowledge files have both Summary and Deep Guidance sections" {
  local failures=()
  while IFS= read -r file; do
    local has_summary has_deep
    has_summary="$(grep -c '^## Summary' "$file" || true)"
    has_deep="$(grep -c '^## Deep Guidance' "$file" || true)"

    # If file has one section but not the other, that's a problem
    if [[ "$has_summary" -gt 0 && "$has_deep" -eq 0 ]]; then
      failures+=("$(basename "$file"): has Summary but no Deep Guidance")
    fi
    if [[ "$has_deep" -gt 0 && "$has_summary" -eq 0 ]]; then
      failures+=("$(basename "$file"): has Deep Guidance but no Summary")
    fi
  done < <(find "${PROJECT_ROOT}/content/knowledge" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Incomplete Summary/Deep Guidance structure:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "Summary sections are concise (under 80 lines)" {
  local failures=()
  while IFS= read -r file; do
    grep -q '^## Summary' "$file" || continue

    local summary_lines
    summary_lines="$(lines_between_headings "$file" "## Summary" "## Deep Guidance")"

    if [[ "$summary_lines" -gt 80 ]]; then
      failures+=("$(basename "$file"): Summary is ${summary_lines} lines (max 80) — may contain content that belongs in Deep Guidance")
    fi
  done < <(find "${PROJECT_ROOT}/content/knowledge" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Oversized Summary sections:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "Deep Guidance sections are the majority of content" {
  local failures=()
  while IFS= read -r file; do
    grep -q '^## Deep Guidance' "$file" || continue

    local total summary_lines deep_lines
    total="$(count_lines "$file")"
    summary_lines="$(lines_between_headings "$file" "## Summary" "## Deep Guidance")"
    # Deep Guidance runs from its heading to EOF
    deep_lines="$(awk '/^## Deep Guidance/{found=1; next} found{count++} END{print count+0}' "$file")"

    # Deep Guidance should be at least 60% of total content
    local threshold=$(( total * 60 / 100 ))
    if [[ "$deep_lines" -lt "$threshold" ]]; then
      local pct=$(( deep_lines * 100 / total ))
      failures+=("$(basename "$file"): Deep Guidance is ${pct}% of file (minimum 60%) — Summary may be too large")
    fi
  done < <(find "${PROJECT_ROOT}/content/knowledge" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Deep Guidance proportion failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}
