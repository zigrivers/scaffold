---
name: review-pr
description: Run all configured code review channels on a PR (Codex CLI, Gemini CLI, Superpowers code-reviewer)
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [multi-model-review-dispatch, automated-review-tooling]
argument-hint: "<PR number or blank for current branch>"
---

## Purpose

Run all three code review channels on a pull request and reconcile findings.
This is the single entry point for PR code review — agents call this once instead
of remembering three separate review invocations.

The three channels are:
1. **Codex CLI** — OpenAI's code analysis (implementation correctness, security, API contracts)
2. **Gemini CLI** — Google's design reasoning (architectural patterns, broad context)
3. **Superpowers code-reviewer** — Claude subagent review (plan alignment, code quality, testing)

## Inputs

- $ARGUMENTS — PR number (optional; auto-detected from current branch if omitted)
- docs/review-standards.md (optional) — severity definitions and review criteria
- docs/coding-standards.md (required) — coding conventions for review context
- docs/tdd-standards.md (optional) — test coverage expectations
- AGENTS.md (optional) — reviewer instructions with project-specific rules

## Expected Outputs

- All three review channels executed (or fallback documented)
- P0/P1 findings fixed before proceeding
- Review summary with per-channel results and reconciliation

## Instructions

### Step 1: Identify the PR

```bash
# Use argument if provided, otherwise detect from current branch
PR_NUMBER="${ARGUMENTS:-$(gh pr view --json number -q .number 2>/dev/null)}"
```

If no PR is found, stop and tell the user to create a PR first.

### Step 2: Gather Review Context

Collect the PR diff and project standards for review prompts:

```bash
PR_DIFF=$(gh pr diff "$PR_NUMBER")
```

Read these files for review context (skip any that don't exist):
- `docs/coding-standards.md`
- `docs/tdd-standards.md`
- `docs/review-standards.md`
- `AGENTS.md`

### Step 3: Run All Three Review Channels

Run all three channels. Track which ones complete successfully.

#### Channel 1: Codex CLI

**Auth check first** (auth tokens expire — always re-verify):

```bash
codex login status 2>/dev/null && echo "codex authenticated" || echo "codex NOT authenticated"
```

If Codex is not installed, skip this channel and note it in the summary.
If auth fails, tell the user: "Codex auth expired. Run: `! codex login`" — do NOT
silently fall back. After the user re-authenticates, retry.

**Run the review:**

```bash
codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null
```

The review prompt must include:
- The PR diff
- Coding standards from docs/coding-standards.md
- Review standards from docs/review-standards.md (if exists)
- Instruction to report only P0/P1 findings as JSON with severity, location (file:line), description, and suggestion

#### Channel 2: Gemini CLI

**Auth check first:**

```bash
GEMINI_AUTH_CHECK=$(NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1)
GEMINI_EXIT=$?
if [ "$GEMINI_EXIT" -eq 0 ]; then
  echo "gemini authenticated"
elif [ "$GEMINI_EXIT" -eq 41 ]; then
  echo "gemini NOT authenticated (exit 41: auth error)"
fi
```

If Gemini is not installed, skip this channel and note it in the summary.
If auth fails (exit 41), tell the user: "Gemini auth expired. Run: `! gemini -p \"hello\"`" — do NOT silently fall back. After the user re-authenticates, retry.

**Run the review:**

```bash
NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null
```

Same review prompt content as Codex. Do NOT share one model's output with the other —
each reviews independently.

#### Channel 3: Superpowers Code-Reviewer Subagent

Dispatch the `superpowers:code-reviewer` subagent. This channel always runs (it uses
Claude, which is always available).

```bash
BASE_SHA=$(gh pr view "$PR_NUMBER" --json baseRefOid -q .baseRefOid)
HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid -q .headRefOid)
```

Dispatch with the Agent tool using `superpowers:code-reviewer` as the subagent type,
providing:
- `WHAT_WAS_IMPLEMENTED` — PR title and description
- `PLAN_OR_REQUIREMENTS` — coding standards and review standards
- `BASE_SHA` — base commit
- `HEAD_SHA` — head commit
- `DESCRIPTION` — PR summary

### Step 4: Reconcile Findings

After all channels complete, reconcile findings:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| Multiple channels flag same issue | **High** | Fix immediately |
| All channels approve (no findings) | **High** | Proceed to merge |
| One channel flags P0, others approve | **High** | Fix it — P0 is critical from any source |
| One channel flags P1, others approve | **Medium** | Fix it — P1 findings are mandatory regardless of source count |
| Channels contradict each other | **Low** | Present to user for adjudication |

### Step 5: Report Results

Output a review summary in this format:

```
## Code Review Summary — PR #[number]

### Channels Executed
- [ ] Codex CLI — [completed / skipped (not installed) / skipped (auth failed) / error]
- [ ] Gemini CLI — [completed / skipped (not installed) / skipped (auth failed) / error]
- [ ] Superpowers code-reviewer — [completed / error]

### Consensus Findings (High Confidence)
[Findings flagged by 2+ channels]

### Single-Source Findings
[Findings from only one channel, with attribution]

### Disagreements
[Contradictions between channels]

### Verdict
[All channels approve / Fix required (list P0/P1 items) / User adjudication needed]
```

### Step 6: Fix P0/P1 Findings

If any P0 or P1 findings exist:
1. Fix them in the code
2. Push the fixes: `git push`
3. Re-run the channels that produced findings to verify fixes
4. After 3 fix rounds with unresolved P0/P1 findings, stop and ask the user for direction — do NOT merge automatically. Document remaining findings and let the user decide whether to continue fixing, create follow-up issues, or override.

### Step 7: Confirm Completion

After all findings are resolved (or 3 rounds complete), output:

```
Code review complete. All 3 channels executed. PR #[number] is ready for merge.
```

Do NOT proceed to the next task or merge until this confirmation is output.

## Fallback Behavior

| Situation | Action |
|-----------|--------|
| Neither Codex nor Gemini installed | Run Superpowers code-reviewer only; document as "single-channel review" |
| One CLI installed, one not | Run available CLI + Superpowers; document missing channel |
| CLI auth expired | Surface to user with recovery command; do NOT silently skip |
| Superpowers plugin not installed | Run both CLIs; warn user to install superpowers plugin |
| All external channels unavailable | Superpowers code-reviewer only; warn user that review coverage is reduced |

## Process Rules

1. **All three channels are mandatory** — skip only when the tool is genuinely unavailable (not installed), never by choice.
2. **Auth failures are not silent** — always surface to the user with recovery instructions.
3. **Independence** — never share one channel's output with another. Each reviews the diff independently.
4. **Fix before proceeding** — P0/P1 findings must be resolved before moving to the next task.
5. **Document everything** — the review summary must show which channels ran and which were skipped, with reasons.

---

## After This Step

When code review is complete, tell the user:

---
**Code review complete** — All channels executed for PR #[number].

**Results:**
- Channels run: [list which of the 3 ran]
- Findings fixed: [count]
- Remaining: [none / list]

**Next:** Return to the task execution loop — mark the task complete and pick up
the next unblocked task with `/scaffold:single-agent-start`.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
