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
  local content
  content="$(cat "$skill_file")"

  # Must activate for these patterns
  for phrase in "run scaffold" "run the next scaffold step" "what's next" "scaffold status"; do
    if ! echo "$content" | grep -qi "$phrase"; then
      failures+=("scaffold-runner missing trigger phrase: '$phrase'")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Missing trigger phrases:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "scaffold-runner activates for batch execution requests" {
  local skill_file="${SKILLS_DIR}/scaffold-runner/SKILL.md"
  [[ -f "$skill_file" ]] || skip "scaffold-runner not found"

  local failures=()
  local content
  content="$(cat "$skill_file")"

  for phrase in "run all reviews" "run phases" "re-run" "finish the pipeline"; do
    if ! echo "$content" | grep -qi "$phrase"; then
      failures+=("scaffold-runner missing batch trigger phrase: '$phrase'")
    fi
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Missing batch trigger phrases:\n"
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

  local content
  content="$(cat "$skill_file")"

  # Must mention these use cases
  for phrase in "pipeline design" "dependency" "step reference"; do
    if ! echo "$content" | grep -qi "$phrase"; then
      echo "scaffold-pipeline missing static reference use case: '$phrase'"
      return 1
    fi
  done
}

# --- multi-model-dispatch activation ---

@test "multi-model-dispatch activates for review dispatch patterns" {
  local skill_file="${SKILLS_DIR}/multi-model-dispatch/SKILL.md"
  [[ -f "$skill_file" ]] || skip "multi-model-dispatch not found"

  local content
  content="$(cat "$skill_file")"

  local failures=()
  for phrase in "depth 4" "codex" "gemini" "review"; do
    if ! echo "$content" | grep -qi "$phrase"; then
      failures+=("multi-model-dispatch missing trigger context: '$phrase'")
    fi
  done

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
