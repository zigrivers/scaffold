#!/usr/bin/env bash
# Shared exempt lists for scaffold meta-evals.
# Sourced by individual eval files to avoid duplicating lists.

# --- channel-parity.bats ---
# Commands that are utility/execution (no pipeline step expected)
COMMAND_EXEMPT=(
  "single-agent-start"
  "single-agent-resume"
  "multi-agent-start"
  "multi-agent-resume"
  "dashboard"
  "knowledge"
  "prompt-pipeline"
  "session-analyzer"
  "update"
  "version"
  "version-bump"
  "release"
  "quick-task"
  "new-enhancement"
  "prd-gap-analysis"
  "user-stories-gaps"
)

# --- output-consumption.bats ---
# Steps whose outputs are terminal (consumed by the user, not pipeline).
TERMINAL_OUTPUT_EXEMPT=(
  "implementation-plan"
  "developer-onboarding-guide"
  "session-handoff-brief"
  "implementation-playbook"
  "apply-fixes-and-freeze"
  "ai-memory-setup"
  "automated-pr-review"
  "beads"
  "create-evals"
)

# Output path patterns that are terminal by nature
TERMINAL_PATH_PATTERNS=(
  "docs/reviews/"
  "docs/validation/"
  "docs/user-stories-innovation"
  "maestro/"
  ".beads/"
  "AGENTS.md"
)

# --- command-structure.bats ---
# Utility commands that don't need After This Step
AFTER_STEP_EXEMPT=(
  "prompt-pipeline"
  "session-analyzer"
  "update"
  "version"
  "dashboard"
)

# --- cross-channel.bats ---
# Commands that consolidate multiple pipeline steps (1:many mapping)
CONSOLIDATION_COMMANDS=(
  "prd-gap-analysis"
  "user-stories-gaps"
)

# --- knowledge-quality.bats ---
# Knowledge entries that are templates, not actual content entries
KNOWLEDGE_TEMPLATE_EXEMPT=(
  "review-{artifact}"
)

# --- Self-validation ---
# Validate that exempt entries actually exist as command files.
# Call from tests to catch stale exemptions after commands are added/removed.
validate_exempt_commands() {
  local missing=()
  for cmd in "${COMMAND_EXEMPT[@]}"; do
    if [[ ! -f "${PROJECT_ROOT}/commands/${cmd}.md" ]]; then
      missing+=("$cmd")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    printf "Stale COMMAND_EXEMPT entries (command files no longer exist):\n"
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
    done < <(find "${PROJECT_ROOT}/pipeline" -name '*.md' -type f -print0)
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
