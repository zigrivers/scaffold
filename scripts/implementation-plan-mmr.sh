#!/usr/bin/env bash
# implementation-plan-mmr.sh — Run Codex and Gemini CLI as independent reviewers
# of implementation plan tasks against user stories and architecture.
#
# Usage: ./scripts/implementation-plan-mmr.sh [options]
#
# Options:
#   --skip-codex       Skip Codex CLI review
#   --skip-gemini      Skip Gemini CLI review
#   --impl-plan FILE   Path to implementation plan (default: docs/implementation-plan.md)
#   --stories FILE     Path to user stories (default: docs/user-stories.md)
#   --prd FILE         Path to PRD (default: docs/plan.md)
#   --project-struct FILE  Path to project structure (default: docs/project-structure.md)
#   --tdd FILE         Path to TDD standards (default: docs/tdd-standards.md)
#   --coverage FILE    Path to task coverage JSON (default: docs/reviews/implementation-plan/task-coverage.json)
#   --output-dir DIR   Output directory (default: docs/reviews/implementation-plan)
#   --help             Show this help message

set -euo pipefail

# ─── Defaults ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."
SCHEMA_PATH="$SCRIPT_DIR/implementation-plan-mmr.schema.json"

IMPL_PLAN_FILE="$REPO_DIR/docs/implementation-plan.md"
STORIES_FILE="$REPO_DIR/docs/user-stories.md"
PRD_FILE="$REPO_DIR/docs/plan.md"
PROJECT_STRUCT_FILE="$REPO_DIR/docs/project-structure.md"
TDD_FILE="$REPO_DIR/docs/tdd-standards.md"
COVERAGE_FILE="$REPO_DIR/docs/reviews/implementation-plan/task-coverage.json"
OUTPUT_DIR="$REPO_DIR/docs/reviews/implementation-plan"

SKIP_CODEX=false
SKIP_GEMINI=false

# ─── Parse arguments ──────────────────────────────────────────────
show_help() {
    sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-codex)       SKIP_CODEX=true; shift ;;
        --skip-gemini)      SKIP_GEMINI=true; shift ;;
        --impl-plan)        IMPL_PLAN_FILE="$2"; shift 2 ;;
        --stories)          STORIES_FILE="$2"; shift 2 ;;
        --prd)              PRD_FILE="$2"; shift 2 ;;
        --project-struct)   PROJECT_STRUCT_FILE="$2"; shift 2 ;;
        --tdd)              TDD_FILE="$2"; shift 2 ;;
        --coverage)         COVERAGE_FILE="$2"; shift 2 ;;
        --output-dir)       OUTPUT_DIR="$2"; shift 2 ;;
        --help|-h)          show_help ;;
        *)                  echo "Unknown option: $1"; show_help ;;
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
    echo "  Install: npm install -g @google/gemini-cli"
fi

if ! $HAS_CODEX && ! $HAS_GEMINI; then
    echo "ERROR: Neither Codex nor Gemini CLI available. At least one is required."
    echo "  Install Codex:  npm install -g @openai/codex"
    echo "  Install Gemini: npm install -g @google/gemini-cli"
    exit 1
fi

for f in "$IMPL_PLAN_FILE" "$STORIES_FILE" "$PRD_FILE" "$PROJECT_STRUCT_FILE" "$TDD_FILE" "$COVERAGE_FILE" "$SCHEMA_PATH"; do
    if [[ ! -f "$f" ]]; then
        echo "ERROR: Required file not found: $f"
        exit 1
    fi
done

mkdir -p "$OUTPUT_DIR"

# ─── Capture Beads task data ─────────────────────────────────────
BD_LIST_OUTPUT=""
BD_DEP_TREE_OUTPUT=""

if command -v bd &>/dev/null; then
    echo "Capturing Beads task data..."
    BD_LIST_OUTPUT="$(bd list 2>/dev/null || echo '(bd list failed)')"
    BD_DEP_TREE_OUTPUT="$(bd dep tree 2>/dev/null || echo '(bd dep tree failed)')"
else
    echo "WARNING: bd CLI not found — task data will be read from coverage JSON only"
fi

# ─── Build review bundle ─────────────────────────────────────────
BUNDLE_FILE="$OUTPUT_DIR/.review-bundle.md"

cat > "$BUNDLE_FILE" <<BUNDLE_EOF
# Review Bundle — Implementation Plan Multi-Model Review

## PRD (docs/plan.md)

$(cat "$PRD_FILE")

---

## User Stories (docs/user-stories.md)

$(cat "$STORIES_FILE")

---

## Implementation Plan (docs/implementation-plan.md)

$(cat "$IMPL_PLAN_FILE")

---

## Project Structure (docs/project-structure.md)

$(cat "$PROJECT_STRUCT_FILE")

---

## TDD Standards (docs/tdd-standards.md)

$(cat "$TDD_FILE")

---

## Task Coverage (task-coverage.json)

$(cat "$COVERAGE_FILE")

---

## Beads Task List (bd list)

\`\`\`
${BD_LIST_OUTPUT}
\`\`\`

---

## Beads Dependency Tree (bd dep tree)

\`\`\`
${BD_DEP_TREE_OUTPUT}
\`\`\`
BUNDLE_EOF

echo "Review bundle created: $BUNDLE_FILE"

# ─── Review prompt ────────────────────────────────────────────────
REVIEW_PROMPT='You are an independent reviewer performing a structured audit of implementation plan tasks against user stories, PRD requirements, and architecture documentation.

Your task — review the implementation plan across 5 dimensions:

1. **Coverage**: For each user story acceptance criterion, verify at least one task covers it. Report any acceptance criteria with no corresponding task.

2. **Descriptions**: For each task, check that the description is sufficient for an AI agent to implement without clarification. It must include: acceptance criteria tied to user stories, file paths per project-structure.md, test category per tdd-standards.md, what to mock, and key interfaces. Flag vague titles, ambiguous scope, missing file paths, or missing test requirements.

3. **Dependencies**: Check the dependency graph for: missing logical dependencies (task uses output of another but has no dep), missing file contention dependencies (two parallel tasks modify the same file), over-constrained dependencies (unnecessary deps limiting parallelism), circular risks, bottleneck tasks blocking 4+ downstream tasks, and orphan tasks with no dependencies that should have them.

4. **Sizing**: Flag tasks too large for a single agent session. Warning signs: 3+ files created, both backend and frontend work, multiple user stories, multiple test categories. Suggest how to split oversized tasks.

5. **Architecture**: Check that tasks are consistent with the documented architecture in project-structure.md and tdd-standards.md. Flag wrong patterns, wrong boundaries, missing infrastructure, inconsistent technology choices, or contradictions with the architecture.

Return your findings as a single JSON object matching this exact schema:

{
  "coverage_gaps": [
    {
      "story_id": "US-xxx",
      "criterion_text": "...",
      "severity": "critical|high|medium|low",
      "suggested_task": {
        "title": "...",
        "description": "...",
        "priority": 0
      }
    }
  ],
  "description_issues": [
    {
      "task_id": "BD-xxx",
      "task_title": "...",
      "severity": "critical|high|medium|low",
      "issue_type": "missing_acceptance_criteria|missing_file_paths|vague_file_paths|missing_test_requirements|missing_mock_strategy|missing_interfaces|vague_title|ambiguous_scope|other",
      "description": "...",
      "suggested_fix": "..."
    }
  ],
  "dependency_issues": [
    {
      "issue_type": "missing_logical_dependency|missing_file_contention_dependency|over_constrained|circular_risk|bottleneck|orphan_without_dependency",
      "severity": "critical|high|medium|low",
      "task_ids": ["BD-xxx", "BD-yyy"],
      "description": "...",
      "suggested_fix": "..."
    }
  ],
  "sizing_issues": [
    {
      "task_id": "BD-xxx",
      "task_title": "...",
      "severity": "critical|high|medium|low",
      "reason": "...",
      "suggested_split": [
        { "title": "...", "description": "..." },
        { "title": "...", "description": "..." }
      ]
    }
  ],
  "architecture_issues": [
    {
      "task_id": "BD-xxx",
      "task_title": "...",
      "severity": "critical|high|medium|low",
      "issue_type": "wrong_pattern|wrong_boundary|missing_infrastructure|inconsistent_technology|contradicts_architecture|other",
      "description": "...",
      "evidence": "...",
      "suggested_fix": "..."
    }
  ],
  "review_summary": {
    "total_tasks": 0,
    "total_criteria": 0,
    "covered_criteria": 0,
    "uncovered_criteria_ids": ["US-xxx:AC-1"],
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

required_keys = ['coverage_gaps', 'description_issues', 'dependency_issues', 'sizing_issues', 'architecture_issues', 'review_summary']
missing = [k for k in required_keys if k not in data]
if missing:
    print(f'$label: Missing required keys: {missing}', file=sys.stderr)
    sys.exit(1)

rs = data['review_summary']
for k in ['total_tasks', 'total_criteria', 'covered_criteria', 'uncovered_criteria_ids', 'confidence']:
    if k not in rs:
        print(f'$label: review_summary missing key: {k}', file=sys.stderr)
        sys.exit(1)

print(f'$label: Valid — {len(data[\"coverage_gaps\"])} coverage gaps, {len(data[\"description_issues\"])} description issues, {len(data[\"dependency_issues\"])} dependency issues, {len(data[\"sizing_issues\"])} sizing issues, {len(data[\"architecture_issues\"])} architecture issues')
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
    elif isinstance(wrapper, dict) and 'coverage_gaps' in wrapper:
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
        --ask-for-approval never \
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
        -m gemini-2.5-pro \
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
            -m gemini-2.5-pro \
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
echo "Starting multi-model review of implementation plan..."
echo "  Impl Plan:  $IMPL_PLAN_FILE"
echo "  Stories:    $STORIES_FILE"
echo "  PRD:        $PRD_FILE"
echo "  Schema:     $SCHEMA_PATH"
echo "  Output:     $OUTPUT_DIR"
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
