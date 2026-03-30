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

    # Scope to Inputs and Instructions sections — not full-file grep, which
    # would pass on negation prose like "does NOT require a playbook".
    local inputs_section instructions_section
    inputs_section="$(awk '/^## Inputs/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
    instructions_section="$(awk '/^## Instructions/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
    local scoped_text="${inputs_section}"$'\n'"${instructions_section}"

    if ! echo "$scoped_text" | grep -qi 'implementation-playbook\|playbook'; then
      failures+=("${cmd_slug}.md Inputs/Instructions sections do not affirmatively reference playbook")
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

    # Scope to Inputs and Instructions sections — avoids false positives from
    # negation prose like "does NOT require onboarding" in other sections.
    local inputs_section instructions_section
    inputs_section="$(awk '/^## Inputs/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
    instructions_section="$(awk '/^## Instructions/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
    local scoped_text="${inputs_section}"$'\n'"${instructions_section}"

    if ! echo "$scoped_text" | grep -qi 'onboarding'; then
      failures+=("${cmd_slug}.md Inputs/Instructions sections do not affirmatively reference onboarding")
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

  # Scope to Instructions and After This Step sections — the quality gate
  # reference should appear in the process or handoff, not just anywhere in the file.
  local instructions_section after_section
  instructions_section="$(awk '/^## Instructions/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
  after_section="$(awk '/^## After This Step/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
  local scoped_text="${instructions_section}"$'\n'"${after_section}"

  if ! echo "$scoped_text" | grep -qi 'quality\|gate\|playbook'; then
    echo "quick-task.md Instructions/After-This-Step sections do not mention quality, gate, or playbook"
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

  # Scope to Instructions and After This Step sections — story-tests reference
  # should appear in the process or handoff context, not just in passing elsewhere.
  # "After This Step" is the handoff section where downstream steps are listed.
  local instructions_section after_section
  instructions_section="$(awk '/^## Instructions/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
  after_section="$(awk '/^## After This Step/{found=1; next} /^## /{if(found) exit} found{print}' "$cmd_file")"
  local scoped_text="${instructions_section}"$'\n'"${after_section}"

  if ! echo "$scoped_text" | grep -qi 'story-tests\|test skeletons'; then
    echo "new-enhancement.md Instructions/After-This-Step sections do not mention story-tests or test skeletons"
    return 1
  fi
}
