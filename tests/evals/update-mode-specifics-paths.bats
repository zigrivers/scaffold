#!/usr/bin/env bats
# Eval: Update Mode Specifics Path Validation
# Verifies that UMS Detect paths match declared outputs and that steps with
# Mode Detection declare at least one output.

setup() {
  load eval_helper
}

# --- Test 1: UMS Detect paths match declared outputs ---
# For each pipeline step that has a "Detect prior artifact:" line, extract the
# file/directory path from that line and verify it appears in the step's
# frontmatter outputs: field. This catches the 1-M6/1-M7 class of UMS mismatches
# where the detect path references an artifact the step doesn't produce.

@test "UMS Detect paths match step declared outputs" {
  local failures=()

  while IFS= read -r file; do
    # Skip stateless steps — they modify/read existing docs without creating new outputs
    local stateless
    stateless="$(extract_field "$file" "stateless")"
    [[ "$stateless" == "true" ]] && continue

    # Extract the detect path from the UMS section
    local ums_section
    ums_section="$(awk '/^## Update Mode Specifics/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$ums_section" ]] && continue

    # Find "**Detect**:" line and extract the path
    # Supports both current format (**Detect**:) and legacy (**Detect prior artifact**:)
    local detect_line detect_path
    detect_line="$(echo "$ums_section" | grep -iE '\*\*Detect[^:]*\*\*:' || true)"
    [[ -z "$detect_line" ]] && continue

    # Extract path: everything after "**Detect[...]***: " up to first space or end
    detect_path="$(echo "$detect_line" | sed -E 's/.*\*\*Detect[^:]*\*\*:[[:space:]]*//' | awk '{print $1}')"
    [[ -z "$detect_path" ]] && continue

    # Strip backtick quoting
    detect_path="$(echo "$detect_path" | tr -d '`')"

    # Skip if detect_path doesn't look like a filesystem path (no / or . = plain word)
    [[ "$detect_path" != */* && "$detect_path" != *.* ]] && continue
    # Skip if detect_path is an HTML/XML comment token
    [[ "$detect_path" == "<"* ]] && continue

    # Normalize detect path for matching:
    # - Strip trailing slash (directory detects like "dir/")
    # - Handle extension alternation like "playwright.config.ts/.js" → "playwright.config.ts"
    local detect_norm="${detect_path%/}"
    [[ "$detect_norm" == */.* ]] && detect_norm="${detect_norm%%/*}"

    # Get the outputs: field from frontmatter
    local outputs_raw
    outputs_raw="$(extract_field "$file" "outputs" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//')"
    [[ -z "$outputs_raw" ]] && {
      failures+=("$(basename "$file"): has Detect path '${detect_path}' but outputs: field is empty")
      continue
    }

    # Check if the detect path (or its basename, or as a directory prefix) appears in outputs
    local found=false
    while IFS= read -r output_path; do
      [[ -z "$output_path" ]] && continue
      # Exact match
      if [[ "$output_path" == "$detect_norm" || "$output_path" == "$detect_path" ]]; then
        found=true; break
      fi
      # Basename match
      if [[ "$(basename "$detect_norm")" == "$(basename "$output_path")" ]]; then
        found=true; break
      fi
      # Directory prefix match: detect_norm is a path prefix of output_path
      if [[ "$output_path" == "$detect_norm"* ]]; then
        found=true; break
      fi
    done <<< "$outputs_raw"

    if [[ "$found" == "false" ]]; then
      failures+=("$(basename "$file"): Detect path '${detect_path}' not found in frontmatter outputs: [${outputs_raw//$'\n'/, }]")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "UMS Detect path mismatches (%d):\n" "${#failures[@]}"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Test 2: UMS Detect paths don't cross-reference another step's primary output ---
# A step's Detect path should match one of its own declared outputs — not an
# output belonging exclusively to a different step. If step A detects step B's
# primary output, the detect field is likely wrong.

@test "UMS Detect paths are not exclusive outputs of other steps" {
  # Build a map of output_path -> step name(s) that produce it
  local -a output_owners=()   # "path:step_name" pairs
  while IFS= read -r file; do
    local name outputs_raw
    name="$(extract_field "$file" "name")"
    [[ -z "$name" ]] && continue
    outputs_raw="$(extract_field "$file" "outputs" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//')"
    [[ -z "$outputs_raw" ]] && continue
    while IFS= read -r op; do
      [[ -z "$op" ]] && continue
      output_owners+=("${op}:${name}")
    done <<< "$outputs_raw"
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  local failures=()

  while IFS= read -r file; do
    # Skip stateless steps — they modify/read existing docs without creating new outputs
    local stateless
    stateless="$(extract_field "$file" "stateless")"
    [[ "$stateless" == "true" ]] && continue

    local name ums_section detect_line detect_path
    name="$(extract_field "$file" "name")"
    ums_section="$(awk '/^## Update Mode Specifics/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$ums_section" ]] && continue

    detect_line="$(echo "$ums_section" | grep -iE '\*\*Detect[^:]*\*\*:' || true)"
    [[ -z "$detect_line" ]] && continue

    detect_path="$(echo "$detect_line" | sed -E 's/.*\*\*Detect[^:]*\*\*:[[:space:]]*//' | awk '{print $1}' | tr -d '`')"
    [[ -z "$detect_path" ]] && continue

    # Skip non-path detect strings
    [[ "$detect_path" != */* && "$detect_path" != *.* ]] && continue
    [[ "$detect_path" == "<"* ]] && continue

    # Normalize (same as test 1)
    local detect_norm="${detect_path%/}"
    [[ "$detect_norm" == */.* ]] && detect_norm="${detect_norm%%/*}"

    # Check if this detect_path is the output of a DIFFERENT step but NOT this step
    local own_outputs
    own_outputs="$(extract_field "$file" "outputs" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//')"

    # If it's in own outputs, it's fine
    if echo "$own_outputs" | grep -qxF "$detect_norm"; then
      continue
    fi

    # Check if another step exclusively owns this path
    local other_owner=""
    for pair in "${output_owners[@]}"; do
      local op="${pair%%:*}"
      local owner="${pair##*:}"
      if [[ "$op" == "$detect_norm" && "$owner" != "$name" ]]; then
        other_owner="$owner"
        break
      fi
    done

    if [[ -n "$other_owner" ]]; then
      failures+=("$(basename "$file"): Detect path '${detect_path}' is an output of step '${other_owner}', not this step")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "UMS Detect path cross-step violations (%d):\n" "${#failures[@]}"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Test 3: Steps with Mode Detection have at least one declared output ---
# Mode Detection detects whether a prior artifact exists. If the step has no
# declared outputs:, Mode Detection has nothing to detect and is likely misconfigured.
# Stateless steps are exempt — they modify/read existing docs without creating outputs.

@test "steps with active Mode Detection have at least one declared output" {
  local missing=()
  local checked=0

  while IFS= read -r file; do
    # Skip stateless steps — they don't produce document outputs
    local stateless
    stateless="$(extract_field "$file" "stateless")"
    [[ "$stateless" == "true" ]] && continue

    local mode_section
    mode_section="$(awk '/^## Mode Detection/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$mode_section" ]] && continue

    # Skip steps where Mode Detection is N/A or runs once
    echo "$mode_section" | grep -qiE 'not applicable|N/A|runs once|always create' && continue

    checked=$((checked + 1))

    local outputs_raw
    outputs_raw="$(extract_field "$file" "outputs" | sed 's/\[//;s/\]//'| tr -d ' ')"
    if [[ -z "$outputs_raw" || "$outputs_raw" == "null" || "$outputs_raw" == "[]" ]]; then
      missing+=("$(basename "$file")")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  printf "Steps with active Mode Detection: %d checked, %d missing outputs\n" "$checked" "${#missing[@]}"

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "Steps with Mode Detection but no declared outputs:\n"
    printf "  %s\n" "${missing[@]}"
    return 1
  fi
}
