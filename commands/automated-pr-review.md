---
description: "Set up automated PR review with AI reviewers"
long-description: "Configures agent-driven automated PR review using local CLI reviewers (Codex, Gemini) or external GitHub App reviewers. The agent manages the entire review-fix loop locally — zero GitHub Actions workflows, zero Actions minutes consumed."
---

Set up automated PR review for this project. The system uses independent AI reviewers to catch issues that local self-review misses, with the agent managing the entire fix loop locally.

**This step does NOT create any GitHub Actions workflows.** All review orchestration runs locally via the agent. Two review modes are available: local CLI review (fastest, recommended) and external bot review (GitHub App-based, with polling).

Review docs/coding-standards.md, docs/tdd-standards.md, docs/git-workflow.md, and CLAUDE.md to understand the existing project conventions.

## Step 0: Applicability Check

Before proceeding, verify this step applies:

1. **Check for GitHub remote**: Run `git remote -v`. If no `github.com` remote exists, this step doesn't apply — tell the user and stop.
2. **Check for CI**: Verify `.github/workflows/` directory exists (git-workflow step should have created it). If not, warn the user that CI should be set up first.
3. **Check for existing review setup**: If `AGENTS.md` exists at the repo root, this is an update (proceed to Mode Detection).

## Mode Detection

Check if `AGENTS.md` already exists at the repo root:

**If AGENTS.md does NOT exist → FRESH MODE**: Create from scratch.

**If AGENTS.md exists → UPDATE MODE**:
1. **Read & analyze**: Read `AGENTS.md`, `docs/review-standards.md`, and `scripts/await-pr-review.sh`. Check for tracking comment on line 1 of AGENTS.md: `<!-- scaffold:automated-pr-review v<ver> <date> -->`. If absent, treat as legacy — be conservative.
2. **Diff against current structure**: Categorize as ADD / RESTRUCTURE / PRESERVE.
3. **Legacy workflow detection**: Check for `.github/workflows/code-review-trigger.yml`, `code-review-handler.yml`, `codex-timeout.yml`, or `post-merge-followup.yml`. If any exist, inform the user: "Found legacy GitHub Actions review workflows. These are no longer needed — the review loop is now agent-driven. Want me to remove them?" Also check for `.github/review-prompts/` directory.
4. **Preview changes**: Present summary table. Wait for user approval.
5. **Execute update**: Add missing sections, preserve custom rules.
6. **Update tracking comment**.

### Update Mode Specifics
- **Preserve**: Custom review rules in AGENTS.md, reviewer bot name, round cap settings, custom severity rules in review-standards.md
- **Remove (with confirmation)**: Legacy GitHub Actions workflows, `.github/review-prompts/` directory, `ANTHROPIC_API_KEY` secret references

---

## Step 1: Detect Available Reviewers & Choose Mode

Detect what's available locally:

```bash
command -v codex && echo "Codex CLI available" || echo "Codex CLI not found"
command -v gemini && echo "Gemini CLI available" || echo "Gemini CLI not found"
```

### Auto-Select Logic

**If at least one CLI is available → default to local CLI review (Option A).** Inform the user:
- "Detected [codex/gemini/both]. Using local CLI review (fastest, no external services needed)."
- If both available: "Both Codex and Gemini CLIs detected — will run dual-model review for highest quality."
- Do NOT ask the user to choose — just proceed with local CLI mode. Only ask if the user wants to override to an external bot mode.

**If no CLI is available → ask the user** which external bot to configure using AskUserQuestionTool.

### Option A — Local CLI Review (default when CLIs available)

- The agent captures the PR diff and runs it through Codex and/or Gemini CLI locally
- Results are immediate — no polling, no waiting for external bots
- If **both CLIs available**: Run both independently, reconcile findings (highest quality)
- If **one CLI available**: Run that one (still catches different-model blind spots)
- Cost: included in existing subscriptions, no additional credits per review

### Option B — Codex Cloud (fallback when no local CLI)

- Requires: ChatGPT subscription + Codex Cloud GitHub App installed on repo
- Bot posts PR review comments; agent polls for results via `gh api`
- Slower than local CLI (must wait for external service)

### Option C — Gemini Code Assist (fallback when no local CLI)

- Requires: Google Cloud project + Gemini Code Assist enabled on repo
- Same polling pattern as Option B

### Option D — Custom reviewer bot

- User provides: bot username, approval signal text
- Works with any bot that posts GitHub PR reviews

Options B-D use the external bot flow (AGENTS.md + await script). Option A uses the local CLI flow.

## Prerequisites

Based on the reviewer choice:

| Mode | Requirement |
|------|-------------|
| Local CLI (both) | `codex` CLI + `gemini` CLI installed and authenticated |
| Local CLI (single) | `codex` CLI or `gemini` CLI installed and authenticated |
| Codex Cloud | ChatGPT subscription + "ChatGPT Codex Connector" GitHub App on repo |
| Gemini Code Assist | Google Cloud project + Gemini Code Assist enabled on repo |
| Custom | Reviewer bot installed and configured on repo |

**Not required** (regardless of mode):
- No Anthropic API key secret needed (fixes run locally)
- No GitHub App (Claude) installation needed
- No GitHub Actions workflows (zero Actions minutes)

---

## Step 2: Create Review Standards

Create `docs/review-standards.md`:

```markdown
<!-- scaffold:automated-pr-review v1 YYYY-MM-DD -->
# Review Standards

## Source Documents
Reviewers should check code against:
- CLAUDE.md (project rules, key commands)
- docs/coding-standards.md (code conventions)
- docs/tdd-standards.md (test requirements)
- docs/project-structure.md (file placement)

## Review Priorities
1. Correctness — does it do what the story requires?
2. Security — no injection, no secrets in code, proper auth checks
3. Test coverage — new code has tests, tests actually test behavior
4. Standards compliance — follows documented coding standards
5. Performance — no obvious N+1 queries, unbounded loops, or memory leaks
6. Maintainability — clear names, no dead code, reasonable complexity

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| P0 (critical) | Data loss, security vulnerability, or crash in production | Must fix before merge |
| P1 (high) | Bug in normal usage, or MUST-level standards violation | Must fix before merge |
| P2 (medium) | Code smell, missing edge case, SHOULD-level violation | Fix during local self-review |
| P3 (low) | Suggestion for improvement, not a defect | Optional, do not block merge |

## What NOT to Flag
- Style issues caught by linter (formatting, import ordering)
- Minor naming preferences (unless genuinely confusing)
- Refactoring suggestions unrelated to the PR's purpose
```

## Step 3: Create AGENTS.md

Create `AGENTS.md` at the repo root (this is what Codex Cloud / Gemini reads):

```markdown
<!-- scaffold:automated-pr-review v1 YYYY-MM-DD -->
# Code Review Instructions

## Reviewer Role
You are reviewing a pull request. Read the diff carefully and check against the standards in `docs/review-standards.md`.

## Focus Areas
- P0 and P1 issues ONLY — do not flag P2/P3 issues
- Security: secrets in code, injection vulnerabilities, auth bypasses
- Correctness: logic errors, off-by-one, null handling, race conditions
- Tests: new code without tests, tests that don't test actual behavior
- Standards: violations of MUST rules in docs/coding-standards.md

## Approval Signal
If you find NO P0 or P1 issues, your review MUST include this exact text:
```
APPROVED: No P0/P1 issues found.
```

## Findings Format
For each finding, provide:
- File and line number
- Severity (P0 or P1)
- What's wrong
- Suggested fix (specific code, not vague guidance)

## Rules
- DO NOT flag style issues (linter handles those)
- DO NOT suggest refactoring beyond the PR scope
- DO NOT invent new requirements
- Every finding MUST include a specific suggested fix
```

Customize the focus areas based on `docs/coding-standards.md` and `docs/tdd-standards.md`.

## Step 4: Create Await Script

Create `scripts/await-pr-review.sh` — the agent uses this to poll for external reviews:

```bash
#!/usr/bin/env bash
# await-pr-review.sh — Poll for external PR review and return structured results
# Usage: scripts/await-pr-review.sh <pr-number> [options]
#
# Options:
#   --max-rounds N       Max review rounds before cap (default: 3)
#   --timeout SECONDS    Per-round timeout (default: 900)
#   --reviewer BOT       Bot username to watch for (default: chatgpt-codex-connector[bot])
#   --poll-interval S    Seconds between polls (default: 30)
#
# Exit codes:
#   0  Approved (reviewer posted approval signal)
#   1  Findings posted (agent should fix and re-push)
#   2  Round cap reached (merge with warning)
#   3  Skipped (human /skip-review or /lgtm comment)
#   4  Timeout (no review within timeout)
#   5  Error
#
# Stdout: JSON with { status, round, findings[], reviewer }
```

The script should:
1. Accept PR number as first argument
2. Get the current HEAD SHA via `gh api`
3. Poll `gh api repos/{owner}/{repo}/pulls/{pr}/reviews` for a review from the configured bot matching the current SHA
4. Check for human override comments (`/skip-review` or `/lgtm`) from repo members
5. When review found: parse for approval signal or extract findings
6. Output JSON with status and findings to stdout
7. Use `--poll-interval` between checks, respect `--timeout`

Include the full script implementation appropriate for the project's shell conventions (reference docs/coding-standards.md for shell script standards).

**Note:** The await script is only needed for external bot review (Options B-D). For local CLI review (Option A), skip this step.

## Step 4b: Create Local CLI Review Script (Option A Only)

**Skip this step if the user chose external bot review (Options B-D).**

Create `scripts/cli-pr-review.sh` — the agent runs this to get immediate local review results:

```bash
#!/usr/bin/env bash
# cli-pr-review.sh — Run local CLI review of PR diff using Codex and/or Gemini
# Usage: scripts/cli-pr-review.sh [options]
#
# Options:
#   --pr NUMBER          PR number (uses gh pr diff) or omit for local diff
#   --skip-codex         Skip Codex CLI even if available
#   --skip-gemini        Skip Gemini CLI even if available
#   --review-standards   Path to review standards (default: docs/review-standards.md)
#
# Exit codes:
#   0  No P0/P1 findings from any reviewer
#   1  P0/P1 findings found (fix needed)
#   5  Error (no CLI available, API failure)
#
# Stdout: JSON with { reviewers[], findings[], consensus[] }
```

The script should:
1. Detect available CLIs (`command -v codex`, `command -v gemini`)
2. If neither available → exit 5 with error message
3. Capture the diff: `gh pr diff <pr>` (if PR number given) or `git diff origin/main...HEAD`
4. Read `docs/review-standards.md` for severity definitions and focus areas
5. Read `docs/coding-standards.md` and `docs/tdd-standards.md` for project-specific rules
6. Bundle diff + review context into a review prompt:
   - "Review this code diff. For each issue found, report: file, line, severity (P0/P1 only), description, and suggested fix. If no P0/P1 issues, respond with: APPROVED: No P0/P1 issues found."
7. For each available CLI, run the review independently:
   - `codex` — Run with the review prompt, capture structured output
   - `gemini` — Run with the same prompt independently (do not share one model's output with the other)
8. Parse outputs and reconcile findings:
   - **Both models agree on a finding** → High confidence, include in results
   - **One model only, P0** → Include (P0 is critical enough to act on from a single model)
   - **One model only, P1** → Include with note "single-model finding"
   - **Contradictions** → Include both with note for agent to adjudicate
9. Output JSON to stdout:
   ```json
   {
     "reviewers": ["codex", "gemini"],
     "approved": false,
     "findings": [
       {
         "file": "src/api/auth.ts",
         "line": 42,
         "severity": "P0",
         "description": "SQL injection via unsanitized user input",
         "suggestion": "Use parameterized query: db.query('SELECT * FROM users WHERE id = $1', [userId])",
         "source": "both",
         "confidence": "high"
       }
     ],
     "consensus": {
       "total_findings": 3,
       "agreed": 2,
       "codex_only": 1,
       "gemini_only": 0
     }
   }
   ```
10. Exit 0 if no P0/P1 findings, exit 1 if findings present

Include the full script implementation. For Codex CLI invocation, use:
```bash
echo "$REVIEW_PROMPT" | codex exec -s read-only --ephemeral - 2>/dev/null
```

For Gemini CLI invocation, use the appropriate command format for the installed version.

### Dual-Model Reconciliation Rules

When both CLIs are available and both produce results:

| Scenario | Action | Confidence |
|----------|--------|-----------|
| Both flag same file+issue | Include once | High — fix immediately |
| Both approve (no findings) | Approved | High — merge confidently |
| One flags P0, other approves | Include finding | High — P0 is critical |
| One flags P1, other approves | Include finding | Medium — review before fixing |
| Models contradict each other | Include both | Low — agent adjudicates |

This gives the best quality: two independent models catch different blind spots, and consensus findings have the highest confidence.

## Step 5: Update CLAUDE.md

Add or update the "Code Review" section in CLAUDE.md. Use the appropriate workflow based on the reviewer mode chosen in Step 1.

### For Local CLI Review (Option A):

```markdown
## Code Review

### PR Workflow with Local CLI Review

When creating PRs, follow this workflow:

1. Run `make check` (lint + test)
2. Spawn review subagent (local self-review against docs/review-standards.md)
3. Fix any P0/P1/P2 findings locally
4. Push branch and create PR: `gh pr create`
5. Wait for CI: `gh pr checks --watch`
6. Run local CLI review: `scripts/cli-pr-review.sh --pr <pr-number>`
7. Handle review result:
   - **Exit 0 (approved)**: Merge with `gh pr merge --squash --delete-branch`
   - **Exit 1 (findings)**: Read JSON output. For high-confidence findings (both models agree), fix immediately. For single-model findings, review before fixing. Run tests, push, go to step 6.
   - **Exit 5 (error)**: Warn user (CLI not available or API failure)
8. Confirm merge succeeded

### Review Configuration
- Review mode: local CLI
- Reviewers: [codex, gemini, or both — as detected]
- Max fix rounds: 3
- Review standards: docs/review-standards.md
```

### For External Bot Review (Options B-D):

```markdown
## Code Review

### PR Workflow with External Review

When creating PRs, follow this workflow:

1. Run `make check` (lint + test)
2. Spawn review subagent (local self-review against docs/review-standards.md)
3. Fix any P0/P1/P2 findings locally
4. Push branch and create PR: `gh pr create`
5. Wait for CI: `gh pr checks --watch`
6. Wait for external review: `scripts/await-pr-review.sh <pr-number>`
7. Handle review result:
   - **Exit 0 (approved)**: Merge with `gh pr merge --squash --delete-branch`
   - **Exit 1 (findings)**: Read JSON output, fix issues locally, run tests, push. Go to step 6.
   - **Exit 2 (round cap)**: Merge with warning. Create follow-up issue: `gh issue create --title "Review follow-up: PR #N" --body "Unresolved P0/P1 findings after round cap"`
   - **Exit 3 (skipped)**: Merge immediately (human override)
   - **Exit 4 (timeout)**: Merge with timeout note
   - **Exit 5 (error)**: Warn user, do not merge automatically
8. Confirm merge succeeded

### Review Configuration
- Review mode: external bot
- External reviewer: [configured bot name]
- Max rounds: 3
- Round timeout: 15 minutes
- Review standards: docs/review-standards.md
```

## Step 6: Update git-workflow.md

Add a brief section to `docs/git-workflow.md` noting the external review integration:

```markdown
## External Code Review

When automated PR review is configured (see `AGENTS.md`), the PR workflow includes
an external review step after CI passes. The agent polls for the external review
using `scripts/await-pr-review.sh` and handles findings locally.

See CLAUDE.md "Code Review" section for the full agent workflow.
```

## Step 7: Legacy Cleanup (Update Mode Only)

If legacy GitHub Actions review workflows were detected in Mode Detection:

1. Remove `.github/workflows/code-review-trigger.yml` (if exists)
2. Remove `.github/workflows/code-review-handler.yml` (if exists)
3. Remove `.github/workflows/codex-timeout.yml` (if exists)
4. Remove `.github/workflows/post-merge-followup.yml` (if exists)
5. Remove `.github/review-prompts/` directory (if exists)
6. Remove `ANTHROPIC_API_KEY` secret reference from any documentation
7. Inform user: "Removed N legacy workflow files. The review loop is now fully agent-driven."

---

## Safety Rails

| Rail | Mode | Implementation |
|------|------|---------------|
| **Round cap** | Both | Max 3 fix rounds. Agent merges after cap with follow-up issue. |
| **Timeout** | External only | `--timeout` in await script (default 15 min). Agent merges with timeout note. |
| **Human override** | External only | `/skip-review` or `/lgtm` comment from repo member bypasses review. |
| **Docs-only skip** | Both | Agent checks diff — if only `.md`, `.yaml`, `.json`, `.toml`, `.lock` files changed, skip review. |
| **Read-only reviewer** | External only | Bot has no write access. Only the agent pushes fixes. |
| **Follow-up tracking** | Both | When round cap hit, agent creates GitHub Issue for unresolved findings. |
| **Dual-model reconciliation** | Local CLI | When both CLIs available, independent reviews are reconciled by confidence level. |

## What NOT to Do

- Don't create GitHub Actions workflows (the whole point is zero Actions minutes)
- Don't require ANTHROPIC_API_KEY as a GitHub secret (fixes run locally)
- Don't include Tier 1 (local self-review) content — git-workflow already handles that
- Don't share one model's review with the other during dual-model review (independent reviews)

## Process

1. Check applicability (GitHub remote, CI setup)
2. Detect available CLIs (`codex`, `gemini`)
3. Ask user to choose reviewer mode (local CLI / external bot)
4. Verify prerequisites (CLIs authenticated or bot app installed)
5. Create docs/review-standards.md
6. Create AGENTS.md with review instructions
7. Create review script: `scripts/cli-pr-review.sh` (local) or `scripts/await-pr-review.sh` (external)
8. Update CLAUDE.md with appropriate review workflow
9. Update docs/git-workflow.md with review integration note
10. If update mode: offer to clean up legacy GitHub Actions workflows
11. Test: create a small test PR and run the review script to verify it works

## After This Step

When this step is complete, tell the user:

---
**Phase 3 in progress** — Automated PR review configured with agent-driven loop.

**Next:**
- Run `/scaffold:ai-memory-setup` — Configure AI memory with modular rules, optional MCP memory server, and external context.
- Run `/scaffold:add-e2e-testing` — Configure E2E testing (if project has web or mobile frontend).
- Or skip to `/scaffold:user-stories` — Create user stories (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
