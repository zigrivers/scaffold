#!/usr/bin/env bats
# Eval 10: Prompt Quality
# Pipeline step body content meets minimum quality standards.
# Validates content quality beyond just structural presence.

setup() {
  load eval_helper
}

# Only check sections that should always have multi-line content.
# Expected Outputs and Inputs can legitimately be 1 line (just a file path).
SUBSTANTIVE_SECTIONS=("## Purpose" "## Quality Criteria")

# Minimum lines of content per required section (excluding blank lines)
MIN_SECTION_LINES=4

@test "required sections have substantive content (not empty stubs)" {
  local failures=()
  local checked=0

  while IFS= read -r file; do
    for section in "${SUBSTANTIVE_SECTIONS[@]}"; do
      # Count lines between this section and the next ## heading
      local content_lines
      content_lines="$(awk -v s="$section" '
        $0 == s { found=1; next }
        found && /^## / { exit }
        found && NF > 0 { count++ }
        END { print count+0 }
      ' "$file")"

      checked=$((checked + 1))

      if [[ "$content_lines" -lt "$MIN_SECTION_LINES" ]]; then
        failures+=("$(basename "$file"): section '${section}' has only ${content_lines} content lines (min ${MIN_SECTION_LINES})")
      fi
    done
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Thin section content (%d sections checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}

@test "pipeline steps have no placeholder text (TODO, TBD, FIXME)" {
  local failures=()

  while IFS= read -r file; do
    # Search body (after second ---) for placeholder markers
    local body
    body="$(awk '/^---$/{ if(++c==2) start=1; next } start{print}' "$file")"

    local placeholders
    # Match TODO/TBD/FIXME at line start or as action markers (TODO:, FIXME:)
    # Exclude inline references like "TODO format" which are domain content
    placeholders="$(echo "$body" | grep -nE '^\s*(TODO|TBD|FIXME)\b|TODO:|FIXME:|TBD:|\bPLACEHOLDER\b|\bFILL IN\b' || true)"

    if [[ -n "$placeholders" ]]; then
      local count
      count="$(echo "$placeholders" | wc -l | tr -d ' ')"
      failures+=("$(basename "$file"): ${count} placeholder(s) found")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Pipeline steps with placeholder text:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "Methodology Scaling sections have both deep and mvp bullets" {
  local failures=()
  local checked=0

  while IFS= read -r file; do
    local scaling_section
    scaling_section="$(awk '/^## Methodology Scaling/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$scaling_section" ]] && continue

    checked=$((checked + 1))

    local has_deep has_mvp
    has_deep="$(echo "$scaling_section" | grep -c '^- \*\*deep\*\*' || true)"
    has_mvp="$(echo "$scaling_section" | grep -c '^- \*\*mvp\*\*' || true)"

    if [[ "$has_deep" -eq 0 ]]; then
      failures+=("$(basename "$file"): Methodology Scaling missing '- **deep**' bullet")
    fi
    if [[ "$has_mvp" -eq 0 ]]; then
      # Steps with conditional: "if-needed" may have mvp say "Not applicable"
      # but should still have the bullet present
      failures+=("$(basename "$file"): Methodology Scaling missing '- **mvp**' bullet")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Methodology Scaling format issues (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}

@test "Quality Criteria sections have depth tags" {
  local tagged_count=0
  local total_count=0
  local untagged=()

  while IFS= read -r file; do
    local qc_section
    qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$qc_section" ]] && continue

    total_count=$((total_count + 1))

    local tag_count
    tag_count="$(echo "$qc_section" | grep -c '(mvp)\|(deep)\|(depth' || true)"
    if [[ "$tag_count" -gt 0 ]]; then
      tagged_count=$((tagged_count + 1))
    else
      untagged+=("$(basename "$file")")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  printf "Quality Criteria depth tags: %d/%d steps tagged\n" "$tagged_count" "$total_count"

  if [[ "$tagged_count" -lt 35 ]]; then
    printf "FAIL: only %d steps have depth-tagged Quality Criteria (minimum 35 required)\n" "$tagged_count"
    if [[ ${#untagged[@]} -gt 0 ]]; then
      printf "Untagged steps:\n"
      printf "  %s\n" "${untagged[@]}"
    fi
  fi

  [[ "$tagged_count" -ge 35 ]]
}

@test "Mode Detection sections use consistent phrasing" {
  local failures=()
  local checked=0

  while IFS= read -r file; do
    local mode_section
    mode_section="$(awk '/^## Mode Detection/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$mode_section" ]] && continue

    checked=$((checked + 1))

    # Mode Detection should describe detection logic or explicitly mark N/A
    if ! echo "$mode_section" | grep -qi "exist\|present\|found\|check\|look\|detect\|scan\|not applicable\|runs once\|always\|first time"; then
      failures+=("$(basename "$file"): Mode Detection doesn't describe how to detect mode")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Mode Detection phrasing issues (%d checked):\n" "$checked"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
