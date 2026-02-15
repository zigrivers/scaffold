#!/bin/bash
# Extract individual command files from prompts.md
# Run this after editing prompts.md to regenerate commands/*.md
#
# This script parses prompts.md by the "# Name (Prompt)" heading convention,
# looks up frontmatter and "Next Steps" from the mappings below, and writes
# each command to commands/<slug>.md.
#
# Usage: ./scripts/extract-commands.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."
PROMPTS_FILE="$REPO_DIR/prompts.md"
OUTPUT_DIR="$REPO_DIR/commands"

if [ ! -f "$PROMPTS_FILE" ]; then
    echo "Error: prompts.md not found at $PROMPTS_FILE"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# ─── Frontmatter mapping ───────────────────────────────────────────
# Format: slug|description|argument-hint (argument-hint optional)
declare -a FRONTMATTER=(
    'create-prd|Create a product requirements document from an idea|<idea or @files>'
    'prd-gap-analysis|Analyze PRD for gaps, then innovate|'
    'beads|Initialize Beads task tracking in this project|'
    'tech-stack|Research and document tech stack decisions|'
    'claude-code-permissions|Configure Claude Code permissions for agents|'
    'coding-standards|Create coding standards for the tech stack|'
    'tdd|Create TDD standards for the tech stack|'
    'project-structure|Define and scaffold project directory structure|'
    'dev-env-setup|Set up local dev environment with live reload|'
    'design-system|Create a cohesive design system for frontend|'
    'git-workflow|Configure git workflow for parallel agents|'
    'multi-model-review|Set up multi-model code review on PRs|'
    'add-playwright|Configure Playwright for web app testing|'
    'add-maestro|Configure Maestro for mobile app testing|'
    'user-stories|Create user stories covering every PRD feature|'
    'user-stories-gaps|Gap analysis and UX innovation for user stories|'
    'platform-parity-review|Audit platform coverage across all docs|'
    'claude-md-optimization|Consolidate and optimize CLAUDE.md|'
    'workflow-audit|Verify workflow consistency across all docs|'
    'implementation-plan|Create task graph from stories and standards|'
    'implementation-plan-review|Review task quality, coverage, and dependencies|'
    'single-agent-start|Start single-agent execution loop|'
    'single-agent-resume|Resume work after a break|'
    'multi-agent-start|Start multi-agent execution loop in a worktree|<agent-name>'
    'multi-agent-resume|Resume multi-agent work after a break|<agent-name>'
    'new-enhancement|Add a new feature to an existing project|<enhancement description>'
    'prompt-pipeline|Show the full pipeline reference|'
    'update|Check for and apply scaffold updates|'
    'version|Show installed and latest scaffold version|'
)

# ─── Heading-to-slug mapping ───────────────────────────────────────
# Maps the heading text from prompts.md to the output slug
declare -A HEADING_TO_SLUG
HEADING_TO_SLUG["PRD Creation"]="create-prd"
HEADING_TO_SLUG["PRD Gap Analysis & Innovation"]="prd-gap-analysis"
HEADING_TO_SLUG["Beads Setup"]="beads"
HEADING_TO_SLUG["Tech Stack"]="tech-stack"
HEADING_TO_SLUG["Claude Code Permissions Setup"]="claude-code-permissions"
HEADING_TO_SLUG["Coding Standards"]="coding-standards"
HEADING_TO_SLUG["TDD"]="tdd"
HEADING_TO_SLUG["Project Structure"]="project-structure"
HEADING_TO_SLUG["Dev Environment Setup"]="dev-env-setup"
HEADING_TO_SLUG["Design System"]="design-system"
HEADING_TO_SLUG["Git Workflow"]="git-workflow"
HEADING_TO_SLUG["Multi-Model Code Review Loop"]="multi-model-review"
HEADING_TO_SLUG["Integrate Playwright (if building a web app)"]="add-playwright"
HEADING_TO_SLUG["Maestro Setup"]="add-maestro"
HEADING_TO_SLUG["User Stories"]="user-stories"
HEADING_TO_SLUG["User Stories Gap Analysis & Innovation"]="user-stories-gaps"
HEADING_TO_SLUG["Platform Parity Review"]="platform-parity-review"
HEADING_TO_SLUG["Claude.md Optimization"]="claude-md-optimization"
HEADING_TO_SLUG["Workflow Audit"]="workflow-audit"
HEADING_TO_SLUG["Implementation Plan"]="implementation-plan"
HEADING_TO_SLUG["Implementation Plan Review"]="implementation-plan-review"
HEADING_TO_SLUG["New Enhancement"]="new-enhancement"

# ─── Next steps mapping ────────────────────────────────────────────
# These are appended after the extracted prompt content.
# Stored as heredocs would be unwieldy, so we use a function.
get_next_steps() {
    local slug="$1"
    case "$slug" in
        create-prd)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 1 complete** — `docs/plan.md` created.

**Next:** Run `/scaffold:prd-gap-analysis` — Analyze the PRD for gaps, then innovate before it drives everything else.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        prd-gap-analysis)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 1 complete** — `docs/plan.md` updated with gap fixes and approved innovations.

**Next:** Run `/scaffold:beads` — Initialize Beads task tracking (starts Phase 2).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        beads)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 2 started** — Beads initialized, `tasks/lessons.md` created, `CLAUDE.md` updated.

**Next:** Run `/scaffold:tech-stack` — Research and document tech stack decisions.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        tech-stack)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — `docs/tech-stack.md` created.

**Next:** Run `/scaffold:claude-code-permissions` — Configure Claude Code permissions for agents.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        claude-code-permissions)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — Permissions configured in `.claude/settings.json` and `~/.claude/settings.json`.

**Next:** Run `/scaffold:coding-standards` — Create coding standards for the tech stack.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        coding-standards)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — `docs/coding-standards.md` created with linter/formatter configs.

**Next:** Run `/scaffold:tdd` — Create TDD standards for the tech stack.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        tdd)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — `docs/tdd-standards.md` created.

**Next:** Run `/scaffold:project-structure` — Define and scaffold project directory structure.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        project-structure)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 2 complete** — `docs/project-structure.md` created and directories scaffolded.

**Next:** Run `/scaffold:dev-env-setup` — Set up local dev environment with live reload (starts Phase 3).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        dev-env-setup)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 3 in progress** — Dev environment configured, `docs/dev-setup.md` created.

**Next:**
- If your project has a **frontend**: Run `/scaffold:design-system` — Create a cohesive design system.
- If your project is **backend-only**: Skip to `/scaffold:git-workflow` — Configure git workflow for parallel agents.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        design-system)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 3 in progress** — `docs/design-system.md` created with theme configuration.

**Next:** Run `/scaffold:git-workflow` — Configure git workflow for parallel agents.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        git-workflow)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 3 in progress** — `docs/git-workflow.md` created, CI configured, worktree script ready.

**Next (choose one):**
- **(Optional)** Run `/scaffold:multi-model-review` — Set up multi-model code review on PRs (requires ChatGPT Pro subscription).
- If your project has a **web frontend**: Skip to `/scaffold:add-playwright` — Configure Playwright for web app testing (starts Phase 4).
- If your project has a **mobile app**: Skip to `/scaffold:add-maestro` — Configure Maestro for mobile app testing.
- If **neither**: Skip to `/scaffold:user-stories` — Create user stories (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        multi-model-review)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 3 complete** — Multi-model code review configured with Codex Cloud + Claude Code Action fix loop.

**Next (choose based on your project):**
- If your project has a **web frontend**: Run `/scaffold:add-playwright` — Configure Playwright for web app testing (starts Phase 4).
- If your project has a **mobile app**: Run `/scaffold:add-maestro` — Configure Maestro for mobile app testing.
- If **neither**: Skip to `/scaffold:user-stories` — Create user stories (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        add-playwright)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 4 in progress** — Playwright configured for web app testing.

**Next:**
- If your project **also** has a mobile app: Run `/scaffold:add-maestro` — Configure Maestro for mobile app testing.
- Otherwise: Skip to `/scaffold:user-stories` — Create user stories (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        add-maestro)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 4 complete** — Maestro configured for mobile app testing.

**Next:** Run `/scaffold:user-stories` — Create user stories covering every PRD feature (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        user-stories)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 5 in progress** — `docs/user-stories.md` created.

**Next:** Run `/scaffold:user-stories-gaps` — Gap analysis and UX innovation for user stories.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        user-stories-gaps)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 5 in progress** — `docs/user-stories.md` updated with gap fixes and approved innovations.

**Next:**
- If your project targets **multiple platforms** (web + mobile): Run `/scaffold:platform-parity-review` — Audit platform coverage across all docs.
- Otherwise: Skip to `/scaffold:claude-md-optimization` — Consolidate and optimize CLAUDE.md (starts Phase 6).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        platform-parity-review)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 5 complete** — Platform parity gaps identified and fixed across all docs.

**Next:** Run `/scaffold:claude-md-optimization` — Consolidate and optimize CLAUDE.md (starts Phase 6).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        claude-md-optimization)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 6 in progress** — `CLAUDE.md` consolidated and optimized.

**Next:** Run `/scaffold:workflow-audit` — Verify workflow consistency across all docs.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        workflow-audit)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 6 complete** — Workflow verified and aligned across all documents.

**Next:** Run `/scaffold:implementation-plan` — Create task graph from stories and standards (starts Phase 7).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        implementation-plan)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 7 in progress** — `docs/implementation-plan.md` created, Beads task graph built.

**Next:** Run `/scaffold:implementation-plan-review` — Review task quality, coverage, and dependencies.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        implementation-plan-review)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Phase 7 in progress** — Tasks reviewed, gaps filled, dependencies verified.

**Next:** Choose an execution mode:
- **Single agent:** Run `/scaffold:single-agent-start` — Start execution from the main repo.
- **Multiple agents:** Set up worktrees per `docs/git-workflow.md`, then run `/scaffold:multi-agent-start <agent-name>` in each worktree.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        new-enhancement)
            cat <<'NEXTSTEP'

## After This Step

When this step is complete, tell the user:

---
**Enhancement documented** — PRD updated, user stories created, Beads tasks ready.

**Next (if applicable):**
- If you created **5+ tasks**: Run `/scaffold:implementation-plan-review` — Review task quality, coverage, and dependencies.
- If the enhancement has **platform-specific behavior**: Run `/scaffold:platform-parity-review` — Check platform coverage.
- Otherwise: Run `/scaffold:single-agent-start` or `/scaffold:single-agent-resume` to begin implementation (or `/scaffold:multi-agent-start <agent-name>` / `/scaffold:multi-agent-resume <agent-name>` for worktree agents).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
NEXTSTEP
            ;;
        # single-agent-start, single-agent-resume, prompt-pipeline: no next steps
        *) ;;
    esac
}

# ─── Get frontmatter for a slug ────────────────────────────────────
get_frontmatter() {
    local slug="$1"
    for entry in "${FRONTMATTER[@]}"; do
        IFS='|' read -r s desc hint <<< "$entry"
        if [ "$s" = "$slug" ]; then
            echo "---"
            echo "description: \"$desc\""
            if [ -n "$hint" ]; then
                echo "argument-hint: \"$hint\""
            fi
            echo "---"
            return
        fi
    done
}

# ─── Main extraction logic ─────────────────────────────────────────
echo "Extracting commands from prompts.md..."
echo ""

# Note: This script provides the framework for extraction.
# Due to the complexity of parsing multi-format markdown headings
# (both # and ## levels with varying suffixes like "(for Expo/Mobile Apps)"),
# a full automated extraction is best done with a scripting language.
#
# For now, this script serves as documentation of the mapping and
# can be extended with awk/python parsing as needed.
#
# The recommended workflow is:
# 1. Edit prompts.md (source of truth)
# 2. Manually update the affected command file in commands/
# 3. Or run this script if you've added python support (see below)

echo "Frontmatter and next-steps mappings are defined for these commands:"
for entry in "${FRONTMATTER[@]}"; do
    IFS='|' read -r slug desc hint <<< "$entry"
    echo "  - $slug: $desc"
done

echo ""
echo "To fully automate extraction, consider adding a Python helper:"
echo "  python3 scripts/extract-commands.py"
echo ""
echo "For now, command files in commands/ should be updated manually"
echo "when prompts.md changes, using the frontmatter and next-steps"
echo "mappings defined in this script."
