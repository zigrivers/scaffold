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
- If `.github/workflows/code-review.yml` or `.github/workflows/multi-model-review.yml` already exists, this project may already have the review loop — ask the user before proceeding
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

### 2.3 Create `.github/review-prompts/fix-prompt.md`

```markdown
You are the engineer who wrote this PR. Codex Cloud has posted review findings.

## Your Task
1. Read ALL review findings from Codex Cloud. Findings are posted as inline PR review comments. Use: `gh api repos/OWNER/REPO/pulls/NUMBER/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]") | {path: .path, body: .body}'`
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

### 2.4 Create `.github/workflows/code-review.yml`

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
  CODEX_BOT_NAME: "chatgpt-codex-connector[bot]"

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
            | grep -v -E '\.(md|yaml|yml|json|jsonl|toml|lock)$' | wc -l)

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
      has_review: ${{ steps.poll.outputs.has_review }}
      findings_count: ${{ steps.poll.outputs.findings_count }}
      review_body: ${{ steps.poll.outputs.review_body }}
    steps:
      - name: Poll for Codex Cloud review
        id: poll
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          BOT="${{ env.CODEX_BOT_NAME }}"
          HEAD_SHA="${{ github.event.pull_request.head.sha }}"

          echo "Waiting for Codex Cloud PR review on commit $HEAD_SHA..."
          for i in $(seq 1 30); do
            sleep 20

            # Check PR reviews for the CURRENT commit only (ignore stale reviews from previous rounds)
            REVIEW_BODY=$(gh api "repos/$REPO/pulls/$PR/reviews" \
              --jq "[.[] | select(.user.login == \"$BOT\" and .commit_id == \"$HEAD_SHA\")] | last | .body // empty" 2>/dev/null || echo "")

            if [ -n "$REVIEW_BODY" ]; then
              echo "Found Codex Cloud review for commit $HEAD_SHA"

              # Count inline review comments for the current commit only
              FINDINGS=$(gh api "repos/$REPO/pulls/$PR/comments" \
                --jq "[.[] | select(.user.login == \"$BOT\" and .commit_id == \"$HEAD_SHA\")] | length" 2>/dev/null || echo "0")

              echo "has_review=true" >> $GITHUB_OUTPUT
              echo "findings_count=$FINDINGS" >> $GITHUB_OUTPUT
              echo "review_body<<EOF" >> $GITHUB_OUTPUT
              echo "$REVIEW_BODY" >> $GITHUB_OUTPUT
              echo "EOF" >> $GITHUB_OUTPUT
              echo "Review found with $FINDINGS inline finding(s)"
              exit 0
            fi
            echo "Attempt $i/30 — no review yet, waiting 20s..."
          done

          echo "Timed out waiting for Codex Cloud review (10 minutes)"
          echo "has_review=false" >> $GITHUB_OUTPUT
          echo "findings_count=0" >> $GITHUB_OUTPUT
          echo "review_body=" >> $GITHUB_OUTPUT

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
          HAS_REVIEW: ${{ needs.wait-for-codex.outputs.has_review }}
          FINDINGS_COUNT: ${{ needs.wait-for-codex.outputs.findings_count }}
          REVIEW_BODY: ${{ needs.wait-for-codex.outputs.review_body }}
        run: |
          ROUND=${{ needs.check-gate.outputs.current_round }}

          echo "Round: $ROUND | Has review: $HAS_REVIEW | Findings: $FINDINGS_COUNT"

          if [ "$HAS_REVIEW" != "true" ]; then
            # No review found (timeout) — treat as approval to avoid blocking
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud did not respond — treating as approved"
          elif [ "$FINDINGS_COUNT" -eq 0 ]; then
            # Review exists but no inline findings — approved
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud reviewed with no findings — approved"
          elif echo "$REVIEW_BODY" | grep -qi "APPROVED: No P0/P1/P2 issues found"; then
            # Explicit approval signal in review body
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud explicitly approved"
          elif [ "$ROUND" -ge "$MAX_REVIEW_ROUNDS" ]; then
            echo "verdict=capped" >> $GITHUB_OUTPUT
            echo "Max rounds reached — auto-merging"
          else
            echo "verdict=fix" >> $GITHUB_OUTPUT
            echo "$FINDINGS_COUNT finding(s) present — triggering fix cycle"
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

      - name: Select fix model
        id: model
        run: |
          ROUND=${{ needs.check-gate.outputs.current_round }}
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
            REVIEW_ROUND: ${{ needs.check-gate.outputs.current_round }}

            Read .github/review-prompts/fix-prompt.md for your full instructions.

            Codex Cloud has posted review findings as PR review comments (inline on files).
            To read them, run: gh api repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/comments --jq '.[] | select(.user.login == "${{ env.CODEX_BOT_NAME }}") | {path: .path, body: .body}'
            Fix the P0, P1, and P2 issues identified.
            Run lint and test commands from CLAUDE.md Key Commands to verify.
            Commit and push your fixes.
          claude_args: |
            --model ${{ steps.model.outputs.selected }}
            --allowedTools "Bash(git:*),Bash(gh:*),Bash(make:*),Bash(npm:*),Read,Write,Edit,Bash(pip:*),Bash(cd:*),Bash(uv:*),Bash(pnpm:*)"
            --max-turns 10
```

---

## Phase 3: Update Existing Documents

### 3.1 Add Self-Review to PR Workflow

Find the PR workflow in `docs/git-workflow.md`. Insert the self-review step between the "Commit changes" step and the "Rebase" step. The self-review step should use the project's actual lint and test commands from the CLAUDE.md Key Commands table:

```bash
# Self-review (catch issues before external review)
# Spawn a review subagent to check changes against project standards
claude -p "Review changes on this branch vs origin/main. Check against docs/review-standards.md for P0/P1/P2 issues. Fix any issues found. Run <lint> and <test> after fixes. Commit fixes with [BD-<id>] fix: address self-review findings"
```

Replace `<lint>` and `<test>` with the actual commands from CLAUDE.md Key Commands (e.g., `make lint` and `make test`, or `npm run lint` and `npm test`).

Renumber subsequent steps if the document uses numbered steps.

If the same PR workflow appears in CLAUDE.md (it usually does), update it there too.

### 3.2 Update CLAUDE.md

Add a "Code Review" section to CLAUDE.md:

```markdown
## Code Review

### Self-Review (before every PR)
Before pushing, run a review subagent to check changes against `docs/review-standards.md`. Fix any P0/P1/P2 issues found. This is built into the PR workflow (see the self-review step).

### External Review (Codex Cloud)
PRs are automatically reviewed by Codex Cloud when opened or updated.

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

Also add these entries to the "When to Consult Other Docs" table in CLAUDE.md (if the table exists):

```markdown
| Review criteria / severity definitions | docs/review-standards.md |
| Codex Cloud review instructions | AGENTS.md |
```

### 3.3 Update `.claude/settings.json`

If the project has `.claude/settings.json`, verify that `claude -p` (used for self-review subagent) is not blocked by deny rules. The self-review step spawns a subagent — this should work without additional permissions, but verify.

---

## Phase 4: Prerequisites Checklist

Present this checklist to the user. These are manual steps they need to complete:

```
## Prerequisites — Manual Steps Required

Complete these before the review loop will work:

1. [ ] **ChatGPT Pro subscription** — Subscribe at chatgpt.com (for Codex Cloud auto-reviews)

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
ls .github/workflows/code-review.yml
```

### 5.2 Verify Cross-References

- `AGENTS.md` references `docs/review-standards.md` and other project docs
- `.github/review-prompts/fix-prompt.md` references `docs/review-standards.md` and instructs reading inline PR review comments (not issue comments)
- `CLAUDE.md` mentions the Code Review section and references `docs/review-standards.md`
- `docs/git-workflow.md` has the self-review step with the correct lint/test commands
- If CLAUDE.md has a PR workflow, it matches the updated `docs/git-workflow.md`
- The workflow polls `pulls/{n}/reviews` for the review and `pulls/{n}/comments` for inline findings (not `issues/{n}/comments`)

### 5.3 Verify No Conflicts with Existing CI

- Check `.github/workflows/` for other workflows that trigger on `pull_request` events
- Verify the new `code-review.yml` won't conflict with existing CI (e.g., duplicate merge attempts)
- If an existing CI workflow already handles auto-merge, coordinate the two — the review workflow's auto-merge job may need adjustment

---

## Phase 6: Commit

```bash
git add docs/review-standards.md AGENTS.md .github/review-prompts/fix-prompt.md .github/workflows/code-review.yml
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
