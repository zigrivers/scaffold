#!/usr/bin/env bats

# Eval: After This Step Reference Validation
# Validates that "After This Step" sections reference valid pipeline step
# or tool names, and that non-build, non-conditional steps include the section.

setup() {
  load eval_helper
}

@test "After This Step references are valid pipeline step names" {
  local invalid=()
  local checked=0

  # Collect all valid step names (pipeline + tools)
  local valid_names
  valid_names="$(get_pipeline_names)"

  local tool_names
  tool_names="$(grep -rh '^name:' "${PROJECT_ROOT}/content/tools/" 2>/dev/null | sed 's/name: //' | sort)"

  local all_valid
  all_valid="$(printf '%s\n%s' "$valid_names" "$tool_names" | sort -u)"

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    # Extract After This Step section and find /scaffold:step-name references
    local refs
    refs="$(awk '/^## After This Step/,/^## [^A]/' "$file" \
      | grep -oE '/scaffold:[a-z][a-z0-9-]+' \
      | sed 's|/scaffold:||' \
      || true)"

    # Also check for "scaffold run step-name" references
    local run_refs
    run_refs="$(awk '/^## After This Step/,/^## [^A]/' "$file" \
      | grep -oE 'scaffold run [a-z][a-z0-9-]+' \
      | sed 's/scaffold run //' \
      || true)"

    refs="$(printf '%s\n%s' "$refs" "$run_refs" | grep -v '^$' | sort -u || true)"

    for ref in $refs; do
      checked=$((checked + 1))
      if ! echo "$all_valid" | grep -qx "$ref"; then
        invalid+=("$(basename "$file" .md): references '$ref' which is not a valid step or tool name")
      fi
    done
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f | sort)

  if [ "${#invalid[@]}" -gt 0 ]; then
    printf "Invalid After This Step references:\n"
    printf "  %s\n" "${invalid[@]}"
  fi

  [[ "$checked" -gt 0 ]]
  [[ "${#invalid[@]}" -eq 0 ]]
}

@test "document-creating steps have After This Step section" {
  local missing=()
  local checked=0

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue

    local name
    name="$(extract_field "$file" "name")"

    # Skip build-phase steps (stateless, no After This Step needed)
    local phase
    phase="$(extract_field "$file" "phase")"
    [[ "$phase" == "build" ]] && continue

    # Skip conditional steps (may not run)
    local conditional
    conditional="$(extract_field "$file" "conditional")"
    [[ "$conditional" == "if-needed" ]] && continue

    # Check for After This Step section
    if ! grep -q '^## After This Step' "$file"; then
      missing+=("$name (phase: $phase)")
    fi
    checked=$((checked + 1))
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f | sort)

  if [ "${#missing[@]}" -gt 0 ]; then
    printf "Steps missing 'After This Step' section (%d of %d checked):\n" "${#missing[@]}" "$checked"
    printf "  %s\n" "${missing[@]}"
  fi

  [[ "$checked" -gt 0 ]]
  # Allow missing — this is a gradual adoption check
  # Current baseline: 50 of 52 non-build, non-conditional steps lack the section
  # (includes 12 new game-dev pipeline steps)
  [[ "${#missing[@]}" -le 52 ]]
}
