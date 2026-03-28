#!/usr/bin/env bats
# Eval 4: Command Structure
# Pipeline commands have required structural sections.

setup() {
  load eval_helper
  source "${BATS_TEST_DIRNAME}/exemptions.bash"
}

# Commands under this line count are execution stubs — skip structural checks
MIN_LINES_FOR_STRUCTURE=50

@test "all command files have description in frontmatter" {
  local failures=()
  for cmd_file in "${PROJECT_ROOT}"/commands/*.md; do
    local desc
    desc="$(extract_field "$cmd_file" "description")"
    if [[ -z "$desc" ]]; then
      failures+=("$(basename "$cmd_file"): missing description")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Command frontmatter failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "pipeline commands with Mode Detection also have Process and After This Step" {
  local failures=()
  for cmd_file in "${PROJECT_ROOT}"/commands/*.md; do
    local lines
    lines="$(count_lines "$cmd_file")"
    [[ "$lines" -lt "$MIN_LINES_FOR_STRUCTURE" ]] && continue

    # Only check commands that have Mode Detection (document-creating commands)
    grep -q '## Mode Detection' "$cmd_file" || continue

    if ! grep -q '## Process\|## Review Process\|^[0-9]\+\.\s' "$cmd_file"; then
      failures+=("$(basename "$cmd_file"): has Mode Detection but no Process section")
    fi
    if ! grep -q '## After This Step' "$cmd_file"; then
      failures+=("$(basename "$cmd_file"): has Mode Detection but no After This Step section")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Command structure failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

is_after_exempt() {
  local name="$1"
  for exempt in "${AFTER_STEP_EXEMPT[@]}"; do
    [[ "$name" == "$exempt" ]] && return 0
  done
  return 1
}

@test "non-trivial commands have After This Step section" {
  local failures=()
  for cmd_file in "${PROJECT_ROOT}"/commands/*.md; do
    local slug lines
    slug="$(basename "$cmd_file" .md)"
    lines="$(count_lines "$cmd_file")"
    [[ "$lines" -lt "$MIN_LINES_FOR_STRUCTURE" ]] && continue
    is_after_exempt "$slug" && continue

    if ! grep -q '## After This Step' "$cmd_file"; then
      failures+=("${slug}.md (${lines} lines): no After This Step section")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Commands missing After This Step:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "After This Step references point to existing commands" {
  local failures=()
  local checked=0

  for cmd_file in "${PROJECT_ROOT}"/commands/*.md; do
    local slug
    slug="$(basename "$cmd_file" .md)"

    # Extract After This Step section
    local after_section
    after_section="$(awk '/^## After This Step/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
    [[ -z "$after_section" ]] && continue

    # Extract /scaffold: references
    local next_commands
    next_commands="$(echo "$after_section" | grep -o '/scaffold:[a-z0-9-]*' | sed 's|/scaffold:||' | sort -u || true)"
    [[ -z "$next_commands" ]] && continue

    while IFS= read -r next_cmd; do
      [[ -z "$next_cmd" ]] && continue
      checked=$((checked + 1))

      if [[ ! -f "${PROJECT_ROOT}/commands/${next_cmd}.md" ]]; then
        failures+=("${slug}: After This Step references '/scaffold:${next_cmd}' but commands/${next_cmd}.md does not exist")
      fi
    done <<< "$next_commands"
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Dangling After This Step references (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}
