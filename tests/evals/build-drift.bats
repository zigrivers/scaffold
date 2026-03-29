#!/usr/bin/env bats
# Eval 14: Build Drift Detection
# Pipeline steps and their corresponding commands should stay in sync.
# Flags pipeline files modified more recently than their command counterpart,
# and checks that pipeline descriptions are reflected in command files.

setup() {
  load eval_helper
  source "${BATS_TEST_DIRNAME}/exemptions.bash"
}

@test "pipeline steps modified after their command are flagged (warning)" {
  local warnings=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local name
    name="$(extract_field "$pipeline_file" "name")"
    local cmd_file="${PROJECT_ROOT}/commands/${name}.md"
    [[ ! -f "$cmd_file" ]] && continue

    checked=$((checked + 1))

    local pipeline_mtime cmd_mtime
    pipeline_mtime="$(stat -f %m "$pipeline_file" 2>/dev/null || stat -c %Y "$pipeline_file" 2>/dev/null)"
    cmd_mtime="$(stat -f %m "$cmd_file" 2>/dev/null || stat -c %Y "$cmd_file" 2>/dev/null)"

    if [[ "$pipeline_mtime" -gt "$cmd_mtime" ]]; then
      local diff_secs=$(( pipeline_mtime - cmd_mtime ))
      # Only flag if the difference is more than 60 seconds (avoid build tool timing)
      if [[ "$diff_secs" -gt 60 ]]; then
        warnings+=("${name}: pipeline modified ${diff_secs}s after command — may need rebuild")
      fi
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  printf "Checked %d pipeline/command pairs for drift\n" "$checked"

  if [[ ${#warnings[@]} -gt 0 ]]; then
    printf "WARNING: %d pipeline steps may have drifted from commands (run 'scaffold build'):\n" "${#warnings[@]}"
    printf "  %s\n" "${warnings[@]}"
  fi

  # Informational — warn but don't fail. The build process handles sync.
  [[ "$checked" -gt 0 ]]
}

@test "pipeline step descriptions are substantively reflected in command descriptions" {
  local failures=()
  local checked=0

  while IFS= read -r pipeline_file; do
    local name pipeline_desc cmd_desc
    name="$(extract_field "$pipeline_file" "name")"
    local cmd_file="${PROJECT_ROOT}/commands/${name}.md"
    [[ ! -f "$cmd_file" ]] && continue

    pipeline_desc="$(extract_field "$pipeline_file" "description")"
    cmd_desc="$(extract_field "$cmd_file" "description")"
    [[ -z "$pipeline_desc" || -z "$cmd_desc" ]] && continue

    checked=$((checked + 1))

    # Extract key words from pipeline description (4+ char words, lowercased).
    # Apply simple stemming (strip trailing s/ing/able) for fuzzy matching.
    local key_words matched=0 total=0
    key_words="$(echo "$pipeline_desc" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alpha:]' '\n' | awk 'length >= 4' | sort -u)"
    local cmd_lower
    cmd_lower="$(echo "$cmd_desc" | tr '[:upper:]' '[:lower:]')"

    while IFS= read -r word; do
      [[ -z "$word" ]] && continue
      total=$((total + 1))
      # Try exact match first, then stemmed match
      if echo "$cmd_lower" | grep -qw "$word"; then
        matched=$((matched + 1))
      else
        # Simple stemming: strip trailing s, ing, able, tion
        local stem="${word%s}"; stem="${stem%ing}"; stem="${stem%able}"; stem="${stem%tion}"
        if [[ ${#stem} -ge 3 ]] && echo "$cmd_lower" | grep -q "$stem"; then
          matched=$((matched + 1))
        fi
      fi
    done <<< "$key_words"

    # At least one key word from the pipeline description should appear in
    # the command description. Threshold is minimal because command descriptions
    # are editorial rewrites — we only flag complete topic divergence.
    if [[ "$total" -gt 2 && "$matched" -eq 0 ]]; then
      failures+=("${name}: zero keyword overlap (pipeline='${pipeline_desc}' vs command='${cmd_desc}')")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  printf "Checked %d pipeline/command description pairs\n" "$checked"

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Description drift failures (%d):\n" "${#failures[@]}"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
