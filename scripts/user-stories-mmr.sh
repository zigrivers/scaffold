#!/usr/bin/env bash
# user-stories-mmr.sh — Run Codex and Gemini CLI as independent reviewers
# of user stories against PRD requirements.
#
# Usage: ./scripts/user-stories-mmr.sh [options]
#
# Options:
#   --skip-codex     Skip Codex CLI review
#   --skip-gemini    Skip Gemini CLI review
#   --stories FILE   Path to user stories (default: docs/user-stories.md)
#   --prd FILE       Path to PRD (default: docs/plan.md)
#   --req-index FILE Path to requirements index (default: docs/reviews/user-stories/requirements-index.md)
#   --coverage FILE  Path to coverage map (default: docs/reviews/user-stories/coverage.json)
#   --output-dir DIR Output directory (default: docs/reviews/user-stories)
#   --help           Show this help message

set -euo pipefail

# ─── Defaults ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."
SCHEMA_PATH="$SCRIPT_DIR/user-stories-mmr.schema.json"

STORIES_FILE="$REPO_DIR/docs/user-stories.md"
PRD_FILE="$REPO_DIR/docs/plan.md"
REQ_INDEX_FILE="$REPO_DIR/docs/reviews/user-stories/requirements-index.md"
COVERAGE_FILE="$REPO_DIR/docs/reviews/user-stories/coverage.json"
OUTPUT_DIR="$REPO_DIR/docs/reviews/user-stories"

SKIP_CODEX=false
SKIP_GEMINI=false

# ─── Parse arguments ──────────────────────────────────────────────
show_help() {
    sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-codex)   SKIP_CODEX=true; shift ;;
        --skip-gemini)  SKIP_GEMINI=true; shift ;;
        --stories)      STORIES_FILE="$2"; shift 2 ;;
        --prd)          PRD_FILE="$2"; shift 2 ;;
        --req-index)    REQ_INDEX_FILE="$2"; shift 2 ;;
        --coverage)     COVERAGE_FILE="$2"; shift 2 ;;
        --output-dir)   OUTPUT_DIR="$2"; shift 2 ;;
        --help|-h)      show_help ;;
        *)              echo "Unknown option: $1"; show_help ;;
    esac
done

# ─── Preflight checks ────────────────────────────────────────────
HAS_CODEX=false
HAS_GEMINI=false

if ! $SKIP_CODEX && command -v codex &>/dev/null; then
    HAS_CODEX=true
elif ! $SKIP_CODEX; then
    echo "WARNING: codex CLI not found — skipping Codex review"
    echo "  Install: npm install -g @openai/codex"
fi

if ! $SKIP_GEMINI && command -v gemini &>/dev/null; then
    HAS_GEMINI=true
elif ! $SKIP_GEMINI; then
    echo "WARNING: gemini CLI not found — skipping Gemini review"
    echo "  Install: npm install -g @anthropic-ai/gemini-cli or see https://github.com/google-gemini/gemini-cli"
fi

if ! $HAS_CODEX && ! $HAS_GEMINI; then
    echo "ERROR: Neither Codex nor Gemini CLI available. At least one is required."
    echo "  Install Codex:  npm install -g @openai/codex"
    echo "  Install Gemini: npm install -g @google/gemini-cli"
    exit 1
fi

for f in "$STORIES_FILE" "$PRD_FILE" "$REQ_INDEX_FILE" "$COVERAGE_FILE" "$SCHEMA_PATH"; do
    if [[ ! -f "$f" ]]; then
        echo "ERROR: Required file not found: $f"
        exit 1
    fi
done

mkdir -p "$OUTPUT_DIR"

# ─── Build review bundle ─────────────────────────────────────────
# Both models get the same input bundle: PRD + requirements index + coverage map + user stories
BUNDLE_FILE="$OUTPUT_DIR/.review-bundle.md"

cat > "$BUNDLE_FILE" <<BUNDLE_EOF
# Review Bundle — User Stories Multi-Model Review

## PRD (docs/plan.md)

$(cat "$PRD_FILE")

---

## Requirements Index (requirements-index.md)

$(cat "$REQ_INDEX_FILE")

---

## Coverage Map (coverage.json)

$(cat "$COVERAGE_FILE")

---

## User Stories (docs/user-stories.md)

$(cat "$STORIES_FILE")
BUNDLE_EOF

echo "Review bundle created: $BUNDLE_FILE"

# ─── Review prompt ────────────────────────────────────────────────
REVIEW_PROMPT='You are an independent code reviewer performing a structured audit of user stories against PRD requirements.

Your task:
1. Read the PRD, requirements index, coverage map, and user stories provided.
2. For each requirement in the requirements index, verify it is covered by at least one user story.
3. For each user story, check quality: clear acceptance criteria, appropriate scope, testability, INVEST criteria.
4. Identify contradictions between PRD statements and user story content.
5. Identify overlapping or duplicate stories.
6. Produce a coverage assertion with counts and confidence.

Return your findings as a single JSON object matching this exact schema:

{
  "missing_requirements": [
    {
      "requirement_id": "REQ-xxx",
      "requirement_text": "...",
      "prd_section": "...",
      "suggested_story": {
        "title": "...",
        "story": "As a [persona], I want [action], so that [outcome]",
        "acceptance_criteria": ["Given...", "When...", "Then..."],
        "priority": "Must|Should|Could|Won'"'"'t"
      }
    }
  ],
  "story_issues": [
    {
      "story_id": "US-xxx",
      "severity": "critical|high|medium|low",
      "issue_type": "vague_acceptance_criteria|missing_edge_case|too_large|missing_scope_boundary|missing_data_requirements|untestable|ambiguous|other",
      "description": "...",
      "evidence": "...",
      "suggested_fix": "..."
    }
  ],
  "contradictions": [
    {
      "prd_statement": "...",
      "prd_section": "...",
      "story_id": "US-xxx",
      "story_statement": "...",
      "resolution": "..."
    }
  ],
  "duplication_or_overlap": [
    {
      "story_ids": ["US-xxx", "US-yyy"],
      "overlap_description": "...",
      "recommendation": "consolidate|clarify_boundaries|keep_separate"
    }
  ],
  "coverage_assertion": {
    "total_requirements": 0,
    "covered_count": 0,
    "uncovered_ids": ["REQ-xxx"],
    "confidence": 0.95
  }
}

CRITICAL: Return ONLY the raw JSON object. No markdown code fences, no commentary, no explanation before or after. Just the JSON.'

# ─── Output files ─────────────────────────────────────────────────
CODEX_OUT="$OUTPUT_DIR/codex-review.json"
GEMINI_OUT="$OUTPUT_DIR/gemini-review.json"
GEMINI_WRAPPER="$OUTPUT_DIR/.gemini-wrapper.json"

# ─── Python validation helper ────────────────────────────────────
validate_review_json() {
    local file="$1"
    local label="$2"

    python3 -c "
import json, sys

try:
    with open('$file') as f:
        data = json.load(f)
except (json.JSONDecodeError, FileNotFoundError) as e:
    print(f'$label: Invalid JSON — {e}', file=sys.stderr)
    sys.exit(1)

required_keys = ['missing_requirements', 'story_issues', 'contradictions', 'duplication_or_overlap', 'coverage_assertion']
missing = [k for k in required_keys if k not in data]
if missing:
    print(f'$label: Missing required keys: {missing}', file=sys.stderr)
    sys.exit(1)

ca = data['coverage_assertion']
for k in ['total_requirements', 'covered_count', 'uncovered_ids', 'confidence']:
    if k not in ca:
        print(f'$label: coverage_assertion missing key: {k}', file=sys.stderr)
        sys.exit(1)

print(f'$label: Valid — {len(data[\"missing_requirements\"])} missing reqs, {len(data[\"story_issues\"])} issues, {len(data[\"contradictions\"])} contradictions, {len(data[\"duplication_or_overlap\"])} overlaps')
sys.exit(0)
"
}

# ─── Extract Gemini review from wrapper JSON ──────────────────────
extract_gemini_review_json() {
    local wrapper_file="$1"
    local output_file="$2"

    python3 -c "
import json, sys

try:
    with open('$wrapper_file') as f:
        content = f.read().strip()
except FileNotFoundError:
    print('Gemini wrapper file not found', file=sys.stderr)
    sys.exit(1)

# Try parsing as wrapper JSON first (--output-format json wraps in metadata)
try:
    wrapper = json.loads(content)
    if isinstance(wrapper, dict) and 'response' in wrapper:
        # Extract response field — may be a string containing JSON
        response = wrapper['response']
        if isinstance(response, str):
            data = json.loads(response)
        elif isinstance(response, dict):
            data = response
        else:
            print('Unexpected response type in wrapper', file=sys.stderr)
            sys.exit(1)
    elif isinstance(wrapper, dict) and 'missing_requirements' in wrapper:
        # Direct JSON without wrapper
        data = wrapper
    else:
        print('Wrapper JSON missing response field and not direct review JSON', file=sys.stderr)
        sys.exit(1)
except json.JSONDecodeError:
    # Maybe the output is raw JSON without wrapper
    # Try stripping markdown fences
    stripped = content
    if stripped.startswith('\`\`\`'):
        lines = stripped.split('\n')
        # Remove markdown fence lines
        lines = [l for l in lines if not l.strip().startswith('\`\`\`')]
        stripped = '\n'.join(lines)
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError as e:
        print(f'Cannot parse Gemini output as JSON: {e}', file=sys.stderr)
        sys.exit(1)

with open('$output_file', 'w') as f:
    json.dump(data, f, indent=2)

print('Extracted Gemini review JSON successfully')
sys.exit(0)
"
}

# ─── Run Codex review ─────────────────────────────────────────────
CODEX_EXIT=0
run_codex() {
    if ! $HAS_CODEX; then
        echo "SKIP: Codex review (CLI not available)"
        return 0
    fi

    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  Running Codex CLI review..."
    echo "═══════════════════════════════════════════════════"

    local codex_prompt
    codex_prompt="$(cat "$BUNDLE_FILE")

$REVIEW_PROMPT"

    # Write prompt to temp file (codex reads from args, not stdin)
    local prompt_file="$OUTPUT_DIR/.codex-prompt.txt"
    echo "$codex_prompt" > "$prompt_file"

    if codex exec \
        --sandbox read-only \
        --ephemeral \
        --color never \
        --output-schema "$SCHEMA_PATH" \
        --output-last-message "$CODEX_OUT" \
        "$(cat "$prompt_file")"; then
        echo "Codex review completed: $CODEX_OUT"
        validate_review_json "$CODEX_OUT" "Codex"
        return $?
    else
        echo "ERROR: Codex CLI failed (exit $?)"
        return 1
    fi
}

# ─── Run Gemini review ────────────────────────────────────────────
GEMINI_EXIT=0
run_gemini() {
    if ! $HAS_GEMINI; then
        echo "SKIP: Gemini review (CLI not available)"
        return 0
    fi

    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  Running Gemini CLI review..."
    echo "═══════════════════════════════════════════════════"

    if gemini -p "$REVIEW_PROMPT" \
        --output-format json \
        --yolo \
        -m "${GEMINI_MODEL:-gemini-2.5-pro}" \
        < "$BUNDLE_FILE" > "$GEMINI_WRAPPER"; then
        echo "Gemini CLI completed, extracting review JSON..."

        if extract_gemini_review_json "$GEMINI_WRAPPER" "$GEMINI_OUT"; then
            if validate_review_json "$GEMINI_OUT" "Gemini"; then
                echo "Gemini review validated: $GEMINI_OUT"
                return 0
            fi
        fi

        # Retry once with reinforced prompt
        echo ""
        echo "Gemini output failed validation — retrying with reinforced prompt..."

        local retry_prompt="$REVIEW_PROMPT

CRITICAL: Your previous response was not valid JSON. Return ONLY a raw JSON object. No markdown, no code fences, no commentary."

        if gemini -p "$retry_prompt" \
            --output-format json \
            --yolo \
            -m "${GEMINI_MODEL:-gemini-2.5-pro}" \
            < "$BUNDLE_FILE" > "$GEMINI_WRAPPER"; then

            if extract_gemini_review_json "$GEMINI_WRAPPER" "$GEMINI_OUT"; then
                if validate_review_json "$GEMINI_OUT" "Gemini (retry)"; then
                    echo "Gemini review validated on retry: $GEMINI_OUT"
                    return 0
                fi
            fi
        fi

        echo "ERROR: Gemini review failed validation after retry"
        return 1
    else
        echo "ERROR: Gemini CLI failed (exit $?)"
        return 1
    fi
}

# ─── Run reviews in parallel ─────────────────────────────────────
echo ""
echo "Starting multi-model review..."
echo "  Stories: $STORIES_FILE"
echo "  PRD:     $PRD_FILE"
echo "  Schema:  $SCHEMA_PATH"
echo "  Output:  $OUTPUT_DIR"
echo ""

# Launch both in background
run_codex &
CODEX_PID=$!

run_gemini &
GEMINI_PID=$!

# Wait for both and capture exit codes
wait $CODEX_PID 2>/dev/null || CODEX_EXIT=$?
wait $GEMINI_PID 2>/dev/null || GEMINI_EXIT=$?

# ─── Summary ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  Multi-Model Review Summary"
echo "═══════════════════════════════════════════════════"

EXIT_CODE=0

if $HAS_CODEX && [[ $CODEX_EXIT -eq 0 ]] && [[ -f "$CODEX_OUT" ]]; then
    echo "  Codex:  PASS  → $CODEX_OUT"
elif $HAS_CODEX; then
    echo "  Codex:  FAIL  (exit code: $CODEX_EXIT)"
    EXIT_CODE=1
else
    echo "  Codex:  SKIP  (not installed)"
fi

if $HAS_GEMINI && [[ $GEMINI_EXIT -eq 0 ]] && [[ -f "$GEMINI_OUT" ]]; then
    echo "  Gemini: PASS  → $GEMINI_OUT"
elif $HAS_GEMINI; then
    echo "  Gemini: FAIL  (exit code: $GEMINI_EXIT)"
    EXIT_CODE=1
else
    echo "  Gemini: SKIP  (not installed)"
fi

# Clean up temp files
rm -f "$OUTPUT_DIR/.codex-prompt.txt" "$OUTPUT_DIR/.review-bundle.md" "$OUTPUT_DIR/.gemini-wrapper.json"

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
    echo "Review complete. Claude will now reconcile findings."
else
    echo "Review completed with errors. Claude will reconcile available findings."
fi

exit $EXIT_CODE
