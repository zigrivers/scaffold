#!/usr/bin/env bats
# tests/evals/overlay-structural-coverage.bats
#
# Structural invariants for every project-type overlay. Applies to all current
# overlays plus any future ones. Deliberately NARROWER than knowledge-quality.bats
# (which already covers the knowledge-entry orphan check).

load '../evals/eval_helper'

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"

# Project-type overlays are files of the form `{type}-overlay.yml`.
# Structural overlays (e.g. multi-service-overlay.yml) share the `-overlay.yml`
# suffix but are NOT project-type overlays — they have no `project-type:` field.
# Exclude them by name so the project-type-specific assertions don't fire on
# structural overlays. Add future structural overlays to the exclusion list.
PROJECT_TYPE_OVERLAYS="$(find "${PROJECT_ROOT}/content/methodology" -name '*-overlay.yml' -type f \
  | grep -v '/multi-service-overlay\.yml$')"

@test "every project-type overlay has required frontmatter fields" {
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    for field in name description project-type; do
      if ! grep -q "^${field}:" "$overlay"; then
        failures+=("$(basename "$overlay"): missing '${field}' field")
      fi
    done
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "every project-type overlay's project-type matches the filename" {
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    local expected declared
    expected="$(basename "$overlay" | sed 's/-overlay\.yml$//')"
    declared="$(grep '^project-type:' "$overlay" | sed 's/^project-type: *//;s/[[:space:]]*$//')"
    if [[ "$expected" != "$declared" ]]; then
      failures+=("$(basename "$overlay"): project-type='${declared}' but filename implies '${expected}'")
    fi
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "every project-type overlay uses inline-array append values (not block-style)" {
  # The next assertion's grep-based reference scan assumes inline form
  # (`append: [a, b]`). Block-style (`append:\n  - a\n  - b`) would escape
  # the scan and silently pass. Enforce inline form so the reference check
  # stays honest.
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    if grep -E '^[[:space:]]*append:[[:space:]]*$' "$overlay" > /dev/null; then
      failures+=("$(basename "$overlay"): uses block-style 'append:' — switch to inline '[a, b]' form")
    fi
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "no project-type overlay contains cross-reads-overrides" {
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    if grep -q '^cross-reads-overrides:' "$overlay"; then
      failures+=("$(basename "$overlay"): contains cross-reads-overrides (not allowed for project-type overlays)")
    fi
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "every overlay's knowledge-overrides references valid pipeline step or tool slugs" {
  # Overlays can inject knowledge into pipeline steps AND tool meta-prompts.
  # Both are valid targets per the overlay loader / prompt assembler.
  local all_slugs failures=()
  all_slugs="$(find "${PROJECT_ROOT}/content/pipeline" "${PROJECT_ROOT}/content/tools" -name '*.md' -type f -exec basename {} .md \; | sort -u)"

  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    local slugs
    slugs="$(awk '/^knowledge-overrides:/{flag=1; next} /^[a-zA-Z]/{flag=0} flag && /^  [a-z][a-z0-9-]*:/{sub(/:.*/,""); sub(/^  /,""); print}' "$overlay")"
    for slug in $slugs; do
      if ! grep -qx "$slug" <<< "$all_slugs"; then
        failures+=("$(basename "$overlay"): references unknown step slug '${slug}'")
      fi
    done
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}

@test "every overlay's knowledge-overrides references existing knowledge entries" {
  local failures=()
  for overlay in ${PROJECT_TYPE_OVERLAYS}; do
    local type entries knowledge_block
    type="$(basename "$overlay" | sed 's/-overlay\.yml$//')"
    # If the knowledge dir does not yet exist, skip — assertion will fire once it
    # lands (typical during overlay bootstrap in a feature branch).
    [[ -d "${PROJECT_ROOT}/content/knowledge/${type}" ]] || continue
    # Scope the scan to the `knowledge-overrides:` block only — other blocks
    # (e.g. `dependency-overrides:`) also use `append:` but reference step
    # slugs, not knowledge entries, so they must not be checked here.
    knowledge_block="$(awk '/^knowledge-overrides:/{flag=1; next} /^[a-zA-Z]/{flag=0} flag' "$overlay")"
    entries="$(printf '%s\n' "$knowledge_block" | grep -oE 'append: \[[^]]+\]' | sed 's/append: \[//;s/\]$//' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort -u | grep -v '^$')"
    for entry in $entries; do
      local file="${PROJECT_ROOT}/content/knowledge/${type}/${entry}.md"
      if [[ ! -f "$file" ]]; then
        failures+=("$(basename "$overlay"): references missing knowledge entry '${entry}' (expected at ${file})")
      fi
    done
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "%s\n" "${failures[@]}"
    return 1
  fi
}
