---
name: automated-pr-review
description: Agent-driven automated PR review with external reviewers (Codex Cloud, Gemini Code Assist, or custom)
summary: "Configures automated code review — using Codex and/or Gemini CLIs for dual-model review when available, or an external bot — with severity definitions and review criteria tailored to your project."
phase: "environment"
order: 340
dependencies: [git-workflow]
outputs: [AGENTS.md, docs/review-standards.md]
reads: [tdd]
conditional: "if-needed"
knowledge-base: [review-methodology, automated-review-tooling]
---

## Purpose
Configure an agent-driven automated PR review system using local CLI reviewers
(Codex, Gemini — runs both when available for dual-model quality) or external
GitHub App reviewers. Zero GitHub Actions workflows. The agent manages the
entire review-fix loop locally.

## Inputs
- docs/coding-standards.md (required) — review criteria reference
- docs/tdd-standards.md (required) — test coverage expectations
- docs/git-workflow.md (required) — PR workflow to integrate with
- CLAUDE.md (required) — workflow sections to update

## Expected Outputs
- AGENTS.md — Reviewer instructions with project-specific rules
- docs/review-standards.md — severity definitions (P0-P3) and review criteria
- scripts/cli-pr-review.sh (local CLI mode) — dual-model review with reconciliation
- scripts/await-pr-review.sh (external bot mode) — polling script with JSON output
- docs/git-workflow.md updated with review loop integration
- CLAUDE.md updated with agent-driven review workflow and review-pr hook

## Quality Criteria
- (mvp) External reviewer configured and verified (AGENTS.md created)
- (mvp) Review standards document matches project coding conventions
- (deep) Await script handles all exit conditions (approved, findings, cap, skip, timeout)
- (mvp) CLAUDE.md workflow documents the agent-driven loop
- (mvp) No GitHub Actions workflows created (zero Actions minutes)
- (mvp) No ANTHROPIC_API_KEY secret required
- (mvp) Post-PR-creation hook configured in settings to remind agents to run review-pr
- (deep) Legacy GitHub Actions workflows detected and cleanup offered
- (deep) Dual-model review enabled when both CLIs available

## Methodology Scaling
- **deep**: Full setup with local CLI review (dual-model when both available),
  review-standards.md, AGENTS.md, and comprehensive CLAUDE.md workflow.
  Falls back to external bot review if no CLIs available.
- **mvp**: Step is disabled. Local self-review from git-workflow suffices.
- **custom:depth(1-5)**: Depth 1: disabled — local self-review from git-workflow
  suffices. Depth 2: disabled — same as depth 1. Depth 3: basic
  review-standards.md + single-CLI review (whichever CLI is available).
  Depth 4: add dual-model review when both CLIs available, AGENTS.md with
  project-specific rules. Depth 5: full suite with dual-model review,
  legacy Actions cleanup, and comprehensive CLAUDE.md workflow integration.

## Conditional Evaluation
Enable when: project uses GitHub for version control, team size > 1 or CI/CD is
configured, or git-workflow.md establishes a PR-based workflow. Skip when: solo
developer with no CI, depth < 3, or project uses a non-GitHub VCS host.

## Mode Detection
Check if AGENTS.md exists first. If it exists, check for scaffold tracking comment
(`<!-- scaffold:automated-pr-review -->`).
- If AGENTS.md exists with tracking comment: UPDATE MODE — preserve custom review rules,
  reviewer bot name, and round cap settings. Detect legacy GitHub Actions
  workflows (code-review-trigger.yml, code-review-handler.yml) and offer removal.
- If AGENTS.md does not exist: FRESH MODE — configure from scratch.

## Update Mode Specifics
- **Detect prior artifact**: AGENTS.md exists
- **Preserve**: custom review rules, reviewer bot configuration, round cap
  settings, severity definitions in docs/review-standards.md, CLI review
  script customizations
- **Triggers for update**: coding-standards.md changed (new review criteria),
  tdd-standards.md changed (coverage expectations), new external reviewer
  CLI became available, git-workflow.md changed PR workflow steps
- **Conflict resolution**: if review criteria changed in coding-standards.md,
  update AGENTS.md review rules to match; if both CLI reviewers are now
  available, offer to enable dual-model review

## Instructions

### Configure Review Enforcement Hook

Add a Claude Code hook to the project's `.claude/settings.json` that fires after
every `gh pr create` command. This injects a mandatory reminder into the agent's
context at exactly the moment it needs to run reviews — preventing context decay
from causing missed review channels.

Add this to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CC_BASH_COMMAND\" | grep -q 'gh pr create'; then echo '\\n⚠️  MANDATORY: Run all 3 code review channels before proceeding to the next task:\\n\\n  1. Codex CLI:\\n     Auth: codex login status 2>/dev/null\\n     Run:  codex exec --skip-git-repo-check -s read-only --ephemeral \"REVIEW_PROMPT\" 2>/dev/null\\n\\n  2. Gemini CLI:\\n     Auth: NO_BROWSER=true gemini -p \"respond with ok\" -o json 2>&1\\n     Run:  NO_BROWSER=true gemini -p \"REVIEW_PROMPT\" --output-format json --approval-mode yolo 2>/dev/null\\n\\n  3. Superpowers code-reviewer:\\n     Dispatch superpowers:code-reviewer subagent with BASE_SHA and HEAD_SHA\\n\\nIf auth fails: tell user to run ! codex login or ! gemini -p \"hello\"\\nFix all P0/P1 findings before moving on. Do NOT skip any channel.\\nFull instructions: scaffold run review-pr'; fi"
          }
        ]
      }
    ]
  }
}
```

**Why a hook instead of just instructions?** Agents in long implementation sessions
suffer from context decay — instructions from hundreds of messages ago are
effectively invisible by the time the agent creates its third PR. The hook injects
the reminder at exactly the right moment, every time, regardless of context length.

**Why inline commands instead of just a slash command reference?** The hook must work
regardless of how scaffold is installed (plugin vs CLI vs user commands). Including
the actual CLI invocations ensures the agent can execute reviews even if the
`/scaffold:review-pr` slash command isn't available in the current namespace.

### Add Review Workflow to CLAUDE.md

Add the following to the project's CLAUDE.md in the Code Review section:

```markdown
## Code Review

After creating a PR, run `/scaffold:review-pr <PR#>` to execute all three review
channels (Codex CLI, Gemini CLI, Superpowers code-reviewer). Fix P0/P1 findings
before moving to the next task. A post-hook on `gh pr create` will remind you.

| Command | Purpose |
|---------|---------|
| `/scaffold:review-pr <PR#>` | Run all 3 review channels on a PR |
| `scripts/cli-pr-review.sh <PR#>` | Run dual-model CLI review only |
```

### Configure AGENTS.md, Review Standards, and CLI Scripts

Follow the existing instructions for creating AGENTS.md, docs/review-standards.md,
and review scripts based on the project's coding standards and test requirements.
These provide the review context that `/scaffold:review-pr` uses when dispatching
to each channel.
