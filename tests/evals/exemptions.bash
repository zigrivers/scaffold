#!/usr/bin/env bash
# Shared exempt lists for scaffold meta-evals.
# Sourced by individual eval files to avoid duplicating lists.

# --- output-consumption.bats ---
# Steps whose outputs are terminal (consumed by the user, not pipeline).
TERMINAL_OUTPUT_EXEMPT=(
  "implementation-plan"
  "developer-onboarding-guide"
  "implementation-playbook"
  "apply-fixes-and-freeze"
  "ai-memory-setup"
  "automated-pr-review"
  "beads"
  "create-evals"
  # Game development steps — terminal artifacts consumed by developers, not pipeline.
  # These correspond to game-overlay.yml step-overrides. Keep in sync.
  "playtest-plan"
  "platform-cert-prep"
  "live-ops-plan"
  "art-bible"
  "modding-ugc-spec"
  "ai-behavior-design"
)

# Output path patterns that are terminal by nature
TERMINAL_PATH_PATTERNS=(
  "docs/reviews/"
  "docs/validation/"
  "docs/user-stories-innovation"
  "maestro/"
  ".beads/"
  "AGENTS.md"
  "scripts/"
  ".github/"
  "playwright.config."
  "tailwind.config."
  "tests/screenshots/"
)

# --- knowledge-quality.bats ---
# Knowledge entries that are templates, not actual content entries
KNOWLEDGE_TEMPLATE_EXEMPT=(
  "review-{artifact}"
)

# --- data-flow.bats ---
# Phase-ordering reads that are legitimate but not in transitive dependency closure.
# Format: "reader:target" — reader step reads from target step via sequential execution.
# These are reads where the target is in the same phase but not an explicit dependency,
# or update-mode cross-references that optionally read from later phases.
# Note: reads from earlier phases are automatically allowed and don't need exemption.
PHASE_ORDERING_EXEMPT=(
  "user-stories:innovate-prd"
  "tdd:system-architecture"
)

is_phase_ordering_exempt() {
  local reader="$1" target="$2"
  local key="${reader}:${target}"
  for exempt in "${PHASE_ORDERING_EXEMPT[@]}"; do
    [[ "$key" == "$exempt" ]] && return 0
  done
  return 1
}

# --- Self-validation ---

validate_exempt_phase_ordering() {
  local missing=()
  for entry in "${PHASE_ORDERING_EXEMPT[@]}"; do
    local reader="${entry%%:*}"
    local target="${entry##*:}"
    # Verify both reader and target exist as pipeline steps
    local reader_found=0 target_found=0
    while IFS= read -r -d '' pfile; do
      local name
      name="$(basename "$pfile" .md)"
      [[ "$name" == "$reader" ]] && reader_found=1
      [[ "$name" == "$target" ]] && target_found=1
    done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f -print0)
    if [[ "$reader_found" -eq 0 ]]; then
      missing+=("${entry}: reader '${reader}' not found in pipeline")
    fi
    if [[ "$target_found" -eq 0 ]]; then
      missing+=("${entry}: target '${target}' not found in pipeline")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "Stale PHASE_ORDERING_EXEMPT entries:\n"
    printf "  %s\n" "${missing[@]}"
    return 1
  fi
}

validate_exempt_terminal_outputs() {
  local missing=()
  for step in "${TERMINAL_OUTPUT_EXEMPT[@]}"; do
    # Terminal output exempts reference pipeline step names, check pipeline dir
    local found=0
    while IFS= read -r -d '' pfile; do
      local name
      name="$(basename "$pfile" .md)"
      if [[ "$name" == "$step" ]]; then
        found=1
        break
      fi
    done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f -print0)
    if [[ "$found" -eq 0 ]]; then
      missing+=("$step")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "Stale TERMINAL_OUTPUT_EXEMPT entries (pipeline steps no longer exist):\n"
    printf "  %s\n" "${missing[@]}"
    return 1
  fi
}
