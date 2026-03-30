#!/usr/bin/env bats
# Eval 7: Skill Trigger Validation
# Verifies skill activation patterns are correctly configured to prevent
# misactivation and ensure proper routing between skills.

setup() {
  load eval_helper
  SKILLS_DIR="${PROJECT_ROOT}/skills"
}

# --- scaffold-runner activation ---

@test "scaffold-runner activates for run/execute requests" {
  local skill_file="${SKILLS_DIR}/scaffold-runner/SKILL.md"
  [[ -f "$skill_file" ]] || skip "scaffold-runner not found"

  local failures=()
  local activation_section
  # Scope to the activation section to avoid false positives from prose elsewhere
  activation_section="$(awk '/^## When This Skill Activates/{found=1; next} /^## /{if(found) exit} found{print}' "$skill_file")"

  if [[ -z "$activation_section" ]]; then
    failures+=("scaffold-runner missing '## When This Skill Activates' section")
  else
    # Check that single-step run patterns are covered (OR groups — any phrasing counts)
    if ! echo "$activation_section" | grep -qi 'run scaffold\|scaffold run\|run.*scaffold step'; then
      failures+=("scaffold-runner activation section missing run/execute trigger pattern")
    fi
    if ! echo "$activation_section" | grep -qi "what.*next\|scaffold status\|where am i\|pipeline status"; then
      failures+=("scaffold-runner activation section missing status/navigation trigger pattern")
    fi
    if ! echo "$activation_section" | grep -qi 'run.*step\|next step\|next scaffold'; then
      failures+=("scaffold-runner activation section missing next-step trigger pattern")
    fi
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Missing trigger patterns:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "scaffold-runner activates for batch execution requests" {
  local skill_file="${SKILLS_DIR}/scaffold-runner/SKILL.md"
  [[ -f "$skill_file" ]] || skip "scaffold-runner not found"

  local failures=()
  local activation_section
  activation_section="$(awk '/^## When This Skill Activates/{found=1; next} /^## /{if(found) exit} found{print}' "$skill_file")"

  if [[ -z "$activation_section" ]]; then
    failures+=("scaffold-runner missing '## When This Skill Activates' section")
  else
    # Check batch execution triggers using OR groups — any phrasing within the group counts
    if ! echo "$activation_section" | grep -qi 'run all\|run phases\|run.*next.*steps\|finish the pipeline\|batch'; then
      failures+=("scaffold-runner activation section missing batch execution trigger pattern")
    fi
    if ! echo "$activation_section" | grep -qi 're-run\|redo\|rework'; then
      failures+=("scaffold-runner activation section missing re-run/rework trigger pattern")
    fi
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Missing batch trigger patterns:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- scaffold-pipeline activation boundary ---

@test "scaffold-pipeline has activation boundary directing status queries away" {
  local skill_file="${SKILLS_DIR}/scaffold-pipeline/SKILL.md"
  [[ -f "$skill_file" ]] || skip "scaffold-pipeline not found"

  local content
  content="$(cat "$skill_file")"

  # Must explicitly redirect status/navigation to scaffold-runner
  if ! echo "$content" | grep -qi "do not use this skill"; then
    echo "scaffold-pipeline missing activation boundary (should redirect status queries to scaffold-runner)"
    return 1
  fi

  if ! echo "$content" | grep -qi "scaffold-runner"; then
    echo "scaffold-pipeline doesn't reference scaffold-runner for status delegation"
    return 1
  fi
}

@test "scaffold-pipeline activates only for static reference queries" {
  local skill_file="${SKILLS_DIR}/scaffold-pipeline/SKILL.md"
  [[ -f "$skill_file" ]] || skip "scaffold-pipeline not found"

  # Scope checks to the activation/description sections rather than full-file grep.
  # This avoids false positives from prose mentions of these concepts elsewhere.
  local activation_section
  activation_section="$(awk '/^## /{if(found) exit} /Use this skill ONLY|When.*Activates|Use ONLY/{found=1} found{print}' "$skill_file")"
  # Fallback: first 30 lines of body after frontmatter if no clear section header matches
  if [[ -z "$activation_section" ]]; then
    activation_section="$(awk '/^---$/{fm++; next} fm>=2{print; count++} count>=30{exit}' "$skill_file")"
  fi

  # Check that static reference use cases are described using OR groups.
  # These verify the skill covers pipeline design, ordering, and dependency queries.
  local failures=()
  if ! echo "$activation_section" | grep -qi 'pipeline design\|what phases\|ordering'; then
    failures+=("scaffold-pipeline missing pipeline design / ordering use case")
  fi
  if ! echo "$activation_section" | grep -qi 'depend\|what depends'; then
    failures+=("scaffold-pipeline missing dependency query use case")
  fi
  if ! echo "$activation_section" | grep -qi 'step reference\|commands.*phase\|what commands'; then
    failures+=("scaffold-pipeline missing step reference use case")
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "scaffold-pipeline missing static reference use cases:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- multi-model-dispatch activation ---

@test "multi-model-dispatch activates for review dispatch patterns" {
  local skill_file="${SKILLS_DIR}/multi-model-dispatch/SKILL.md"
  [[ -f "$skill_file" ]] || skip "multi-model-dispatch not found"

  # Scope checks to the activation/description sections rather than full-file grep.
  # This avoids false positives from negation prose or unrelated prose mentions.
  local activation_section description
  activation_section="$(awk '/^## When This Skill Activates/{found=1; next} /^## /{if(found) exit} found{print}' "$skill_file")"
  description="$(awk '/^---$/{fm++; next} fm==1 && /^description:/{print; exit}' "$skill_file")"

  local failures=()

  # Verify the skill covers multi-model dispatch context using OR groups.
  # Any variant phrasing within the group counts — not exact string matching.
  if ! echo "$activation_section" | grep -qi 'depth 4\|depth 5\|depth [45]'; then
    failures+=("multi-model-dispatch activation section missing depth 4/5 trigger context")
  fi
  if ! echo "$activation_section" | grep -qi 'codex\|external.*model\|independent.*review'; then
    failures+=("multi-model-dispatch activation section missing Codex/external-model context")
  fi
  if ! echo "$activation_section" | grep -qi 'gemini\|second opinion'; then
    failures+=("multi-model-dispatch activation section missing Gemini/second-opinion context")
  fi
  if ! echo "$activation_section$description" | grep -qi 'review\|dispatch\|validation'; then
    failures+=("multi-model-dispatch missing review/dispatch/validation context")
  fi

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Missing dispatch trigger context:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

# --- Cross-skill consistency ---

@test "all skills have required frontmatter fields" {
  local failures=()
  while IFS= read -r file; do
    for field in name description; do
      if ! has_field "$file" "$field"; then
        failures+=("$(basename "$(dirname "$file")")/$(basename "$file"): missing field '$field'")
      fi
    done
  done < <(find "${SKILLS_DIR}" -name 'SKILL.md' -type f)

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Skill frontmatter failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "no two skills have overlapping primary activation patterns" {
  # scaffold-runner handles: run, status, next, skip, batch
  # scaffold-pipeline handles: pipeline design, ordering, dependencies (static)
  # multi-model-dispatch handles: CLI invocation patterns for Codex/Gemini

  local runner_desc pipeline_desc
  runner_desc="$(extract_field "${SKILLS_DIR}/scaffold-runner/SKILL.md" "description")"
  pipeline_desc="$(extract_field "${SKILLS_DIR}/scaffold-pipeline/SKILL.md" "description")"

  # Pipeline skill description must NOT claim to handle status/progress
  # (mentioning "NOT for status" as a redirect is fine — it's the boundary)
  if echo "$pipeline_desc" | grep -qi "status" | grep -qvi "NOT for status\|not for status"; then
    echo "scaffold-pipeline description overlaps with scaffold-runner (claims status handling)"
    return 1
  fi
  # Should not positively claim status handling
  if echo "$pipeline_desc" | grep -qi "show.*status\|check.*progress\|track.*progress"; then
    echo "scaffold-pipeline description overlaps with scaffold-runner (claims status handling)"
    return 1
  fi

  # Runner skill must NOT mention "static reference" or "ordering" in description
  if echo "$runner_desc" | grep -qi "static reference\|ordering"; then
    echo "scaffold-runner description overlaps with scaffold-pipeline (mentions static reference/ordering)"
    return 1
  fi
}
