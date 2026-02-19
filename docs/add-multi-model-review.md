# Add Multi-Model Code Review (Migration Prompt)

Add the two-tier automated code review system to this existing project: a local self-review before every PR, and an external Codex Cloud review loop that auto-fixes findings and auto-merges.

This prompt is for projects that were set up with the scaffold pipeline but did NOT run the Multi-Model Code Review prompt during initial setup. It can also be used on any project that has `CLAUDE.md`, `docs/coding-standards.md`, and `docs/tdd-standards.md`.

---

## Phase 1: Assess Current State

Read these files to understand the project's current setup:

| File | What to Look For |
|------|-----------------|
| `CLAUDE.md` | Key Commands table, workflow section, existing review process |
| `docs/coding-standards.md` | Code conventions, commit format, review checklist |
| `docs/tdd-standards.md` | Test categories, coverage requirements |
| `docs/project-structure.md` | File organization, module boundaries |
| `docs/git-workflow.md` | PR workflow steps, branch strategy |
| `.github/workflows/` | Any existing CI workflows |
| `AGENTS.md` | Does it already exist? |
| `docs/review-standards.md` | Does it already exist? |

Check for conflicts:
- If `docs/review-standards.md` already exists, read it and merge with the new content (don't overwrite)
- If `AGENTS.md` already exists, read it and add the review instructions section (don't overwrite other sections)
- If `.github/workflows/code-review-trigger.yml`, `.github/workflows/code-review-handler.yml`, `.github/workflows/code-review.yml`, or `.github/workflows/multi-model-review.yml` already exists, this project may already have the review loop — ask the user before proceeding
- If the PR workflow in `docs/git-workflow.md` already has a self-review step, skip adding it again

Report what you found and any conflicts before proceeding.

---

## Phase 2: Create Review Infrastructure

### 2.1 Create `docs/review-standards.md`

Create this document by pulling review criteria from the project's existing coding-standards.md, tdd-standards.md, and project-structure.md. This is the single source of truth for what "good code" means in this project.

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

**Customize** the "What NOT to Flag" and "Review Priorities" sections based on what you learned from reading the project's actual standards docs. Add project-specific rules (e.g., "Do NOT flag missing TypeScript strict mode if the project uses JavaScript").

### 2.2 Create `AGENTS.md` (repo root)

Codex Cloud reads `AGENTS.md` at the repo root for custom review instructions.

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

### 2.3 Create `.github/review-prompts/fix-prompt.md`

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

### 2.4 Create GitHub Actions Workflows

The review loop uses two event-driven workflows (no polling) plus an optional timeout workflow.

#### `.github/workflows/code-review-trigger.yml`

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

#### `.github/workflows/code-review-handler.yml`

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

#### `.github/workflows/codex-timeout.yml` — Optional

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

---

## Phase 3: Update Existing Documents

### 3.1 Update AI Review Step in PR Workflow

The base AI review step was already added to `docs/git-workflow.md` and CLAUDE.md by the Git Workflow prompt. This prompt upgrades the review to also check against `docs/review-standards.md`.

Find the AI review step in `docs/git-workflow.md` (step 2 in the PR workflow) and update it to reference `docs/review-standards.md`:

```
2. AI review — spawn a review subagent to check `git diff origin/main...HEAD`:
   - Check against docs/review-standards.md (P0/P1/P2 issues), CLAUDE.md, and docs/coding-standards.md
   - Fix P0/P1/P2 findings, re-run quality gates
   - Log recurring patterns to tasks/lessons.md
```

If the same PR workflow appears in CLAUDE.md (it usually does), update it there too.

### 3.2 Update CLAUDE.md

Add a "Code Review" section to CLAUDE.md:

```markdown
## Code Review

### Self-Review (before every PR)
Before pushing, run a review subagent to check changes against `docs/review-standards.md`. Fix any P0/P1/P2 issues found. This is built into the PR workflow (see the self-review step).

### External Review (Codex Cloud)
PRs are automatically reviewed by Codex Cloud when opened or updated. Codex Cloud flags P0/P1 issues only (P2/P3 are handled by self-review).

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

Also add these entries to the "When to Consult Other Docs" table in CLAUDE.md (if the table exists):

```markdown
| Review criteria / severity definitions | docs/review-standards.md |
| Codex Cloud review instructions | AGENTS.md |
```

### 3.3 Verify Claude Code Permissions

If the project has `.claude/settings.json`, verify that the Task tool (used to spawn review subagents) is not blocked by deny rules. Review subagents use the Task tool — this should work without additional permissions in all standard Claude Code setups.

---

## Phase 4: Prerequisites Checklist

Present this checklist to the user. These are manual steps they need to complete:

```
## Prerequisites — Manual Steps Required

Complete these before the review loop will work:

1. [ ] **ChatGPT subscription (Plus/Pro/Team)** — Subscribe at chatgpt.com (for Codex Cloud auto-reviews; reviews use credits, ~25 per review)

2. [ ] **Install Codex Cloud GitHub App and enable code review**
   - Go to github.com and find the "ChatGPT Codex Connector" app
   - Install it on your repository
   - Enable "Code review" in Codex settings (chatgpt.com → Codex → Settings)
   - The default bot username `chatgpt-codex-connector[bot]` is pre-configured in the workflow

4. [ ] **Add ANTHROPIC_API_KEY repo secret** — For Claude Code Action fixes (~$5-7/month)
   - Create key at console.anthropic.com (if you don't already have one)
   - In your terminal, run: `gh secret set ANTHROPIC_API_KEY`
   - Paste your key when prompted (it won't be echoed to the screen)

5. [ ] **Install Claude GitHub App** — Run `claude /install-github-app` or install from github.com/apps/claude

6. [ ] **Enable Actions Read/Write permissions** — Settings → Actions → General → Workflow permissions → Read and write

7. [ ] **Allow Actions to create PRs** — Settings → Actions → General → Allow GitHub Actions to create and approve pull requests ✓
```

---

## Phase 5: Verify and Test

### 5.1 Verify Files Created

Check that all files exist and are correctly populated:

```bash
# Should all exist
ls docs/review-standards.md
ls AGENTS.md
ls .github/review-prompts/fix-prompt.md
ls .github/workflows/code-review-trigger.yml
ls .github/workflows/code-review-handler.yml
ls .github/workflows/codex-timeout.yml  # optional
```

### 5.2 Verify Cross-References

- `AGENTS.md` references `docs/review-standards.md` and other project docs
- `.github/review-prompts/fix-prompt.md` references `docs/review-standards.md` and instructs reading inline PR review comments (not issue comments)
- `CLAUDE.md` mentions the Code Review section and references `docs/review-standards.md`
- `docs/git-workflow.md` has the self-review step with the correct lint/test commands
- If CLAUDE.md has a PR workflow, it matches the updated `docs/git-workflow.md`
- The handler workflow gets the review body directly from `github.event.review.body` (no API call needed) and checks `pulls/{n}/comments` for inline findings

### 5.3 Verify No Conflicts with Existing CI

- Check `.github/workflows/` for other workflows that trigger on `pull_request` events
- Verify the new `code-review-trigger.yml` and `code-review-handler.yml` won't conflict with existing CI (e.g., duplicate merge attempts)
- If an existing CI workflow already handles auto-merge, coordinate the two — the review workflow's auto-merge job may need adjustment

---

## Phase 6: Commit

```bash
git add docs/review-standards.md AGENTS.md .github/review-prompts/fix-prompt.md
git add .github/workflows/code-review-trigger.yml .github/workflows/code-review-handler.yml .github/workflows/codex-timeout.yml
git add CLAUDE.md docs/git-workflow.md
git commit -m "[BD-<id>] feat: add multi-model code review loop (Codex Cloud + self-review)"
```

If Beads is not initialized in this project, use `[BD-0]` as the task ID.

---

## Process

- Create a Beads task for this work before starting (if Beads is initialized): `bd create "feat: add multi-model code review loop" -p 1` and `bd update <id> --claim`
- Do NOT use AskUserQuestionTool unless you find a genuine conflict (e.g., existing review workflow, existing AGENTS.md with different content)
- Read the project's actual standards docs before creating `docs/review-standards.md` — customize it, don't just copy the template
- Use the project's actual lint and test commands from CLAUDE.md Key Commands in the self-review step
- After creating all files, present the prerequisites checklist (Phase 4) — the user must complete those manual steps
- When the work is complete, close the Beads task: `bd close <id>`
