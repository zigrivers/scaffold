#!/usr/bin/env bash
# Shared helper functions for scaffold meta-evals

PROJECT_ROOT="${BATS_TEST_DIRNAME}/../.."

# Extract a YAML frontmatter field value from a .md file.
# Usage: extract_field "file.md" "name"
# Returns the raw value after "fieldname: " (strips quotes).
extract_field() {
  local file="$1" field="$2"
  awk -v f="$field" '
    /^---$/ { fm++; next }
    fm == 1 && $0 ~ "^"f":" {
      sub("^"f":[ ]*", "")
      gsub(/^["'\'']|["'\'']$/, "")
      print
      exit
    }
    fm >= 2 { exit }
  ' "$file"
}

# Check if a frontmatter field exists (even if null).
# Usage: has_field "file.md" "conditional"
has_field() {
  local file="$1" field="$2"
  awk -v f="$field" '
    /^---$/ { fm++; next }
    fm == 1 && $0 ~ "^"f":" { found=1; exit }
    fm >= 2 { exit }
    END { exit !found }
  ' "$file"
}

# Count lines in a file.
count_lines() {
  wc -l < "$1" | tr -d ' '
}

# Count fenced code block pairs (``` opening markers).
count_code_blocks() {
  grep -c '^```' "$1" 2>/dev/null | awk '{print int($1/2)}'
}

# Get knowledge category from file path (parent directory name).
# e.g., knowledge/core/eval-craft.md -> core
get_category() {
  basename "$(dirname "$1")"
}

# Collect all pipeline step names.
get_pipeline_names() {
  grep -rh '^name:' "${PROJECT_ROOT}/pipeline/" | sed 's/name: //' | sort
}

# Collect all knowledge entry names.
get_knowledge_names() {
  grep -rh '^name:' "${PROJECT_ROOT}/knowledge/" | sed 's/name: //' | sort
}

# Extract knowledge-base array entries from a pipeline step file.
# Returns one entry per line.
get_kb_refs() {
  local file="$1"
  extract_field "$file" "knowledge-base" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//' | grep -v '^$'
}

# Extract dependencies array entries from a pipeline step file.
get_dep_refs() {
  local file="$1"
  extract_field "$file" "dependencies" | sed 's/\[//;s/\]//' | tr ',' '\n' | sed 's/^ *//' | grep -v '^$'
}

# Get expected order range for a phase slug.
# Phase N uses orders N00-N99 (e.g., phase 1 "pre" = 100-199).
# Returns "min max" or empty if unknown phase.
get_phase_order_range() {
  local phase="$1"
  case "$phase" in
    pre)            echo "100 199" ;;
    foundation)     echo "200 299" ;;
    environment)    echo "300 399" ;;
    integration)    echo "400 499" ;;
    modeling)       echo "500 599" ;;
    decisions)      echo "600 699" ;;
    architecture)   echo "700 799" ;;
    specification)  echo "800 899" ;;
    quality)        echo "900 999" ;;
    parity)         echo "1000 1099" ;;
    consolidation)  echo "1100 1199" ;;
    planning)       echo "1200 1299" ;;
    validation)     echo "1300 1399" ;;
    finalization)   echo "1400 1499" ;;
    *)              echo "" ;;
  esac
}

# Get the phase number for a phase slug (1-14).
get_phase_number() {
  local phase="$1"
  case "$phase" in
    pre) echo 1 ;; foundation) echo 2 ;; environment) echo 3 ;;
    integration) echo 4 ;; modeling) echo 5 ;; decisions) echo 6 ;;
    architecture) echo 7 ;; specification) echo 8 ;; quality) echo 9 ;;
    parity) echo 10 ;; consolidation) echo 11 ;; planning) echo 12 ;;
    validation) echo 13 ;; finalization) echo 14 ;; *) echo 0 ;;
  esac
}

# Check if file has eval-wip marker on line 1.
is_wip() {
  head -1 "$1" | grep -q '<!-- eval-wip -->'
}

# Count lines between two headings in a markdown file.
# Usage: lines_between_headings "file.md" "## Summary" "## Deep Guidance"
lines_between_headings() {
  local file="$1" start="$2" end="$3"
  awk -v s="$start" -v e="$end" '
    $0 == s { counting=1; next }
    $0 == e { counting=0 }
    counting { count++ }
    END { print count+0 }
  ' "$file"
}
