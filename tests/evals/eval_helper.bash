#!/usr/bin/env bash
# Shared helper functions for scaffold meta-evals

PROJECT_ROOT="${BATS_TEST_DIRNAME}/../.."

# Extract a YAML frontmatter field value from a .md file.
# Usage: extract_field "file.md" "name"
# Returns the raw value after "fieldname: " (strips quotes). When the field
# has no inline value and is followed by a block-style list (e.g. "topics:"
# then indented "  - foo" lines), the list items are returned one per line.
extract_field() {
  local file="$1" field="$2"
  awk -v f="$field" '
    /^---$/ { fm++; if (fm >= 2) exit; next }
    fm == 1 && $0 ~ "^"f":" {
      val = $0
      sub("^"f":[ \t]*", "", val)
      gsub(/^["'\'']|["'\'']$/, "", val)
      if (val != "") { print val; exit }
      # No inline value: collect block-style list items ("  - item" or,
      # for zero-indent YAML block sequences, "- item" at column 0).
      while ((getline nl) > 0) {
        if (nl ~ /^---$/) exit
        if (nl ~ /^[[:space:]]*-[[:space:]]/) {
          item = nl
          sub(/^[[:space:]]*-[[:space:]]*/, "", item)
          gsub(/^["'\'']|["'\'']$/, "", item)
          print item
        } else if (nl ~ /^[^[:space:]]/) {
          exit
        }
      }
      exit
    }
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

# Count body lines in a markdown file — total lines minus the YAML frontmatter
# block (between the first two `---` delimiters, inclusive). Use this for any
# ratio that should measure "% of content" — frontmatter is metadata, not
# content, and freshness fields like `volatility` / `sources` make every
# entry's frontmatter grow without changing what the model reads.
#
# Edge cases:
#   - File has no leading `---` → treats whole file as body (`fm == 0` path).
#   - File opens a `---` block but never closes it (malformed) → returns the
#     full file's `wc -l` rather than 0, so downstream `pct = deep * 100 / body`
#     in tests cannot divide by zero on a malformed input.
count_body_lines() {
  awk '
    NR == 1 && /^---[[:space:]]*$/ { fm = 1; next }
    fm == 1 && /^---[[:space:]]*$/ { fm = 2; next }
    fm == 2 || fm == 0 { count++ }
    END {
      # Unclosed frontmatter (fm stuck at 1) → fall back to total line count
      # so callers don'\''t divide by zero. The YAML parser will reject the
      # file separately; the redundancy check should not crash on it.
      if (fm == 1) print NR
      else print count+0
    }
  ' "$1"
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
  grep -rh '^name:' "${PROJECT_ROOT}/content/pipeline/" | sed 's/name: //' | sort
}

# Collect all knowledge entry names.
get_knowledge_names() {
  grep -rh '^name:' "${PROJECT_ROOT}/content/knowledge/" | sed 's/name: //' | sort
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
    vision)         echo "0 99" ;;
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
    build)          echo "1500 1599" ;;
    *)              echo "" ;;
  esac
}

# Get the phase number for a phase slug (0-15).
get_phase_number() {
  local phase="$1"
  case "$phase" in
    vision) echo 0 ;; pre) echo 1 ;; foundation) echo 2 ;; environment) echo 3 ;;
    integration) echo 4 ;; modeling) echo 5 ;; decisions) echo 6 ;;
    architecture) echo 7 ;; specification) echo 8 ;; quality) echo 9 ;;
    parity) echo 10 ;; consolidation) echo 11 ;; planning) echo 12 ;;
    validation) echo 13 ;; finalization) echo 14 ;; build) echo 15 ;; *) echo -1 ;;
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
