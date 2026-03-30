#!/usr/bin/env bats
# Eval: Quality Criteria Contradiction Detection
# Detects contradictory depth-tagged QC criteria within pipeline steps.
# The 3-X2 pattern: an untagged "all X pass" criterion that contradicts an
# (mvp)-scoped criterion covering only a subset of X.

setup() {
  load eval_helper
}

# --- Test 1: No untagged "all pass" criterion contradicts a (mvp)-tagged criterion ---
# If a step has both an untagged criterion like "all tests pass" (which applies at
# every depth) AND an (mvp) criterion like "(mvp) critical tests pass", then the
# untagged line requires all tests at mvp depth — contradicting the mvp relaxation.
# This is the 3-X2 pattern from the R6 audit.

@test "no untagged 'all pass' criterion contradicts a depth-tagged criterion in the same step" {
  local failures=()

  while IFS= read -r file; do
    local qc_section
    qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$qc_section" ]] && continue

    # Check if the step has any (mvp)-tagged "pass" criteria
    local has_mvp_pass
    has_mvp_pass="$(echo "$qc_section" | grep -c '(mvp).*pass' || true)"
    [[ "$has_mvp_pass" -eq 0 ]] && continue

    # Now check for untagged lines that say "all X pass" (no depth tag prefix)
    # Untagged lines start with "- " and do NOT start with "- (mvp)" or "- (deep)"
    local untagged_all_pass
    untagged_all_pass="$(echo "$qc_section" | grep -E '^- [^(]' | grep -iE '\ball\b.*pass' || true)"

    if [[ -n "$untagged_all_pass" ]]; then
      failures+=("$(basename "$file"): untagged 'all pass' criterion conflicts with (mvp)-scoped pass criteria")
      printf "  Untagged: %s\n" "$untagged_all_pass" >&2
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "QC contradiction failures (%d):\n" "${#failures[@]}"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Test 2: No step has both an untagged and a (deep) version of the same criterion ---
# If "- Criterion X" exists (untagged, applies at all depths) alongside
# "- (deep) Criterion X with more detail", the untagged version makes X apply
# everywhere AND the deep version also applies, creating duplication/contradiction.
# Detection: strip "(deep) " from deep criteria and check for exact matches
# with untagged criteria in the same file.

@test "no step has duplicate untagged and (deep) versions of the same criterion" {
  local failures=()

  while IFS= read -r file; do
    local qc_section
    qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$qc_section" ]] && continue

    # Extract untagged criteria text (lines starting "- " without a tag)
    local untagged_texts
    untagged_texts="$(echo "$qc_section" | grep -E '^- [^(]' | sed 's/^- //' || true)"
    [[ -z "$untagged_texts" ]] && continue

    # Extract deep criteria and strip the tag to get the base text
    local deep_texts
    deep_texts="$(echo "$qc_section" | grep -E '^- \(deep\)' | sed 's/^- (deep) //' || true)"
    [[ -z "$deep_texts" ]] && continue

    # Check if any deep criterion text exactly matches an untagged criterion text
    while IFS= read -r deep_text; do
      [[ -z "$deep_text" ]] && continue
      if echo "$untagged_texts" | grep -qxF "$deep_text"; then
        failures+=("$(basename "$file"): '${deep_text}' appears both untagged and as (deep) criterion")
      fi
    done <<< "$deep_texts"
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Duplicate untagged/(deep) criterion failures (%d):\n" "${#failures[@]}"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Test 3: new-enhancement.md QC has no unqualified 'thorough' language ---
# 'thorough' without a depth qualifier in QC criteria is a vague absolute
# that can conflict with (mvp)-scoped criteria. Checks the QC section only.

@test "new-enhancement QC has no unqualified 'thorough' language" {
  local new_enhancement="${PROJECT_ROOT}/pipeline/build/new-enhancement.md"
  [[ -f "$new_enhancement" ]] || {
    echo "pipeline/build/new-enhancement.md not found"
    return 1
  }

  local qc_section
  qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$new_enhancement")"

  if echo "$qc_section" | grep -qiE '\bthorough(ly|ness)?\b'; then
    printf "new-enhancement.md QC section contains unqualified 'thorough' language:\n"
    echo "$qc_section" | grep -niE '\bthorough(ly|ness)?\b'
    return 1
  fi
}
