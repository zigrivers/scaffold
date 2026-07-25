#!/usr/bin/env bats
# Eval: Adoption Mode Specifics block convention (brownfield R3, D11)
# Guards: (1) every adoption-capable step carries exactly one
# "## Adoption Mode Specifics" block; (2) ordering — Mode Detection before
# Update Mode Specifics before Adoption Mode Specifics; (3) required bullets
# present; (4) pipeline-wide consistency for any file carrying the block.
# The ADOPTION_STEP_FILES manifest is the pinned adoption-capable list from
# docs/superpowers/plans/2026-07-19-brownfield-r3-adoption-mode.md.

setup() {
  load eval_helper
}

# Grows with each authoring batch; final list is the 18 adoption-capable steps.
ADOPTION_STEP_FILES=(
  "foundation/tech-stack.md"
  "foundation/coding-standards.md"
  "foundation/tdd.md"
  "foundation/project-structure.md"
  "foundation/beads.md"
  "foundation/github-setup.md"
  "environment/dev-env-setup.md"
  "environment/git-workflow.md"
  "environment/merge-throughput.md"
  "environment/staging-environments.md"
)

@test "adoption-capable steps carry exactly one Adoption Mode Specifics block" {
  local failures=()
  for rel in "${ADOPTION_STEP_FILES[@]}"; do
    local f="${PROJECT_ROOT}/content/pipeline/${rel}"
    if [[ ! -f "$f" ]]; then
      failures+=("$rel: file missing")
      continue
    fi
    local count
    count="$(grep -c '^## Adoption Mode Specifics$' "$f" || true)"
    [[ "$count" -eq 1 ]] || failures+=("$rel: expected 1 block, found ${count}")
  done
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Adoption Mode Specifics presence failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "any Adoption Mode Specifics block follows Mode Detection and Update Mode Specifics" {
  local failures=()
  while IFS= read -r file; do
    grep -q '^## Adoption Mode Specifics$' "$file" || continue
    local md ums ams
    md="$(grep -n '^## Mode Detection' "$file" | head -1 | cut -d: -f1)"
    ums="$(grep -n '^## Update Mode Specifics' "$file" | head -1 | cut -d: -f1)"
    ams="$(grep -n '^## Adoption Mode Specifics$' "$file" | head -1 | cut -d: -f1)"
    if [[ -z "$md" || -z "$ums" ]]; then
      failures+=("$(basename "$file"): has Adoption block but missing Mode Detection or Update Mode Specifics")
      continue
    fi
    if ! [[ "$md" -lt "$ums" && "$ums" -lt "$ams" ]]; then
      failures+=("$(basename "$file"): ordering violated (MD:${md} UMS:${ums} AMS:${ams})")
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Adoption block ordering failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}

@test "Adoption Mode Specifics blocks carry the required bullets" {
  local failures=()
  while IFS= read -r file; do
    grep -q '^## Adoption Mode Specifics$' "$file" || continue
    local section
    section="$(awk '/^## Adoption Mode Specifics$/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    for marker in '\*\*Codify from repo evidence\*\*' '\*\*Interview only for\*\*' '\*\*Do not\*\*'; do
      if ! echo "$section" | grep -qE "$marker"; then
        failures+=("$(basename "$file"): missing required bullet ${marker//\\/}")
      fi
    done
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)
  if [[ ${#failures[@]} -gt 0 ]]; then
    printf "Adoption block bullet failures:\n"
    printf "  %s\n" "${failures[@]}"
    return 1
  fi
}
