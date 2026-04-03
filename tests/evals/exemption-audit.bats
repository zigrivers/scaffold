#!/usr/bin/env bats
# Eval 12: Exemption Audit
# Exemption lists in exemptions.bash stay minimal and don't accumulate stale entries.

setup() {
  load eval_helper
  source "${BATS_TEST_DIRNAME}/exemptions.bash"
}

# Exemption lists should not exceed 25% of total pipeline steps.
# If they do, the exemption has become the norm and the rule should be revisited.
EXEMPT_THRESHOLD_PCT=25

count_pipeline_steps() {
  find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f | wc -l | tr -d ' '
}

@test "TERMINAL_OUTPUT_EXEMPT is below 25% of total pipeline steps" {
  local total exempt_count threshold
  total="$(count_pipeline_steps)"
  exempt_count="${#TERMINAL_OUTPUT_EXEMPT[@]}"
  threshold=$(( total * EXEMPT_THRESHOLD_PCT / 100 ))

  printf "TERMINAL_OUTPUT_EXEMPT: %d entries (threshold: %d = %d%% of %d steps)\n" \
    "$exempt_count" "$threshold" "$EXEMPT_THRESHOLD_PCT" "$total"

  if [[ "$exempt_count" -gt "$threshold" ]]; then
    printf "FAIL: TERMINAL_OUTPUT_EXEMPT has %d entries, exceeds %d%% threshold (%d)\n" \
      "$exempt_count" "$EXEMPT_THRESHOLD_PCT" "$threshold"
    return 1
  fi
}

@test "PHASE_ORDERING_EXEMPT is below 25% of total pipeline steps" {
  local total exempt_count threshold
  total="$(count_pipeline_steps)"
  exempt_count="${#PHASE_ORDERING_EXEMPT[@]}"
  threshold=$(( total * EXEMPT_THRESHOLD_PCT / 100 ))

  printf "PHASE_ORDERING_EXEMPT: %d entries (threshold: %d = %d%% of %d steps)\n" \
    "$exempt_count" "$threshold" "$EXEMPT_THRESHOLD_PCT" "$total"

  if [[ "$exempt_count" -gt "$threshold" ]]; then
    printf "FAIL: PHASE_ORDERING_EXEMPT has %d entries, exceeds %d%% threshold (%d)\n" \
      "$exempt_count" "$EXEMPT_THRESHOLD_PCT" "$threshold"
    return 1
  fi
}

@test "PHASE_ORDERING_EXEMPT entries reference existing pipeline steps" {
  validate_exempt_phase_ordering
}
