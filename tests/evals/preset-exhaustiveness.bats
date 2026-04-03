#!/usr/bin/env bats
# Eval 13: Preset Exhaustiveness
# Every pipeline step name appears in each methodology preset file.

setup() {
  load eval_helper
}

PRESET_FILES=(mvp.yml deep.yml custom-defaults.yml)

@test "every pipeline step appears in all methodology preset files" {
  local failures=()
  local step_names
  step_names="$(get_pipeline_names)"

  for preset in "${PRESET_FILES[@]}"; do
    local preset_path="${PROJECT_ROOT}/content/methodology/${preset}"
    if [[ ! -f "$preset_path" ]]; then
      failures+=("preset file '${preset}' not found at ${preset_path}")
      continue
    fi

    local preset_content
    preset_content="$(cat "$preset_path")"

    while IFS= read -r step_name; do
      [[ -z "$step_name" ]] && continue
      # Check if step name appears as a key in the steps section (e.g., "  step-name:")
      if ! echo "$preset_content" | grep -q "^[[:space:]]*${step_name}:"; then
        failures+=("${preset}: missing pipeline step '${step_name}'")
      fi
    done <<< "$step_names"
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Preset exhaustiveness failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "preset files do not reference non-existent pipeline steps" {
  local failures=()
  local step_names
  step_names="$(get_pipeline_names)"

  for preset in "${PRESET_FILES[@]}"; do
    local preset_path="${PROJECT_ROOT}/content/methodology/${preset}"
    [[ ! -f "$preset_path" ]] && continue

    # Extract step names from preset (lines matching "  step-name: {")
    local preset_steps
    preset_steps="$(awk '/^steps:/{found=1; next} found && /^[[:space:]]+[a-z]/ {
      sub(/^[[:space:]]+/, ""); sub(/:.*/, ""); print
    }' "$preset_path" | sort)"

    while IFS= read -r preset_step; do
      [[ -z "$preset_step" ]] && continue
      # Skip comment lines that may have been picked up
      [[ "$preset_step" == \#* ]] && continue
      if ! echo "$step_names" | grep -qx "$preset_step"; then
        failures+=("${preset}: references '${preset_step}' which is not a pipeline step")
      fi
    done <<< "$preset_steps"
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Stale preset entries:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}
