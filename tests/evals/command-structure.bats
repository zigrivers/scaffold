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
    local slug lines
    slug="$(basename "$cmd_file" .md)"
    lines="$(count_lines "$cmd_file")"
    [[ "$lines" -lt "$MIN_LINES_FOR_STRUCTURE" ]] && continue

    # Only check commands that have Mode Detection (document-creating commands)
    grep -q '## Mode Detection' "$cmd_file" || continue

    # Accept v1 Process/Review Process sections OR v2 structured sections (Inputs/Expected Outputs/Quality Criteria)
    if ! grep -q '## Process\|## Review Process\|## Inputs\|## Expected Outputs\|## Quality Criteria\|^[0-9]\+\.\s' "$cmd_file"; then
      failures+=("$(basename "$cmd_file"): has Mode Detection but no Process section")
    fi
    if ! grep -q '## After This Step' "$cmd_file"; then
      is_after_exempt "$slug" && continue
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

# Dynamically derive finalization-phase command slugs from pipeline files
get_finalization_commands() {
  while IFS= read -r file; do
    local phase
    phase="$(extract_field "$file" "phase")"
    if [[ "$phase" == "finalization" ]]; then
      extract_field "$file" "name"
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)
}

is_finalization() {
  local name="$1"
  local fin_cmds
  fin_cmds="$(get_finalization_commands)"
  echo "$fin_cmds" | grep -qx "$name"
}

@test "non-finalization commands with >50 lines have scaffold references (dead-end warning)" {
  local warnings=()
  local checked=0

  for cmd_file in "${PROJECT_ROOT}"/commands/*.md; do
    local slug lines
    slug="$(basename "$cmd_file" .md)"
    lines="$(count_lines "$cmd_file")"
    [[ "$lines" -le "$MIN_LINES_FOR_STRUCTURE" ]] && continue
    is_after_exempt "$slug" && continue
    is_finalization "$slug" && continue

    checked=$((checked + 1))

    if ! grep -q '/scaffold:' "$cmd_file"; then
      warnings+=("${slug}.md (${lines} lines): no /scaffold: reference — potential dead-end command")
    fi
  done

  if [[ ${#warnings[@]} -gt 0 ]]; then
    printf "WARNING: potential dead-end commands (%d checked, %d without /scaffold: references):\n" "$checked" "${#warnings[@]}"
    printf "  %s\n" "${warnings[@]}"
  fi

  # Soft check — warn but don't fail. Uncomment return 1 to enforce.
  # [[ ${#warnings[@]} -eq 0 ]]
  [[ "$checked" -gt 0 ]]
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
