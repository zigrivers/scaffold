---
description: "Set up multi-model code review on PRs"
---

Set up a two-tier automated code review system: a local self-review before every PR (required for all projects), and an optional external Codex Cloud review loop that auto-fixes findings and auto-merges.

For background research, tool comparisons, and design decisions, see `Multi Model Review Research.md`. For cost analysis, see `Multi Model Review Cost Analysis.md`.

## Mode Detection

Before starting, check if `AGENTS.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read `AGENTS.md`, all workflow files in `.github/workflows/code-review-*.yml`, `docs/review-standards.md`, and `.github/review-prompts/fix-prompt.md` completely. Check for a tracking comment on line 1 of `AGENTS.md`: `<!-- scaffold:multi-model-review v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing files against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing files
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/git-workflow.md`, `CLAUDE.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1 of `AGENTS.md`: `<!-- scaffold:multi-model-review v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `AGENTS.md`
- **Secondary output**: `.github/workflows/code-review-trigger.yml`, `.github/workflows/code-review-handler.yml`, `.github/workflows/codex-timeout.yml`, `docs/review-standards.md`, `.github/review-prompts/fix-prompt.md`
- **Preserve**: Custom review rules in `AGENTS.md`, `CODEX_BOT_NAME` env var, `MAX_REVIEW_ROUNDS` setting, repository-specific secrets configuration, custom severity rules in `docs/review-standards.md`
- **Related docs**: `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/git-workflow.md`, `CLAUDE.md`
- **Special rules**: Never change `CODEX_BOT_NAME` without verifying the actual bot username. Preserve all "What NOT to flag" customizations in `AGENTS.md`. Each secondary file should be checked independently for existence (update vs. create).

---

## Architecture

### Two-Tier Review

```
TIER 1: LOCAL SELF-REVIEW (before push — required, no extra cost)
  Agent runs review subagent → checks against docs/review-standards.md
       ↓
  Fixes P0/P1/P2 issues locally → runs lint + test → pushes

TIER 2: EXTERNAL CODEX CLOUD REVIEW (after PR — optional, credit-based)
  Codex Cloud auto-reviews via GitHub App (reads AGENTS.md)
       ↓
  Convergence check (GitHub Actions — event-driven, no polling)
  • No P0/P1 → auto-merge
  • Round >= 3 → auto-merge anyway (label: ai-review-capped)
  • Otherwise → Claude Code Action fixes (needs ANTHROPIC_API_KEY)
       ↓
  Push fixes → re-triggers Codex Cloud review
```

**Tier 1 (self-review)** is built into the Git Workflow prompt and applies to ALL projects. It is inserted as a step in the PR workflow — see the Git Workflow prompt for the exact command.

**Tier 2 (Codex Cloud + CI fix loop)** is optional and per-project. The rest of this prompt sets up Tier 2.

### What Triggers What (Tier 2)

The loop is fully event-driven via two GitHub Actions workflows — no polling, no external orchestrator:

1. **PR opened or pushed** → `code-review-trigger.yml` runs gate check, labels round, adds `awaiting-codex-review` label
2. **Codex Cloud posts PR review** (event-driven — no polling, no wait job)
3. **`pull_request_review` event** → `code-review-handler.yml` fires, filters to Codex bot only
4. Handler checks review freshness (SHA match), runs convergence, labels result
5. **Approved or round cap** → auto-merge runs `gh pr merge --squash --auto --delete-branch`
6. **Findings remain and rounds < cap** → Claude Code Action reads P0/P1 findings, fixes, pushes
7. **New push on PR branch** → re-triggers step 1
8. *(Optional)* `codex-timeout.yml` runs on a cron schedule — finds PRs with stale `awaiting-codex-review` label (>15 min) and auto-approves them

### Safety Rails

- **Round cap**: Maximum 3 review rounds. After that, the PR auto-merges with the `ai-review-capped` label — no human gate.
- **Bot-loop prevention**: Review workflow skips if the latest commit author is the fix bot AND the round cap is hit. The fix job only fires when the convergence job says "fix," not on raw push events.
- **Cost cap**: Claude Code Action fix gets `--max-turns 10`. Round 1 uses Sonnet (~$0.84/round); round 2+ escalates to Opus (~$1.40/round). Codex Cloud reviews are credit-based (weekly limits apply, ~25 credits per review).
- **Read-only reviewer**: Codex Cloud has no write access. Only Claude Code Action (the engineer) has `contents: write`.
- **Fork protection**: Gate job blocks fork PRs and draft PRs from triggering the review loop (prevents secret exfiltration via malicious PRs).
- **Human override**: Any repo member comment with `/lgtm` or `/skip-review` bypasses the loop and allows merge (verified via `author_association`).
- **File filter**: Gate job uses the GitHub API to check changed files and skips review if only docs/config files changed (markdown, yaml, json, toml, lock files).
- **Usage-limit detection**: If Codex Cloud hits its credit limit and posts a usage-limit message instead of a review, the handler adds an `ai-review-blocked` label and requires human merge (does NOT auto-approve).

---

## Prerequisites

| Requirement | How to Get It |
|-------------|--------------|
| **ChatGPT subscription (Plus/Pro/Team)** | For Codex Cloud auto-reviews — subscribe at chatgpt.com. Reviews use credits (~25 credits per review); weekly limits vary by plan. |
| **Codex Cloud GitHub App** | Install "ChatGPT Codex Connector" on your repo at github.com, then enable "Code review" in Codex settings. The default bot username `chatgpt-codex-connector[bot]` is pre-configured in the workflow. |
| **Anthropic API key** | Create at console.anthropic.com → run `gh secret set ANTHROPIC_API_KEY` and paste when prompted (for Claude Code Action fixes, ~$5-7/month) |
| **GitHub App (Claude)** | Run `claude /install-github-app` in Claude Code terminal, or install from github.com/apps/claude |
| **Codex Cloud credits** | Codex Cloud has usage limits for code reviews. Check your limits at chatgpt.com/codex/settings/usage. You may need to add credits or upgrade your plan. |
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

## Review guidelines

You are reviewing a pull request as an independent code reviewer. You did NOT write this code.

NOTE: Codex GitHub reviews flag only P0/P1. P2/P3 are handled by local self-review.

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

### Approval Signal
If there are NO P0 or P1 issues, your review MUST include this exact line:
```
APPROVED: No P0/P1 issues found.
```

If there ARE findings, list each one with its severity, file, line, and a concrete suggestion.

### Rules
- Only flag P0 and P1 issues. Skip P2 (medium) and P3 (low) — those are handled by local self-review and humans.
- Be specific: include exact file paths and line numbers.
- For each finding, include a concrete suggestion for how to fix it.
- Do not push commits or modify the PR; review only.
- Do NOT flag style/formatting issues — the linter handles those.
- Do NOT suggest alternative approaches unless the current one has a defect.
- Do NOT rewrite working code just because you'd do it differently.
```

### 3. Fix Prompt (`.github/review-prompts/fix-prompt.md`)

```markdown
You are the engineer who wrote this PR. Codex Cloud has posted review findings.

## Your Task
1. Read ALL review findings from Codex Cloud for the CURRENT commit. Findings are posted as inline PR review comments. Use:
   `gh api repos/OWNER/REPO/pulls/NUMBER/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]" and .commit_id == "COMMIT_SHA") | {path, line, start_line, body, diff_hunk}'`
   (Replace OWNER/REPO, NUMBER, and COMMIT_SHA with the values passed via the workflow.)
2. For each **P0** or **P1** finding:
   - If the finding is valid: fix the code.
   - If the finding is a false positive: note why in a reply comment.
3. Run the project's lint and test commands (see CLAUDE.md Key Commands) to verify fixes.
4. Commit your fixes with message: `[BD-<task-id>] fix: address review feedback (round N)`
5. Push to the PR branch.

## Rules
- Fix P0 and P1 issues — Codex Cloud only flags these two severity levels.
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

### 4. GitHub Actions Workflows

The review loop uses two event-driven workflows (no polling) plus an optional timeout workflow:

#### 4a. Trigger Workflow (`.github/workflows/code-review-trigger.yml`)

Runs on PR open/push. Checks the gate, labels the round, and adds `awaiting-codex-review`. No checkout needed — uses API calls only.

```yaml
name: "Code Review: Trigger"

on:
  pull_request:
    types: [opened, synchronize]

concurrency:
  group: review-trigger-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  MAX_REVIEW_ROUNDS: 3

jobs:
  check-gate:
    runs-on: ubuntu-latest
    outputs:
      should_review: ${{ steps.gate.outputs.should_review }}
      current_round: ${{ steps.gate.outputs.current_round }}
    steps:
      - name: Check review gate
        id: gate
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}

          # Block fork PRs (security — prevents secret exfiltration)
          if [ "${{ github.event.pull_request.head.repo.full_name }}" != "${{ github.repository }}" ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Fork PR — skipping automation"
            exit 0
          fi

          # Skip draft PRs
          if [ "${{ github.event.pull_request.draft }}" = "true" ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Draft PR — skipping review"
            exit 0
          fi

          # Check if any code files changed (skip for docs/config-only PRs)
          CODE_CHANGED=$(gh api "repos/$REPO/pulls/$PR/files" --paginate \
            --jq '[.[].filename | select(test("\\.(md|ya?ml|jsonl?|toml|lock)$") | not)] | length')

          if [ "$CODE_CHANGED" -eq 0 ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "No code files changed — skipping review"
            exit 0
          fi

          # Count existing review-round labels
          ROUND_LABELS=$(gh api "repos/$REPO/issues/$PR/labels" \
            --jq '[.[].name | select(startswith("review-round-"))] | length')
          CURRENT_ROUND=$((ROUND_LABELS + 1))
          echo "current_round=$CURRENT_ROUND" >> $GITHUB_OUTPUT

          # Check for human override (only from repo members)
          OVERRIDE=$(gh api "repos/$REPO/issues/$PR/comments" \
            --jq '[.[] | select(
              (.author_association | IN("OWNER","MEMBER","COLLABORATOR"))
              and (.body | test("(^|\\s)/(skip-review|lgtm)(\\s|$)"; "i"))
            )] | length')

          if [ "$OVERRIDE" -gt 0 ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Human override detected — skipping review"
          elif [ "$CURRENT_ROUND" -gt "$MAX_REVIEW_ROUNDS" ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Max rounds reached — skipping review"
          else
            echo "should_review=true" >> $GITHUB_OUTPUT
          fi

  label-and-signal:
    needs: check-gate
    if: needs.check-gate.outputs.should_review == 'true'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Label round and add awaiting-codex-review
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          ROUND=${{ needs.check-gate.outputs.current_round }}

          # Label the round
          gh api "repos/$REPO/issues/$PR/labels" \
            -X POST -f "labels[]=review-round-$ROUND" || true

          # Add awaiting-codex-review label (removed by handler when review arrives)
          gh api "repos/$REPO/issues/$PR/labels" \
            -X POST -f "labels[]=awaiting-codex-review" || true
```

#### 4b. Handler Workflow (`.github/workflows/code-review-handler.yml`)

Fires when Codex Cloud posts a PR review or comment. Checks freshness, runs convergence, auto-merges or triggers fix.

```yaml
name: "Code Review: Handler"

on:
  pull_request_review:
    types: [submitted]
  issue_comment:
    types: [created]

env:
  MAX_REVIEW_ROUNDS: 3
  CODEX_BOT_NAME: "chatgpt-codex-connector[bot]"

jobs:
  # ─── Handle Codex usage-limit comments ─────────────────
  check-usage-limit:
    if: >-
      github.event_name == 'issue_comment'
      && github.event.issue.pull_request
      && github.event.comment.user.login == 'chatgpt-codex-connector[bot]'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Check for usage-limit message
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          BODY="${{ github.event.comment.body }}"
          PR=${{ github.event.issue.number }}
          REPO=${{ github.repository }}

          if echo "$BODY" | grep -qi "usage limit"; then
            # Remove awaiting label, add blocked label
            gh api "repos/$REPO/issues/$PR/labels/awaiting-codex-review" -X DELETE || true
            gh api "repos/$REPO/issues/$PR/labels" \
              -X POST -f "labels[]=ai-review-blocked" || true

            gh pr comment "$PR" --repo "$REPO" --body "## Code Review: BLOCKED (usage limit)

          Codex Cloud hit its credit limit and cannot review this PR.
          A human must review and merge this PR manually.

          _Remove the \`ai-review-blocked\` label and push a new commit to retry._"
          fi

  # ─── Handle Codex PR review ────────────────────────────
  handle-review:
    if: >-
      github.event_name == 'pull_request_review'
      && github.event.review.user.login == 'chatgpt-codex-connector[bot]'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    outputs:
      verdict: ${{ steps.converge.outputs.verdict }}
      current_round: ${{ steps.round.outputs.current_round }}
    steps:
      - name: Check review freshness
        id: fresh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          REVIEW_SHA="${{ github.event.review.commit_id }}"
          HEAD_SHA="${{ github.event.pull_request.head.sha }}"

          if [ "$REVIEW_SHA" != "$HEAD_SHA" ]; then
            echo "is_fresh=false" >> $GITHUB_OUTPUT
            echo "Stale review (commit $REVIEW_SHA vs HEAD $HEAD_SHA) — skipping"
          else
            echo "is_fresh=true" >> $GITHUB_OUTPUT
          fi

      - name: Get current round
        id: round
        if: steps.fresh.outputs.is_fresh == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          ROUND_LABELS=$(gh api "repos/$REPO/issues/$PR/labels" \
            --jq '[.[].name | select(startswith("review-round-"))] | length')
          echo "current_round=$ROUND_LABELS" >> $GITHUB_OUTPUT

      - name: Remove awaiting label
        if: steps.fresh.outputs.is_fresh == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh api "repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/labels/awaiting-codex-review" \
            -X DELETE || true

      - name: Convergence check
        id: converge
        if: steps.fresh.outputs.is_fresh == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REVIEW_BODY: ${{ github.event.review.body }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          HEAD_SHA="${{ github.event.pull_request.head.sha }}"
          ROUND=${{ steps.round.outputs.current_round }}
          BOT="${{ env.CODEX_BOT_NAME }}"

          echo "Round: $ROUND"

          # 1. Check for explicit approval signal
          if echo "$REVIEW_BODY" | grep -q "APPROVED: No P0/P1 issues found"; then
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud explicitly approved"
            exit 0
          fi

          # 2. Check for zero inline findings on current commit
          FINDINGS=$(gh api "repos/$REPO/pulls/$PR/comments" \
            --jq "[.[] | select(.user.login == \"$BOT\" and .commit_id == \"$HEAD_SHA\")] | length")

          if [ "$FINDINGS" -eq 0 ]; then
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud reviewed with no inline findings — approved"
            exit 0
          fi

          # 3. Check round cap
          if [ "$ROUND" -ge "$MAX_REVIEW_ROUNDS" ]; then
            echo "verdict=capped" >> $GITHUB_OUTPUT
            echo "Max rounds reached — auto-merging"
            exit 0
          fi

          # 4. Findings remain, rounds left — fix
          echo "verdict=fix" >> $GITHUB_OUTPUT
          echo "$FINDINGS finding(s) present — triggering fix cycle"

      - name: Handle verdict
        if: steps.fresh.outputs.is_fresh == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERDICT="${{ steps.converge.outputs.verdict }}"
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          ROUND=${{ steps.round.outputs.current_round }}

          if [ "$VERDICT" = "approved" ]; then
            gh pr comment "$PR" --repo "$REPO" --body "## Code Review: APPROVED

          Codex Cloud found no P0/P1 issues. This PR is ready to merge.

          _Round $ROUND of $MAX_REVIEW_ROUNDS_"

            gh api "repos/$REPO/issues/$PR/labels" \
              -X POST -f "labels[]=ai-review-approved" || true

          elif [ "$VERDICT" = "capped" ]; then
            gh pr comment "$PR" --repo "$REPO" --body "## Code Review: AUTO-MERGING (round cap)

          After $MAX_REVIEW_ROUNDS rounds, some findings may remain.
          Auto-merging — self-review and $MAX_REVIEW_ROUNDS rounds of external review have run.

          _Reached maximum review rounds._"

            gh api "repos/$REPO/issues/$PR/labels" \
              -X POST -f "labels[]=ai-review-capped" || true
          fi

  # ─── Auto-merge (approved or capped) ────────────────────
  auto-merge:
    needs: [handle-review]
    if: >-
      needs.handle-review.outputs.verdict == 'approved'
      || needs.handle-review.outputs.verdict == 'capped'
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
    needs: [handle-review]
    if: needs.handle-review.outputs.verdict == 'fix'
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

      - name: Select fix model
        id: model
        run: |
          ROUND=${{ needs.handle-review.outputs.current_round }}
          # Round 1: Sonnet handles straightforward fixes at lower cost
          # Round 2+: Escalate to Opus if prior fix attempt didn't satisfy reviewer
          if [ "${ROUND:-1}" -gt 1 ]; then
            echo "selected=claude-opus-4-6" >> $GITHUB_OUTPUT
            echo "Using Opus (round ${ROUND} — escalating after prior fix attempt)"
          else
            echo "selected=claude-sonnet-4-5-20250929" >> $GITHUB_OUTPUT
            echo "Using Sonnet (round ${ROUND} — first fix attempt)"
          fi

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          allowed_bots: 'claude[bot]'
          prompt: |
            REPO: ${{ github.repository }}
            PR_NUMBER: ${{ github.event.pull_request.number }}
            REVIEW_ROUND: ${{ needs.handle-review.outputs.current_round }}
            HEAD_SHA: ${{ github.event.pull_request.head.sha }}

            Read .github/review-prompts/fix-prompt.md for your full instructions.

            Codex Cloud has posted review findings as PR review comments (inline on files).
            To read them, run: gh api repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/comments --jq '.[] | select(.user.login == "${{ env.CODEX_BOT_NAME }}" and .commit_id == "${{ github.event.pull_request.head.sha }}") | {path, line, start_line, body, diff_hunk}'
            Fix the P0 and P1 issues identified.
            Run lint and test commands from CLAUDE.md Key Commands to verify.
            Commit and push your fixes.
          claude_args: |
            --model ${{ steps.model.outputs.selected }}
            --allowedTools "Bash(git:*),Bash(gh:*),Bash(make:*),Bash(npm:*),Read,Write,Edit,Bash(pip:*),Bash(cd:*),Bash(uv:*),Bash(pnpm:*)"
            --max-turns 10
```

#### 4c. Timeout Workflow (`.github/workflows/codex-timeout.yml`) — Optional

If Codex Cloud doesn't respond within 15 minutes, this cron job auto-approves the PR. Only create this if you want a fallback for unresponsive Codex Cloud reviews.

```yaml
name: "Code Review: Codex Timeout"

on:
  schedule:
    - cron: '*/30 * * * *'

jobs:
  check-stale:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Find stale awaiting-codex-review PRs
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          REPO=${{ github.repository }}

          # Find open PRs with the awaiting-codex-review label
          PRS=$(gh api "repos/$REPO/issues?labels=awaiting-codex-review&state=open" \
            --jq '[.[] | select(.pull_request)] | .[].number')

          for PR in $PRS; do
            # Check when the label was added (use PR updated_at as proxy)
            UPDATED=$(gh api "repos/$REPO/pulls/$PR" --jq '.updated_at')
            UPDATED_TS=$(date -d "$UPDATED" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$UPDATED" +%s 2>/dev/null || echo "0")
            NOW_TS=$(date +%s)
            AGE_MIN=$(( (NOW_TS - UPDATED_TS) / 60 ))

            if [ "$AGE_MIN" -gt 15 ]; then
              echo "PR #$PR has been awaiting Codex review for ${AGE_MIN}m — auto-approving"

              # Remove awaiting label
              gh api "repos/$REPO/issues/$PR/labels/awaiting-codex-review" -X DELETE || true

              # Add timeout label
              gh api "repos/$REPO/issues/$PR/labels" \
                -X POST -f "labels[]=codex-review-timeout" || true

              # Comment and auto-merge
              gh pr comment "$PR" --repo "$REPO" --body "## Code Review: TIMEOUT

          Codex Cloud did not respond within 15 minutes. Auto-approving.

          _Self-review (Tier 1) already ran before this PR was created._"

              gh pr merge "$PR" --repo "$REPO" --squash --auto --delete-branch || true
            fi
          done
```

### 5. Update CLAUDE.md

Add this section to CLAUDE.md (the Workflow Audit and Claude.md Optimization prompts will pick it up):

```markdown
## Code Review

### Self-Review (before every PR)
Before pushing, run a review subagent to check changes against `docs/review-standards.md`. Fix any P0/P1/P2 issues found. This is built into the PR workflow (see step 2 below).

### External Review (optional — Codex Cloud)
If Codex Cloud is configured, PRs are automatically reviewed by Codex Cloud when opened or updated. Codex Cloud flags P0/P1 issues only (P2/P3 are handled by self-review).

1. You create the PR as normal (push branch, `gh pr create`)
2. Codex Cloud auto-reviews (reads `AGENTS.md` for instructions)
3. If it finds P0/P1 issues, Claude Code Action automatically fixes them
4. The loop repeats until Codex approves or 3 rounds are reached
5. After approval or 3 rounds, the PR auto-merges

### Human Controls
- Comment `/skip-review` to bypass Codex review entirely
- Comment `/lgtm` to approve and allow merge
- The `ai-review-approved` label means Codex Cloud approved
- The `ai-review-capped` label means the loop hit its round cap and auto-merged
- The `ai-review-blocked` label means Codex Cloud hit its usage limit — human merge required

### What Reviewers Check
See `docs/review-standards.md` for the full review criteria. Reviewers check against your project's documented standards, not generic best practices.
```

---

## Customization Options

### Adding Gemini Code Assist as a Second Reviewer

Install the Gemini Code Assist GitHub App for an independent second perspective at no API cost. Update the convergence check in `code-review-handler.yml` to also check for a Gemini review and require both reviewers to approve before auto-merging.

### Disabling Auto-Merge

To require human approval instead of auto-merging:
1. Remove the `auto-merge` job from `code-review-handler.yml`
2. Change the `capped` verdict to add `needs-human-review` label instead of `ai-review-capped`
3. The PR will wait for a human to merge manually

### Adjusting the Round Cap

Change the `MAX_REVIEW_ROUNDS` env var in both `code-review-trigger.yml` and `code-review-handler.yml`. Higher caps catch more issues but increase fix costs (~$0.43 per round). Most PRs converge in 1-2 rounds.

### Tuning Review Behavior

Edit `AGENTS.md` to change what Codex Cloud looks for. Add "What NOT to flag" examples from real reviews to reduce false positives. Adjust severity definitions in `docs/review-standards.md` to calibrate what gets caught.

---

## Process

1. **Create the review standards document** (`docs/review-standards.md`) by pulling review criteria from your existing coding-standards.md, tdd-standards.md, and project-structure.md. Use the severity definitions above (P0/P1/P2/P3).

2. **Create `AGENTS.md`** at the repo root with the content above. This is what Codex Cloud reads for review instructions.

3. **Create the fix prompt** (`.github/review-prompts/fix-prompt.md`) with the content above.

4. **Create the GitHub Actions workflows** — create all three files from the workflow sections above:
   - `.github/workflows/code-review-trigger.yml` (runs on PR open/push)
   - `.github/workflows/code-review-handler.yml` (runs on Codex review/comment)
   - `.github/workflows/codex-timeout.yml` (optional — cron-based timeout fallback)

5. **Configure repository secret**: Run `gh secret set ANTHROPIC_API_KEY` in your terminal and paste the key when prompted (the only API key needed — Codex Cloud uses credits from your ChatGPT subscription).

6. **Configure repository settings**:
   - Settings → Actions → General → Workflow permissions → Read and write
   - Settings → Actions → General → Allow GitHub Actions to create and approve pull requests

7. **Update CLAUDE.md** with the Code Review section so agents understand the review process exists.

8. **Test with a small PR** that has intentional issues (unused variable, missing error handling, hardcoded secret). Verify:
   - The trigger workflow labels the round and adds `awaiting-codex-review`
   - Codex Cloud posts a PR review with findings (check the bot username — the default `chatgpt-codex-connector[bot]` is correct for the standard Codex Cloud GitHub App; update `CODEX_BOT_NAME` in the handler workflow if it differs)
   - The handler workflow fires on the review event, checks freshness, and runs convergence
   - Claude Code Action fixes the P0/P1 issues
   - Second review round approves
   - The PR auto-merges with the `ai-review-approved` label

9. **Commit everything** to the repo:
   ```bash
   git add docs/review-standards.md AGENTS.md .github/review-prompts/ .github/workflows/code-review-trigger.yml .github/workflows/code-review-handler.yml .github/workflows/codex-timeout.yml CLAUDE.md
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
