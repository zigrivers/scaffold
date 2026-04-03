#!/usr/bin/env bats
# Eval: Handoff Quality
# Validates that the implementation handoff is complete — agents starting
# implementation get pointed to the right artifacts and workflows.

setup() {
  load eval_helper
}

# --- Test 1: implementation-playbook reads cover key upstream artifacts ---

@test "implementation-playbook reads cover key upstream artifacts" {
  local playbook="${PROJECT_ROOT}/content/pipeline/finalization/implementation-playbook.md"
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
