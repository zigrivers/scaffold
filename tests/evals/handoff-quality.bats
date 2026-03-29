#!/usr/bin/env bats
# Eval: Handoff Quality
# Validates that the implementation handoff is complete — agents starting
# implementation get pointed to the right artifacts and workflows.

setup() {
  load eval_helper
}

# --- Test 1: implementation-playbook reads cover key upstream artifacts ---

@test "implementation-playbook reads cover key upstream artifacts" {
  local playbook="${PROJECT_ROOT}/pipeline/finalization/implementation-playbook.md"
  [[ -f "$playbook" ]] || {
    echo "implementation-playbook.md not found"
    return 1
  }

  local reads_field
  reads_field="$(extract_field "$playbook" "reads")"

  local required=(
    system-architecture
    tdd
    coding-standards
    security
    operations
    implementation-plan
    create-evals
    story-tests
  )

  local missing=()
  for artifact in "${required[@]}"; do
    if ! echo "$reads_field" | grep -q "$artifact"; then
      missing+=("$artifact")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "implementation-playbook reads field missing key artifacts:\n"
    printf "  %s\n" "${missing[@]}"
    printf "Current reads: %s\n" "$reads_field"
    return 1
  fi
}

# --- Test 2: agent start commands reference playbook ---

@test "agent start commands reference playbook" {
  local failures=()

  for cmd_slug in single-agent-start multi-agent-start; do
    local cmd_file="${PROJECT_ROOT}/commands/${cmd_slug}.md"
    [[ -f "$cmd_file" ]] || {
      failures+=("${cmd_slug}.md not found")
      continue
    }

    if ! grep -qi 'implementation-playbook\|playbook' "$cmd_file"; then
      failures+=("${cmd_slug}.md does not mention playbook")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Agent start commands missing playbook reference:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Test 3: agent start commands reference onboarding guide ---

@test "agent start commands reference onboarding guide" {
  local failures=()

  for cmd_slug in single-agent-start multi-agent-start; do
    local cmd_file="${PROJECT_ROOT}/commands/${cmd_slug}.md"
    [[ -f "$cmd_file" ]] || {
      failures+=("${cmd_slug}.md not found")
      continue
    }

    if ! grep -qi 'onboarding' "$cmd_file"; then
      failures+=("${cmd_slug}.md does not mention onboarding")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Agent start commands missing onboarding reference:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Test 4: quick-task references quality gates ---

@test "quick-task references quality gates" {
  local cmd_file="${PROJECT_ROOT}/commands/quick-task.md"
  [[ -f "$cmd_file" ]] || {
    echo "quick-task.md not found"
    return 1
  }

  if ! grep -qi 'quality\|gate\|playbook' "$cmd_file"; then
    echo "quick-task.md does not mention quality, gate, or playbook"
    return 1
  fi
}

# --- Test 5: new-enhancement references story-tests ---

@test "new-enhancement references story-tests" {
  local cmd_file="${PROJECT_ROOT}/commands/new-enhancement.md"
  [[ -f "$cmd_file" ]] || {
    echo "new-enhancement.md not found"
    return 1
  }

  if ! grep -qi 'story-tests\|test skeletons' "$cmd_file"; then
    echo "new-enhancement.md does not mention story-tests or test skeletons"
    return 1
  fi
}
