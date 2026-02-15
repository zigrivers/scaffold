---
description: "Set up multi-model code review on PRs"
---

Set up a two-tier automated code review system: a local self-review before every PR (required for all projects), and an optional external Codex Cloud review loop that auto-fixes findings and auto-merges.

For background research, tool comparisons, and design decisions, see `Multi Model Review Research.md`. For cost analysis, see `Multi Model Review Cost Analysis.md`.

---

## Architecture

### Two-Tier Review

```
TIER 1: LOCAL SELF-REVIEW (before push — required, no extra cost)
  Agent runs review subagent → checks against docs/review-standards.md
       ↓
  Fixes P0/P1/P2 issues locally → runs lint + test → pushes

TIER 2: EXTERNAL CODEX CLOUD REVIEW (after PR — optional, subscription-based)
  Codex Cloud auto-reviews via GitHub App (reads AGENTS.md)
       ↓
  Convergence check (GitHub Actions)
  • No P0/P1/P2 → auto-merge
  • Round >= 3 → auto-merge anyway (label: ai-review-capped)
  • Otherwise → Claude Code Action fixes (needs ANTHROPIC_API_KEY)
       ↓
  Push fixes → re-triggers Codex Cloud review
```

**Tier 1 (self-review)** is built into the Git Workflow prompt and applies to ALL projects. It is inserted as a step in the PR workflow — see the Git Workflow prompt for the exact command.

**Tier 2 (Codex Cloud + CI fix loop)** is optional and per-project. The rest of this prompt sets up Tier 2.

### What Triggers What (Tier 2)

The loop is event-driven via GitHub Actions — no polling, no external orchestrator:

1. **PR opened or pushed** → triggers the code-review workflow
2. Gate job checks: any code files changed? Round count? Human override?
3. Wait job polls for Codex Cloud's review comment (it posts independently via the GitHub App)
4. Convergence job checks Codex comment for approval signal → labels the round
5. If approved OR round cap reached → auto-merge job runs `gh pr merge --squash --auto --delete-branch`
6. If findings remain and rounds < cap → Claude Code Action reads findings, fixes P0/P1/P2, pushes
7. New push on PR branch → re-triggers the workflow (back to step 1)

### Safety Rails

- **Round cap**: Maximum 3 review rounds. After that, the PR auto-merges with the `ai-review-capped` label — no human gate.
- **Bot-loop prevention**: Review workflow skips if the latest commit author is the fix bot AND the round cap is hit. The fix job only fires when the convergence job says "fix," not on raw push events.
- **Cost cap**: Claude Code Action fix gets `--max-turns 10`. Codex Cloud has no turns to control (it's subscription-based).
- **Read-only reviewer**: Codex Cloud has no write access. Only Claude Code Action (the engineer) has `contents: write`.
- **Human override**: Any human comment with `/lgtm` or `/skip-review` bypasses the loop and allows merge.
- **File filter**: Gate job checks `git diff --name-only` and skips review if only docs/config files changed (markdown, yaml, json, toml, lock files).

---

## Prerequisites

| Requirement | How to Get It |
|-------------|--------------|
| **ChatGPT Pro subscription** | For Codex Cloud auto-reviews — subscribe at chatgpt.com |
| **Codex Cloud GitHub App** | Install "ChatGPT Codex Connector" on your repo at github.com, then enable "Code review" in Codex settings. Tell the agent when done — it will auto-detect the bot username and update the workflow. |
| **Anthropic API key** | Create at console.anthropic.com → run `gh secret set ANTHROPIC_API_KEY` and paste when prompted (for Claude Code Action fixes, ~$5-7/month) |
| **GitHub App (Claude)** | Run `claude /install-github-app` in Claude Code terminal, or install from github.com/apps/claude |
| **Repo permissions** | Actions must have Read/Write permissions: Settings → Actions → General → Workflow permissions |

---

## What to Create

### 1. Review Standards Document (`docs/review-standards.md`)

Create a document that ALL reviewers (self-review, Codex Cloud, and human) reference. This is the single source of truth for what "good code" means in this project. Pull content from your existing docs:

```markdown
# Code Review Standards

## Source Documents
Reviewers should check code against these project standards:
- `CLAUDE.md` — Workflow rules, commit format, Key Commands
- `docs/coding-standards.md` — Naming, patterns, styling rules
- `docs/tdd-standards.md` — Test categories, coverage requirements
- `docs/project-structure.md` — File organization, module boundaries

## Review Priorities (in order)
1. **Correctness** — Does the code do what the task/story requires?
2. **Security** — Input validation, auth checks, no hardcoded secrets
3. **Test coverage** — Failing test written first? Edge cases covered?
4. **Standards compliance** — Matches project conventions from docs above?
5. **Performance** — No obvious N+1 queries, memory leaks, blocking calls
6. **Maintainability** — Clear naming, reasonable complexity, no magic numbers

## What NOT to Flag
- Style/formatting issues (linter handles these)
- Import ordering (linter handles this)
- Minor naming preferences that don't violate documented conventions
- "I would have done it differently" without a concrete improvement

## Severity Definitions
- **P0 (critical)**: Will cause data loss, security vulnerability, or crash in production
- **P1 (high)**: Bug that will manifest in normal usage, or violates a MUST rule from standards
- **P2 (medium)**: Code smell, missing edge case, or SHOULD-level standards violation
- **P3 (low)**: Suggestion for improvement, not a defect — do NOT fix in review loop
```

### 2. AGENTS.md (repo root)

Codex Cloud reads `AGENTS.md` at the repo root for custom review instructions. Create this file:

```markdown
# AGENTS.md

## Code Review Instructions

You are reviewing a pull request as an independent code reviewer. You did NOT write this code.

### What to Check
Read `docs/review-standards.md` for the full review criteria, priorities, and severity definitions.

Also read these project standards:
- `docs/coding-standards.md` — Code conventions
- `docs/tdd-standards.md` — Testing requirements
- `CLAUDE.md` — Workflow and commit rules

### Severity Levels
Use these severity levels in your review:
- **P0 (critical)**: Data loss, security vulnerability, production crash
- **P1 (high)**: Bug in normal usage, MUST-rule violation
- **P2 (medium)**: Code smell, missing edge case, SHOULD-level violation

### Approval Signal
If there are NO P0, P1, or P2 issues, your review MUST include this exact line:
```
APPROVED: No P0/P1/P2 issues found.
```

If there ARE findings, list each one with its severity, file, line, and a concrete suggestion.

### Rules
- Only flag P0, P1, and P2 issues. Skip P3 (low) — those are for humans.
- Be specific: include exact file paths and line numbers.
- For each finding, include a concrete suggestion for how to fix it.
- Do NOT flag style/formatting issues — the linter handles those.
- Do NOT suggest alternative approaches unless the current one has a defect.
- Do NOT rewrite working code just because you'd do it differently.
```

### 3. Fix Prompt (`.github/review-prompts/fix-prompt.md`)

```markdown
You are the engineer who wrote this PR. Codex Cloud has posted review findings.

## Your Task
1. Read ALL review comments on this PR from Codex Cloud.
2. For each **P0**, **P1**, or **P2** finding:
   - If the finding is valid: fix the code.
   - If the finding is a false positive: note why in a reply comment.
3. Run the project's lint and test commands (see CLAUDE.md Key Commands) to verify fixes.
4. Commit your fixes with message: `[BD-<task-id>] fix: address review feedback (round N)`
5. Push to the PR branch.

## Rules
- Fix P0, P1, AND P2 issues — all three severity levels.
- Do NOT fix P3 (low) issues — those are suggestions, not defects.
- Do NOT refactor unrelated code.
- Keep changes minimal and surgical.
- If a reviewer finding contradicts project standards (in docs/coding-standards.md or docs/tdd-standards.md), follow the project standards and explain why in a comment.
- After fixing, post a summary comment listing what you fixed and what you declined (with reasons).

## Project Standards
- `CLAUDE.md` — Workflow rules, Key Commands for lint/test
- `docs/coding-standards.md` — Conventions to follow
- `docs/tdd-standards.md` — Test requirements
- `docs/review-standards.md` — Severity definitions
```

### 4. GitHub Actions Workflow (`.github/workflows/code-review.yml`)

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize]

# Prevent concurrent reviews on the same PR
concurrency:
  group: review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  MAX_REVIEW_ROUNDS: 3
  # Update this after installing Codex Cloud — check the bot's username
  CODEX_BOT_NAME: "chatgpt-codex[bot]"

jobs:
  # ─── Gate: Should we run? ────────────────────────────────
  check-gate:
    runs-on: ubuntu-latest
    outputs:
      should_review: ${{ steps.gate.outputs.should_review }}
      current_round: ${{ steps.gate.outputs.current_round }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check review gate
        id: gate
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Check if any code files changed (skip for docs/config-only PRs)
          CODE_CHANGED=$(git diff --name-only origin/${{ github.event.pull_request.base.ref }}...HEAD \
            | grep -v -E '\.(md|yaml|yml|json|toml|lock)$' | wc -l)

          if [ "$CODE_CHANGED" -eq 0 ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "No code files changed — skipping review"
            exit 0
          fi

          # Count existing review-round labels
          LABELS=$(gh api repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/labels \
            --jq '.[].name' | grep '^review-round-' | wc -l)
          CURRENT_ROUND=$((LABELS + 1))
          echo "current_round=$CURRENT_ROUND" >> $GITHUB_OUTPUT

          # Check for human override
          SKIP=$(gh api repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/comments \
            --jq '.[].body' | grep -c '/skip-review' || true)
          LGTM=$(gh api repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/comments \
            --jq '.[].body' | grep -c '/lgtm' || true)

          if [ "$SKIP" -gt 0 ] || [ "$LGTM" -gt 0 ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Human override detected — skipping review"
          elif [ "$CURRENT_ROUND" -gt "$MAX_REVIEW_ROUNDS" ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Max rounds reached — skipping review"
          else
            echo "should_review=true" >> $GITHUB_OUTPUT
          fi

  # ─── Wait for Codex Cloud review ────────────────────────
  wait-for-codex:
    needs: check-gate
    if: needs.check-gate.outputs.should_review == 'true'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    outputs:
      codex_comment: ${{ steps.poll.outputs.comment }}
    steps:
      - name: Poll for Codex Cloud comment
        id: poll
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          ROUND=${{ needs.check-gate.outputs.current_round }}
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          # The workflow trigger time — Codex Cloud comment must be after this
          TRIGGER_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

          echo "Waiting for Codex Cloud review comment..."
          for i in $(seq 1 30); do
            sleep 20
            # Look for a comment from the Codex bot posted after the workflow started
            COMMENT=$(gh api "repos/$REPO/issues/$PR/comments" \
              --jq "[.[] | select(.user.login == env.CODEX_BOT_NAME or .user.login == \"codex-bot[bot]\") | select(.created_at >= \"$TRIGGER_TIME\")] | last | .body // empty")

            if [ -n "$COMMENT" ]; then
              echo "Found Codex Cloud review comment"
              echo "comment<<EOF" >> $GITHUB_OUTPUT
              echo "$COMMENT" >> $GITHUB_OUTPUT
              echo "EOF" >> $GITHUB_OUTPUT
              exit 0
            fi
            echo "Attempt $i/30 — no comment yet, waiting 20s..."
          done

          echo "Timed out waiting for Codex Cloud comment (10 minutes)"
          echo "comment=" >> $GITHUB_OUTPUT

  # ─── Convergence Check ──────────────────────────────────
  check-convergence:
    needs: [check-gate, wait-for-codex]
    if: always() && needs.check-gate.outputs.should_review == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    outputs:
      verdict: ${{ steps.check.outputs.verdict }}
    steps:
      - name: Check for approval
        id: check
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CODEX_COMMENT: ${{ needs.wait-for-codex.outputs.codex_comment }}
        run: |
          ROUND=${{ needs.check-gate.outputs.current_round }}

          # Look for the explicit approval signal from Codex Cloud
          if echo "$CODEX_COMMENT" | grep -qi "APPROVED: No P0/P1/P2 issues found"; then
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud approved — no P0/P1/P2 issues"
          elif [ -z "$CODEX_COMMENT" ]; then
            # No comment found (timeout) — treat as approval to avoid blocking
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud did not respond — treating as approved"
          elif [ "$ROUND" -ge "$MAX_REVIEW_ROUNDS" ]; then
            echo "verdict=capped" >> $GITHUB_OUTPUT
            echo "Max rounds reached — auto-merging"
          else
            echo "verdict=fix" >> $GITHUB_OUTPUT
            echo "Findings present — triggering fix cycle"
          fi

      - name: Label round
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          ROUND=${{ needs.check-gate.outputs.current_round }}
          gh api repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/labels \
            -X POST -f "labels[]=review-round-$ROUND" || true

      - name: Handle verdict
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERDICT="${{ steps.check.outputs.verdict }}"
          PR=${{ github.event.pull_request.number }}
          ROUND=${{ needs.check-gate.outputs.current_round }}

          if [ "$VERDICT" = "approved" ]; then
            gh pr comment "$PR" --body "## Code Review: APPROVED

          Codex Cloud found no P0/P1/P2 issues. This PR is ready to merge.

          _Round $ROUND of $MAX_REVIEW_ROUNDS_"

            gh api repos/${{ github.repository }}/issues/$PR/labels \
              -X POST -f "labels[]=ai-review-approved" || true

          elif [ "$VERDICT" = "capped" ]; then
            gh pr comment "$PR" --body "## Code Review: AUTO-MERGING (round cap)

          After $MAX_REVIEW_ROUNDS rounds, some findings may remain.
          Auto-merging — self-review and $MAX_REVIEW_ROUNDS rounds of external review have run.

          _Reached maximum review rounds._"

            gh api repos/${{ github.repository }}/issues/$PR/labels \
              -X POST -f "labels[]=ai-review-capped" || true
          fi

  # ─── Auto-merge (approved or capped) ────────────────────
  auto-merge:
    needs: [check-convergence]
    if: needs.check-convergence.outputs.verdict == 'approved' || needs.check-convergence.outputs.verdict == 'capped'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Auto-merge PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr merge ${{ github.event.pull_request.number }} \
            --repo ${{ github.repository }} \
            --squash --auto --delete-branch

  # ─── Claude Code Fix (only if findings remain) ──────────
  claude-fix:
    needs: [check-gate, check-convergence]
    if: needs.check-convergence.outputs.verdict == 'fix'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR_NUMBER: ${{ github.event.pull_request.number }}
            REVIEW_ROUND: ${{ needs.check-gate.outputs.current_round }}

            Read .github/review-prompts/fix-prompt.md for your full instructions.

            Codex Cloud has posted review findings as a PR comment.
            Read ALL comments from Round ${{ needs.check-gate.outputs.current_round }}.
            Fix the P0, P1, and P2 issues identified.
            Run lint and test commands from CLAUDE.md Key Commands to verify.
            Commit and push your fixes.
          claude_args: |
            --allowedTools "Bash(git:*),Bash(gh pr comment:*),Bash(make:*),Bash(npm:*),Read,Write,Bash(pip:*)"
            --max-turns 10
```

### 5. Update CLAUDE.md

Add this section to CLAUDE.md (the Workflow Audit and Claude.md Optimization prompts will pick it up):

```markdown
## Code Review

### Self-Review (before every PR)
Before pushing, run a review subagent to check changes against `docs/review-standards.md`. Fix any P0/P1/P2 issues found. This is built into the PR workflow (see step 2 below).

### External Review (optional — Codex Cloud)
If Codex Cloud is configured, PRs are automatically reviewed by Codex Cloud when opened or updated.

1. You create the PR as normal (push branch, `gh pr create`)
2. Codex Cloud auto-reviews (reads `AGENTS.md` for instructions)
3. If it finds P0/P1/P2 issues, Claude Code Action automatically fixes them
4. The loop repeats until Codex approves or 3 rounds are reached
5. After approval or 3 rounds, the PR auto-merges

### Human Controls
- Comment `/skip-review` to bypass Codex review entirely
- Comment `/lgtm` to approve and allow merge
- The `ai-review-approved` label means Codex Cloud approved
- The `ai-review-capped` label means the loop hit its round cap and auto-merged

### What Reviewers Check
See `docs/review-standards.md` for the full review criteria. Reviewers check against your project's documented standards, not generic best practices.
```

---

## Customization Options

### Adding Gemini Code Assist as a Second Reviewer

Install the Gemini Code Assist GitHub App for an independent second perspective at no API cost. Update the convergence check in `code-review.yml` to also wait for a Gemini comment and require both reviewers to approve before auto-merging.

### Disabling Auto-Merge

To require human approval instead of auto-merging:
1. Remove the `auto-merge` job from `code-review.yml`
2. Change the `capped` verdict to add `needs-human-review` label instead of `ai-review-capped`
3. The PR will wait for a human to merge manually

### Adjusting the Round Cap

Change the `MAX_REVIEW_ROUNDS` env var in `code-review.yml`. Higher caps catch more issues but increase fix costs (~$0.43 per round). Most PRs converge in 1-2 rounds.

### Tuning Review Behavior

Edit `AGENTS.md` to change what Codex Cloud looks for. Add "What NOT to flag" examples from real reviews to reduce false positives. Adjust severity definitions in `docs/review-standards.md` to calibrate what gets caught.

---

## Process

1. **Create the review standards document** (`docs/review-standards.md`) by pulling review criteria from your existing coding-standards.md, tdd-standards.md, and project-structure.md. Use the severity definitions above (P0/P1/P2/P3).

2. **Create `AGENTS.md`** at the repo root with the content above. This is what Codex Cloud reads for review instructions.

3. **Create the fix prompt** (`.github/review-prompts/fix-prompt.md`) with the content above.

4. **Create the GitHub Actions workflow** (`.github/workflows/code-review.yml`) with the content above.

4.5. **Detect the Codex Cloud bot username**. After the user confirms they've installed the Codex Cloud GitHub App, auto-detect the bot username and update the workflow:
   ```bash
   # Detect the Codex bot username from installed apps
   BOT_NAME=$(gh api repos/:owner/:repo/installations \
     --jq '.[] | select(.app_slug | test("codex|chatgpt")) | .app_slug + "[bot]"' 2>/dev/null | head -1)
   ```
   If detected, update the `CODEX_BOT_NAME` env var in `.github/workflows/code-review.yml` with the actual value. If detection fails (API permissions may vary), ask the user to check the bot's username from a test PR comment and update manually.

5. **Configure repository secret**: Run `gh secret set ANTHROPIC_API_KEY` in your terminal and paste the key when prompted (the only API key needed — Codex Cloud uses your ChatGPT Pro subscription).

6. **Configure repository settings**:
   - Settings → Actions → General → Workflow permissions → Read and write
   - Settings → Actions → General → Allow GitHub Actions to create and approve pull requests

7. **Update CLAUDE.md** with the Code Review section so agents understand the review process exists.

8. **Test with a small PR** that has intentional issues (unused variable, missing error handling, hardcoded secret). Verify:
   - Codex Cloud posts a review comment with findings
   - The convergence check detects findings and triggers the fix job
   - Claude Code Action fixes the P0/P1/P2 issues
   - Second review round approves
   - The PR auto-merges with the `ai-review-approved` label

9. **Commit everything** to the repo:
   ```bash
   git add docs/review-standards.md AGENTS.md .github/review-prompts/ .github/workflows/code-review.yml CLAUDE.md
   git commit -m "[BD-<id>] feat: add code review loop (Codex Cloud + Claude fix)"
   ```

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
