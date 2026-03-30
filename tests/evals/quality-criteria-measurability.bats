#!/usr/bin/env bats
# quality-criteria-measurability.bats — Validates that Quality Criteria use measurable language

setup() {
  load eval_helper
}

@test "quality criteria sections avoid vague quantifiers without metrics" {
  # Search Quality Criteria sections for vague words
  # Vague words: appropriate, sufficient, adequate, comprehensive, thorough, robust
  # Skip if paired with metrics: >=, >, <=, "at least", number, %
  # This is a soft gate initially — warn but don't fail if count is high
  local vague_count=0
  local vague_files=()

  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    # Extract Quality Criteria section
    local qc_section
    qc_section=$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$f")
    [[ -z "$qc_section" ]] && continue

    # Count vague words not paired with metrics
    local file_vague
    file_vague=$(echo "$qc_section" | grep -icE '\b(appropriate|sufficient|adequate|comprehensive|thorough|robust)\b' || true)
    if [[ "$file_vague" -gt 0 ]]; then
      vague_count=$((vague_count + file_vague))
      vague_files+=("$(basename "$f"): $file_vague")
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  printf "Vague quantifier instances: %d across %d files\n" "$vague_count" "${#vague_files[@]}"
  for entry in "${vague_files[@]}"; do
    printf "  %s\n" "$entry"
  done

  # Soft gate: warn if >5 instances, fail if >10
  if [[ "$vague_count" -gt 10 ]]; then
    printf "FAIL: Too many vague quantifiers (%d > 10)\n" "$vague_count"
  fi

  [[ "$vague_count" -le 10 ]]
}

@test "multi-model criteria define consensus thresholds" {
  # Steps with (depth 4+) multi-model criteria should define consensus categories
  local missing=()

  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    local qc_section
    qc_section=$(awk '/^## Quality Criteria/{found=1; next} /^## /{if(found) exit} found{print}' "$f")
    [[ -z "$qc_section" ]] && continue

    # Check if step has multi-model criteria
    if echo "$qc_section" | grep -qi "multi-model\|multi.model"; then
      # Should mention consensus/majority/divergent or similar categorization
      if ! echo "$qc_section" | grep -qiE "consensus|majority|divergen|agree"; then
        missing+=("$(basename "$f")")
      fi
    fi
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  printf "Steps with multi-model criteria missing consensus definition: %d\n" "${#missing[@]}"
  for entry in "${missing[@]}"; do
    printf "  %s\n" "$entry"
  done

  # Soft gate initially
  [[ ${#missing[@]} -le 20 ]]
}
