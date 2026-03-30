#!/usr/bin/env bats
# Eval: MVP Context Coherence
# Validates that MVP-enabled pipeline steps don't require non-MVP artifacts
# and that MVP-specific guidance sections remain present where required.

setup() {
  load eval_helper
}

# --- Test 1: MVP-enabled steps do not require non-MVP artifacts as hard requirements ---
# MVP-enabled steps should not list docs/system-architecture.md as "(required)"
# without an "(at deep)" or "(optional" qualifier, because that artifact doesn't
# exist at MVP depth. This was a root cause of the R6 P1 stuck points.

@test "MVP steps do not require non-MVP artifacts" {
  local mvp_file="${PROJECT_ROOT}/methodology/mvp.yml"
  [[ -f "$mvp_file" ]] || {
    echo "methodology/mvp.yml not found"
    return 1
  }

  # Build list of MVP-enabled step names
  local -a mvp_enabled=()
  while IFS= read -r line; do
    local step_name enabled_val
    step_name="$(echo "$line" | sed -E -n 's/^[[:space:]]*([a-z][a-z0-9-]*):[[:space:]]*\{.*enabled:[[:space:]]*(true|false).*/\1/p')"
    enabled_val="$(echo "$line" | sed -E -n 's/.*enabled:[[:space:]]*(true|false).*/\1/p')"
    if [[ -n "$step_name" && "$enabled_val" == "true" ]]; then
      mvp_enabled+=("$step_name")
    fi
  done < "$mvp_file"

  if [[ ${#mvp_enabled[@]} -eq 0 ]]; then
    echo "FAIL: Could not parse any enabled steps from mvp.yml"
    return 1
  fi

  local failures=()

  for step_name in "${mvp_enabled[@]}"; do
    # Find the pipeline file for this step
    local pipeline_file=""
    while IFS= read -r candidate; do
      local candidate_name
      candidate_name="$(extract_field "$candidate" "name")"
      if [[ "$candidate_name" == "$step_name" ]]; then
        pipeline_file="$candidate"
        break
      fi
    done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

    [[ -z "$pipeline_file" ]] && continue

    # Extract the Inputs section
    local inputs_section
    inputs_section="$(awk '/^## Inputs/{found=1; next} /^## /{if(found) exit} found{print}' "$pipeline_file")"
    [[ -z "$inputs_section" ]] && continue

    # Flag: system-architecture.md marked as (required) without a depth qualifier
    # A compliant line would be: "docs/system-architecture.md (optional" or
    # "docs/system-architecture.md (required at deep" etc.
    local violation
    violation="$(echo "$inputs_section" | grep 'system-architecture.md' | grep '(required)' | grep -v '(optional\|at deep\|not available' || true)"

    if [[ -n "$violation" ]]; then
      failures+=("${step_name}: system-architecture.md listed as (required) without MVP qualifier: ${violation}")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "MVP steps with hard non-MVP artifact requirements (%d):\n" "${#failures[@]}"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Test 2: implementation-plan has MVP-Specific Guidance section ---
# This section was added to resolve the R6 P1 stuck point where MVP runs
# couldn't proceed without system-architecture.md. Verify it still exists.

@test "implementation-plan has MVP-Specific Guidance section" {
  local impl_plan="${PROJECT_ROOT}/pipeline/planning/implementation-plan.md"
  [[ -f "$impl_plan" ]] || {
    echo "pipeline/planning/implementation-plan.md not found"
    return 1
  }

  if ! grep -q "MVP-Specific Guidance" "$impl_plan"; then
    echo "FAIL: implementation-plan.md is missing the 'MVP-Specific Guidance' section"
    return 1
  fi
}

# --- Test 3: implementation-playbook story-tests-map QC criteria are depth-gated ---
# docs/story-tests-map.md does not exist at MVP depth (it's produced by story-tests
# which is a quality phase step, not MVP-enabled). Any QC criterion in the playbook
# that references story-tests-map should be tagged (deep), not (mvp).

@test "implementation-playbook story-tests-map QC is depth-gated not mvp-tagged" {
  local playbook="${PROJECT_ROOT}/pipeline/finalization/implementation-playbook.md"
  [[ -f "$playbook" ]] || {
    echo "pipeline/finalization/implementation-playbook.md not found"
    return 1
  }

  local qc_section
  qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$playbook")"

  # Find any QC line that mentions story-tests-map AND is tagged (mvp)
  local violations
  violations="$(echo "$qc_section" | grep 'story-tests-map' | grep '(mvp)' || true)"

  if [[ -n "$violations" ]]; then
    printf "FAIL: implementation-playbook QC has (mvp)-tagged story-tests-map criteria (should be (deep)):\n"
    printf "  %s\n" "$violations"
    return 1
  fi
}
