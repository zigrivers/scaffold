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

    # Extract meaningful words from pipeline description:
    # 5+ char words, lowercased, with common stop words removed.
    # Stop words are filtered by awk to avoid subshell loop fragility.
    local key_words matched=0 total=0
    key_words="$(echo "$pipeline_desc" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alpha:]' '\n' | awk '
      length >= 5 {
        # Exclude common stop words that carry no topical signal
        if ($0 == "about" || $0 == "after" || $0 == "against" || $0 == "being" ||
            $0 == "between" || $0 == "could" || $0 == "during" || $0 == "every" ||
            $0 == "first" || $0 == "these" || $0 == "those" || $0 == "their" ||
            $0 == "there" || $0 == "through" || $0 == "under" || $0 == "which" ||
            $0 == "where" || $0 == "while" || $0 == "would" || $0 == "should" ||
            $0 == "might" || $0 == "shall" || $0 == "without" || $0 == "across")
          next
        print
      }
    ' | sort -u)"
    local cmd_lower
    cmd_lower="$(echo "$cmd_desc" | tr '[:upper:]' '[:lower:]')"

    while IFS= read -r word; do
      [[ -z "$word" ]] && continue
      total=$((total + 1))
      # Try exact word match first, then stemmed match
      if echo "$cmd_lower" | grep -qw "$word"; then
        matched=$((matched + 1))
      else
        # Simple stemming: strip trailing ing, able, tion, ed, s (in order of specificity)
        local stem="${word%ing}"; stem="${stem%able}"; stem="${stem%tion}"; stem="${stem%ed}"; stem="${stem%s}"
        if [[ ${#stem} -ge 4 ]] && echo "$cmd_lower" | grep -qw "$stem"; then
          matched=$((matched + 1))
        fi
      fi
    done <<< "$key_words"

    # Require at least 2 meaningful words from the pipeline description to appear
    # in the command description. This catches major topic divergence while allowing
    # editorial rewrites that preserve the core subject matter.
    if [[ "$total" -gt 3 && "$matched" -lt 2 ]]; then
      failures+=("${name}: insufficient keyword overlap (${matched}/${total} meaningful words match) pipeline='${pipeline_desc}' vs command='${cmd_desc}'")
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

# --- Test 3: Key QC text matches between pipeline and command pairs ---
# Picks 5 representative steps and verifies a distinctive phrase from each
# pipeline QC section also appears verbatim in the corresponding command file.
# This catches build-drift where QC content silently diverges.

@test "key QC phrases match between pipeline and command files" {
  # 5 representative steps with a distinctive QC phrase from their pipeline file.
  # Format: "step-name|distinctive phrase from QC section"
  local -a qc_probes=(
    "create-vision|Vision statement is a single sentence of 25 words or fewer"
    "create-prd|Problem statement names a specific user group"
    "tech-stack|No speculative technologies"
    "coding-standards|Every standard references the specific tech stack"
    "dev-env-setup|Dev server starts with a single command"
  )

  local failures=()
  local checked=0

  for probe in "${qc_probes[@]}"; do
    local step_name="${probe%%|*}"
    local expected_phrase="${probe##*|}"

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

    if [[ -z "$pipeline_file" ]]; then
      failures+=("${step_name}: pipeline file not found")
      continue
    fi

    local cmd_file="${PROJECT_ROOT}/commands/${step_name}.md"
    if [[ ! -f "$cmd_file" ]]; then
      failures+=("${step_name}: command file not found at commands/${step_name}.md")
      continue
    fi

    checked=$((checked + 1))

    # Verify the phrase exists in the pipeline QC section
    local pipeline_qc
    pipeline_qc="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$pipeline_file")"
    if ! echo "$pipeline_qc" | grep -qF "$expected_phrase"; then
      failures+=("${step_name}: probe phrase not found in pipeline QC (test data stale?): '${expected_phrase}'")
      continue
    fi

    # Verify the same phrase appears in the command file
    if ! grep -qF "$expected_phrase" "$cmd_file"; then
      failures+=("${step_name}: QC phrase missing from command file: '${expected_phrase}'")
    fi
  done

  printf "Checked %d pipeline/command QC phrase pairs\n" "$checked"

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "QC text drift failures (%d):\n" "${#failures[@]}"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi

  [[ "$checked" -gt 0 ]]
}
