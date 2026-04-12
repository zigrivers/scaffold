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
- P0/P1/P2 findings fixed before proceeding
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

**Foreground only:** Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output.

#### Channel 1: Codex CLI

**Installation check:**
```bash
command -v codex >/dev/null 2>&1
```
- If `codex` is not installed: queue a compensating Claude self-review pass focused on implementation correctness, security, and API contracts. Record root-cause `not_installed`. Skip to next channel.

**Auth check first** (auth tokens expire — always re-verify):

```bash
codex login status 2>/dev/null && echo "codex authenticated" || echo "codex NOT authenticated"
```

If auth fails, tell the user: "Codex auth expired. Run: `! codex login`" — do NOT
silently fall back. After the user re-authenticates, retry.

If auth cannot be recovered, queue a compensating pass (same focus as above). Record root-cause `auth_failed`.
If auth check times out (~5s), retry once. If still failing, record root-cause `auth_timeout` and queue compensating pass.

**Run the review:**

```bash
codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null
```

The review prompt must include:
- The PR diff
- Coding standards from docs/coding-standards.md
- Review standards from docs/review-standards.md (if exists)
- Instruction to report P0/P1/P2 findings as JSON with severity, location (file:line), description, and suggestion

If the CLI exits with a non-zero code, produces malformed/unparseable output, or is killed by the tool runner timeout, record root-cause `failed` and queue a compensating pass for that channel.

#### Channel 2: Gemini CLI

**Installation check:**
```bash
command -v gemini >/dev/null 2>&1
```
- If `gemini` is not installed: queue a compensating Claude self-review pass focused on architectural patterns, design reasoning, and broad context. Record root-cause `not_installed`. Label findings as `[compensating: Gemini-equivalent]`. Skip to next channel.

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

If auth fails (exit 41), tell the user: "Gemini auth expired. Run: `! gemini -p \"hello\"`" — do NOT silently fall back. After the user re-authenticates, retry.

If auth cannot be recovered, queue a compensating pass focused on architectural patterns, design reasoning, and broad context. Record root-cause `auth_failed`. Label findings as `[compensating: Gemini-equivalent]`.
If auth check times out (~5s), retry once. If still failing, record root-cause `auth_timeout` and queue compensating pass labeled `[compensating: Gemini-equivalent]`.

**Run the review:**

```bash
NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null
```

Same review prompt content as Codex. Do NOT share one model's output with the other —
each reviews independently.

If the CLI exits with a non-zero code, produces malformed/unparseable output, or is killed by the tool runner timeout, record root-cause `failed` and queue a compensating pass for that channel.

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

**After all channels:** Run any queued compensating passes as foreground Claude self-review passes. Each uses the same review prompt as the missing channel, focused on that channel's strength area. Label findings as `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]`.

### Step 4: Reconcile Findings

After all channels complete, reconcile findings:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| Multiple channels flag same issue | **High** | Fix immediately |
| All channels approve (no findings) | **High** | Proceed to merge |
| One channel flags P0, others approve | **High** | Fix it — P0 is critical from any source |
| One channel flags P1, others approve | **Medium** | Fix it — P1 findings are mandatory regardless of source count |
| Channels contradict each other | **Low** | Present to user for adjudication |
| Compensating-pass P0/P1/P2 finding | **Single-source** | Fix per normal thresholds, label as compensating |

### Step 5: Report Results

Output a review summary in this format:

```
## Code Review Summary — PR #[number]

### Channels Executed
- [ ] Codex CLI — root cause: [completed / not installed / auth failed / auth timeout / failed], coverage: [full / compensating (Codex-equivalent)]
- [ ] Gemini CLI — root cause: [completed / not installed / auth failed / auth timeout / failed], coverage: [full / compensating (Gemini-equivalent)]
- [ ] Superpowers code-reviewer — [completed / failed]

### Consensus Findings (High Confidence)
[Findings flagged by 2+ channels]

### Single-Source Findings
[Findings from only one channel, with attribution]

### Disagreements
[Contradictions between channels]

### Verdict
[pass / degraded-pass / blocked / needs-user-decision]
```

### Step 5a: Final Verdict

Return exactly one verdict:

- `pass` — all channels ran, no unresolved P0/P1/P2
- `degraded-pass` — channels skipped/compensated, no unresolved P0/P1/P2
- `blocked` — unresolved P0/P1/P2 after 3 fix rounds
- `needs-user-decision` — contradictions or unresolvable findings

Verdict precedence: `needs-user-decision` > `blocked` > `degraded-pass` > `pass`.

When compensating passes ran, maximum achievable verdict is `degraded-pass`. When both external channels were compensated, note "All findings are single-model."

### Step 6: Fix P0/P1/P2 Findings

If any P0, P1, or P2 findings exist:
1. Fix them in the code
2. Push the fixes: `git push`
3. Re-run the channels that produced findings to verify fixes
4. After 3 fix rounds with unresolved P0/P1/P2 findings, stop and ask the user for direction — do NOT merge automatically. Document remaining findings and let the user decide whether to continue fixing, create follow-up issues, or override.

**Fix cycle channel rule:** Re-run only channels that originally completed or ran as compensating passes. Never retry a channel marked `not installed`, `auth failed`, or `auth timeout` during fix rounds — its availability does not change within a session.

### Step 7: Confirm Completion

After all findings are resolved (or 3 rounds complete), output:

```
Code review complete. Verdict: [pass/degraded-pass]. Channels: [N] executed, [N] compensating. PR #[number] is ready for merge.
```

Do NOT proceed to the next task or merge until this confirmation is output.

## Fallback Behavior

| Situation | Action |
|-----------|--------|
| Channel not installed | Queue compensating pass, report root-cause `not_installed` |
| Auth expired, user recovers | Retry dispatch |
| Auth expired, user declines | Queue compensating pass, report root-cause `auth_failed` |
| Auth check timeout (after retry) | Queue compensating pass, report root-cause `auth_timeout` |
| Channel fails during execution | Queue compensating pass, report root-cause `failed` |
| Both external channels unavailable | Two compensating passes, max verdict: `degraded-pass`, note "All findings single-model" |
| Superpowers unavailable | Run available CLIs, warn user (Superpowers is always-available Claude — no compensating pass) |

## Process Rules

1. **Foreground only** — Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`.
2. **All three channels are mandatory** — skip only when a tool is genuinely not installed, never by choice.
3. **Auth failures are not silent** — always surface to the user with the exact recovery command.
4. **Independence** — never share one channel's output with another. Each reviews the diff independently.
5. **Fix before proceeding** — P0/P1/P2 findings must be resolved before moving to the next task.
6. **3-round limit** — never attempt more than 3 fix rounds. Surface unresolved findings to the user.
7. **Document everything** — the review summary must show which channels ran and which were skipped, with reasons.
8. **Dispatch pattern** follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-code.md` and `post-implementation-review.md`.

---

## After This Step

When code review is complete, tell the user:

---
**Code review complete** — Verdict: [pass/degraded-pass]. All channels executed for PR #[number].

**Results:**
- Channels run: [list which of the 3 ran, noting any compensating]
- Findings fixed: [count]
- Remaining: [none / list]

**Next:** Return to the task execution loop.

---
