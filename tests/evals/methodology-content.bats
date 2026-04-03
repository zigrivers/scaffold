#!/usr/bin/env bats
# Eval: Methodology Content
# Validates that methodology scaling produces meaningfully different output
# across presets and that depth metadata is present in pipeline steps.

setup() {
  load eval_helper
}

# --- Test 1: MVP preset disables more steps than it enables ---

@test "MVP preset disables more steps than it enables" {
  local mvp_file="${PROJECT_ROOT}/content/methodology/mvp.yml"
  [[ -f "$mvp_file" ]] || {
    echo "methodology/mvp.yml not found"
    return 1
  }

  local enabled disabled
  enabled="$(grep -c 'enabled: true' "$mvp_file")"
  disabled="$(grep -c 'enabled: false' "$mvp_file")"

  if [[ "$disabled" -le "$enabled" ]]; then
    printf "MVP preset should disable more steps than it enables (MVP is minimal):\n"
    printf "  enabled: %d, disabled: %d\n" "$enabled" "$disabled"
    return 1
  fi
}

# --- Test 2: deep preset enables more steps than MVP ---

@test "deep preset enables more steps than MVP" {
  local mvp_file="${PROJECT_ROOT}/content/methodology/mvp.yml"
  local deep_file="${PROJECT_ROOT}/content/methodology/deep.yml"
  [[ -f "$mvp_file" ]] || { echo "mvp.yml not found"; return 1; }
  [[ -f "$deep_file" ]] || { echo "deep.yml not found"; return 1; }

  local mvp_enabled deep_enabled
  mvp_enabled="$(grep -c 'enabled: true' "$mvp_file")"
  deep_enabled="$(grep -c 'enabled: true' "$deep_file")"

  if [[ "$deep_enabled" -le "$mvp_enabled" ]]; then
    printf "Deep preset should enable more steps than MVP:\n"
    printf "  MVP enabled: %d, Deep enabled: %d\n" "$mvp_enabled" "$deep_enabled"
    return 1
  fi
}

# --- Test 3: Quality Criteria depth tags present on most pipeline steps ---

@test "Quality Criteria depth tags present on pipeline steps (threshold 55)" {
  local tagged_count=0
  local total_count=0

  while IFS= read -r file; do
    local qc_section
    qc_section="$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
    [[ -z "$qc_section" ]] && continue

    total_count=$((total_count + 1))

    # Check for depth tags: (mvp), (deep), or (depth N+)
    if echo "$qc_section" | grep -q '(mvp)\|(deep)\|(depth'; then
      tagged_count=$((tagged_count + 1))
    fi
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)

  printf "Quality Criteria depth tags: %d/%d steps tagged (threshold: 55)\n" "$tagged_count" "$total_count"

  if [[ "$tagged_count" -lt 55 ]]; then
    printf "Below threshold — fewer than 55 pipeline steps have depth-tagged Quality Criteria\n"
    return 1
  fi
}

# --- Test 4: methodology README exists and documents depth levels ---

@test "methodology README exists and documents depth levels" {
  local readme="${PROJECT_ROOT}/content/methodology/README.md"
  [[ -f "$readme" ]] || {
    echo "methodology/README.md not found"
    return 1
  }

  # Check that all 5 depth levels are documented in the table
  local missing=()
  for level in 1 2 3 4 5; do
    if ! grep -q "| ${level} |" "$readme"; then
      missing+=("depth ${level}")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "methodology/README.md missing depth level documentation:\n"
    printf "  %s\n" "${missing[@]}"
    return 1
  fi
}
