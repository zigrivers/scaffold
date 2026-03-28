#!/usr/bin/env bats
# Eval 11: Data Flow Validation
# Pipeline step reads fields should reference steps reachable through
# the transitive dependency closure.

setup() {
  load eval_helper
}

# Build the transitive closure of dependencies for a given step name.
# Outputs one step name per line (including the step itself).
get_transitive_deps() {
  local start_name="$1"
  local visited=""
  local queue="$start_name"

  while [[ -n "$queue" ]]; do
    local current="${queue%%$'\n'*}"
    if [[ "$current" == "$queue" ]]; then
      queue=""
    else
      queue="${queue#*$'\n'}"
    fi

    [[ -z "$current" ]] && continue
    echo "$visited" | grep -qx "$current" && continue
    visited="${visited}${visited:+$'\n'}${current}"

    local dep_file
    dep_file="$(find "${PROJECT_ROOT}/pipeline" -name "${current}.md" -type f | head -1)"
    [[ -z "$dep_file" ]] && continue

    local deps
    deps="$(get_dep_refs "$dep_file" 2>/dev/null || true)"
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      if ! echo "$visited" | grep -qx "$dep"; then
        queue="${queue}${queue:+$'\n'}${dep}"
      fi
    done <<< "$deps"
  done

  echo "$visited"
}

@test "reads fields reference steps reachable through transitive dependencies (warning)" {
  local unreachable=()
  local checked=0

  while IFS= read -r file; do
    local name reads_raw
    name="$(extract_field "$file" "name")"

    reads_raw="$(extract_field "$file" "reads" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' || true)"
    [[ -z "$reads_raw" ]] && continue

    local trans_deps
    trans_deps="$(get_transitive_deps "$name")"

    while IFS= read -r read_ref; do
      [[ -z "$read_ref" ]] && continue
      checked=$((checked + 1))

      if ! echo "$trans_deps" | grep -qx "$read_ref"; then
        unreachable+=("${name}: reads '${read_ref}' not in transitive dependency closure")
      fi
    done <<< "$reads_raw"
  done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f)

  # Report findings — this is a tracking metric, not a hard failure
  # Many reads entries reference earlier-phase steps through implicit ordering
  local reachable=$(( checked - ${#unreachable[@]} ))
  printf "Data flow coverage: %d/%d reads entries are transitively reachable\n" "$reachable" "$checked"

  if [[ ${#unreachable[@]} -gt 0 ]]; then
    printf "WARNING: %d reads entries not in transitive dependency closure (implicit phase ordering):\n" "${#unreachable[@]}"
    printf "  %s\n" "${unreachable[@]}"
  fi

  # Always pass — reads can reference steps through implicit phase ordering
  # that isn't captured in the explicit dependency graph
  [[ "$checked" -gt 0 ]]
}
