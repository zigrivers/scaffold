---
name: automated-pr-review
description: "Agent-driven automated code review via MMR (Codex, Gemini, Claude CLIs + Superpowers as 4th channel in wrappers), for PRs and non-PR targets"
summary: "Configures agent-driven automated code review: mandatory after `gh pr create` and also usable on any non-PR target. Direct `mmr review` runs three CLI channels (Codex, Gemini, Claude); `scaffold run review-pr` / `scaffold run review-code` add the Superpowers code-reviewer agent as a complementary 4th channel. An external GitHub App reviewer is supported as a fallback when CLIs are unavailable."
phase: "environment"
order: 340
dependencies: [git-workflow]
outputs: [AGENTS.md, docs/review-standards.md, scripts/cli-pr-review.sh, scripts/await-pr-review.sh]
reads: [tdd]
conditional: "if-needed"
knowledge-base: [review-methodology, automated-review-tooling]
---

## Purpose
Configure an agent-driven automated code review system using local CLI
reviewers dispatched through MMR (Codex, Gemini, Claude — runs all three when
available) plus the Superpowers code-reviewer agent as a complementary 4th
channel when using the MMR wrappers `scaffold run review-pr` and
`scaffold run review-code`. The review is mandatory after `gh pr create` and
also runs on non-PR targets (local staged/unstaged code, branch diffs,
specific files) via the same `mmr review` CLI.
`scaffold run post-implementation-review` is a separate full-codebase review
(Codex CLI + Gemini CLI + Superpowers code-reviewer) that runs after an AI
agent completes all implementation tasks; it does not currently use Claude
CLI as a standard channel and is not an MMR wrapper, though it can inject
findings into an existing MMR job via `mmr reconcile`.
External GitHub App reviewers remain supported as a fallback when CLIs are
unavailable. Zero GitHub Actions workflows. The agent manages the entire
review-fix loop locally.

## Inputs
- docs/coding-standards.md (required) — review criteria reference
- docs/tdd-standards.md (required) — test coverage expectations
- docs/git-workflow.md (required) — PR workflow to integrate with
- CLAUDE.md (required) — workflow sections to update

## Expected Outputs
- AGENTS.md — Reviewer instructions with project-specific rules
- docs/review-standards.md — severity definitions (P0-P3) and review criteria
- scripts/cli-pr-review.sh (legacy dual-model fallback) — Codex+Gemini review with manual reconciliation, used when MMR / `scaffold run review-pr` is unavailable
- scripts/await-pr-review.sh (external bot mode) — polling script with JSON output
- docs/git-workflow.md updated with review loop integration
- CLAUDE.md updated with agent-driven review workflow and review-pr hook

## Quality Criteria
- (mvp) External reviewer configured and verified (AGENTS.md created)
- (mvp) Review standards document matches project coding conventions
- (deep) Await script handles all exit conditions (approved, findings, cap, skip, timeout)
- (mvp) CLAUDE.md workflow documents the agent-driven loop
- (mvp) CLAUDE.md review block covers both PR and non-PR targets (staged, branch diff, single file)
- (mvp) No GitHub Actions workflows created (zero Actions minutes)
- (mvp) No ANTHROPIC_API_KEY secret required
- (mvp) Post-PR-creation hook configured in settings to remind agents to run review-pr
- (deep) Legacy GitHub Actions workflows detected and cleanup offered
- (deep) Three-CLI review (Codex, Gemini, Claude) enabled when all three CLIs available, with per-channel auth checks and compensating passes
- (deep) Scaffold wrappers (review-pr, review-code, post-implementation-review) add the Superpowers code-reviewer agent as a complementary 4th channel and reconcile its findings through MMR

## Methodology Scaling
- **deep**: Full setup with local three-CLI review dispatched through MMR
  (Codex, Gemini, Claude), scaffold wrappers adding the Superpowers
  code-reviewer as a complementary 4th channel, review-standards.md,
  AGENTS.md, and comprehensive CLAUDE.md workflow covering PR and non-PR
  targets. Falls back to external bot review if no CLIs available.
- **mvp**: Step is disabled. Local self-review from git-workflow suffices.
- **custom:depth(1-5)**:
  - Depth 1: disabled — local self-review from git-workflow suffices.
  - Depth 2: disabled — same as depth 1.
  - Depth 3: basic review-standards.md + MMR dispatch using whichever CLIs are available (graceful compensating Claude passes for missing Codex or Gemini channels; if Claude CLI itself is unavailable, the review proceeds with the remaining channels — no compensating pass for missing Claude).
  - Depth 4: three-CLI review via MMR when all CLIs available, plus AGENTS.md with project-specific rules and the Superpowers 4th channel on wrapper invocations.
  - Depth 5: full suite — three-CLI + Superpowers review, legacy GitHub Actions cleanup, comprehensive CLAUDE.md workflow integration covering PR and non-PR targets.

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
  CLI became available, git-workflow.md changed PR workflow steps, review
  scope expanded beyond PRs (e.g., MMR now supports staged / diff / branch
  / file targets)
- **Conflict resolution**: if review criteria changed in coding-standards.md,
  update AGENTS.md review rules to match; if additional CLI reviewers have
  become available, offer to enable the full three-CLI MMR flow (Codex,
  Gemini, Claude) and, on wrapper invocations, surface Superpowers
  code-reviewer as the complementary 4th channel

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
            "command": "if echo \"$CC_BASH_COMMAND\" | grep -q 'gh pr create'; then echo '\\n⚠️  MANDATORY: Run all 3 CLI review channels plus the Superpowers 4th channel before proceeding to the next task:\\n\\n  1. Codex CLI:\\n     Auth: codex login status 2>/dev/null\\n     Run:  codex exec --skip-git-repo-check -s read-only --ephemeral \"REVIEW_PROMPT\" 2>/dev/null\\n\\n  2. Gemini CLI:\\n     Auth: NO_BROWSER=true gemini -p \"respond with ok\" -o json 2>&1\\n     Run:  NO_BROWSER=true gemini -p \"REVIEW_PROMPT\" --output-format json --approval-mode yolo 2>/dev/null\\n\\n  3. Claude CLI:\\n     Auth: claude -p \"respond with ok\" 2>/dev/null\\n     Run:  claude -p \"REVIEW_PROMPT\" --output-format json 2>/dev/null\\n\\n  4. Superpowers code-reviewer (complementary 4th channel):\\n     Dispatch superpowers:code-reviewer subagent with BASE_SHA and HEAD_SHA\\n\\nIf auth fails: tell user to run ! codex login, ! gemini -p \"hello\", or ! claude login (as applicable).\\nDo not silently skip channels — surface auth failures and let MMR decide: missing Codex/Gemini get compensating Claude passes (degraded-pass verdict); missing Claude proceeds without compensation.\\nFix all P0/P1/P2 findings before moving on.\\nFull instructions: scaffold run review-pr'; fi"
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

Add the following to the project's CLAUDE.md in the Code Review section. Wrap
the managed section in the `<!-- scaffold:automated-pr-review:claude-md -->`
markers shown below so Update Mode can idempotently rewrite this block without
duplicating it on re-run. If a prior version of the block exists **without**
markers, replace it in place and add the markers.

```markdown
## Code Review

<!-- scaffold:automated-pr-review:claude-md start -->
**Mandatory after `gh pr create`** — run `/scaffold:review-pr <PR#>` to execute
all three review channels (Codex CLI, Gemini CLI, Claude CLI), plus the
Superpowers code-reviewer agent as a complementary 4th channel. Fix P0/P1/P2
findings before moving to the next task. A post-hook on `gh pr create` will
remind you.

**Optional but supported** for non-PR targets — the review is not PR-gated.
Direct `mmr review` runs the three CLI channels (Codex, Gemini, Claude) on
any diff or file. `scaffold run review-code` adds the Superpowers
code-reviewer agent as a complementary 4th channel on top of those three
CLIs for the local pre-commit review path.

| When | Command |
|------|---------|
| After creating a PR | `/scaffold:review-pr <PR#>` |
| Before commit / push (tracked local code: committed + staged + unstaged) | `scaffold run review-code` |
| Pending edits to a tracked file (changes since HEAD) | `git diff HEAD -- <path> \| mmr review --diff - --sync --format json` |
| Current contents of any file (tracked-with-no-changes, untracked, or brand-new) | `(diff -u /dev/null <path> \|\| true) \| mmr review --diff - --sync --format json` |
| Branch diff | `mmr review --base <ref> --head <ref> --sync --format json` |
| Staged changes only | `mmr review --staged --sync --format json` |
| All tracked uncommitted changes (staged + unstaged, no untracked) | `git diff HEAD \| mmr review --diff - --sync --format json` |
| Existing patch or diff file | `mmr review --diff <path.patch> --sync --format json` |
| Dual-model CLI only (no reconciliation) | `scripts/cli-pr-review.sh <PR#>` |

Note: `mmr review --diff` expects diff-format content; use the `git diff …`
or `(diff -u /dev/null … || true)` wrappers shown above to review plain
files. The `|| true` guard on `diff` is required because `diff` exits with
status 1 whenever files differ, which breaks pipelines under `pipefail`.
<!-- scaffold:automated-pr-review:claude-md end -->
```

**Idempotency note:** In Update Mode, find the `<!-- scaffold:automated-pr-review:claude-md start -->`
and `<!-- scaffold:automated-pr-review:claude-md end -->` markers and replace
everything between them with the current version of the block above. If the
markers are missing (pre-marker versions), locate the prior block by its
"After creating a PR, run `/scaffold:review-pr`" lead-in and replace it in
place, adding the markers around the new content. Never append a second copy.

### Configure AGENTS.md, Review Standards, and CLI Scripts

Follow the existing instructions for creating AGENTS.md, docs/review-standards.md,
and review scripts based on the project's coding standards and test requirements.
These provide the review context that `/scaffold:review-pr` uses when dispatching
to each channel.
