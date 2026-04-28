---
name: review-pr
description: Run all configured code review channels on a PR (Codex CLI, Gemini CLI, Claude CLI)
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [multi-model-review-dispatch, automated-review-tooling]
argument-hint: "<PR# or blank> [--fix-threshold P0|P1|P2|P3]"
---

## Purpose

Run the three CLI review channels (Codex, Gemini, Claude) on a pull request
**plus** the Superpowers code-reviewer agent as a complementary 4th channel,
and reconcile all findings through MMR. This is the single entry point for
**PR-scoped** code review — agents call this once instead of remembering four
separate review invocations.

**For non-PR targets**, don't use this tool. Call `mmr review` directly with
the appropriate input mode, or use `scaffold run review-code` for local
pre-commit review:

- `mmr review --staged` — staged changes
- `mmr review --base <ref> --head <ref>` — branch diff
- `mmr review --diff <path.patch>` — existing diff/patch file
- `<git diff …> | mmr review --diff -` — any piped diff (including a single
  tracked file via `git diff HEAD -- <path>`, or a new file via
  `(diff -u /dev/null <path> || true)` — the `|| true` guard is required
  because `diff` exits 1 whenever files differ, which breaks pipelines
  under `set -o pipefail`)

The `--diff` flag expects diff-format content; it does not read raw document
content. The three-channel review itself is not PR-specific — this tool is
just the PR wrapper around the more general `mmr review` CLI.

The three channels are:
1. **Codex CLI** — OpenAI's code analysis (implementation correctness, security, API contracts)
2. **Gemini CLI** — Google's design reasoning (architectural patterns, broad context)
3. **Claude CLI** — Anthropic's code review (plan alignment, code quality, testing)

## Inputs

- $ARGUMENTS — PR number (optional; auto-detected from current branch if omitted) and/or `--fix-threshold P0|P1|P2|P3` to override the project's configured threshold for this run
- `.mmr.yaml` — MMR CLI configuration (channels, review_criteria, defaults)

The CLI handles review context via config (`review_criteria` in `.mmr.yaml`).
Project-specific standards (coding-standards, review-standards) are referenced
in the review criteria config rather than read at dispatch time.

## Expected Outputs

- All three CLI review channels executed (or fallback documented) plus the Superpowers code-reviewer 4th channel reconciled via `mmr reconcile`
- findings at or above the configured `fix_threshold` fixed before proceeding (read from `results.fix_threshold` in the verdict JSON; default `P2`)
- Review summary with per-channel results and reconciliation

## Instructions

### Step 1: Identify the PR

```bash
# Strip --fix-threshold from $ARGUMENTS if present; remainder is the PR number
FIX_THRESHOLD=""
ARGS_REMAINING="$ARGUMENTS"
if [[ "$ARGS_REMAINING" =~ (^|[[:space:]])--fix-threshold[[:space:]]+(P[0-3])($|[[:space:]]) ]]; then
  FIX_THRESHOLD="${BASH_REMATCH[2]}"
  ARGS_REMAINING="${ARGS_REMAINING//--fix-threshold ${FIX_THRESHOLD}/}"
fi

# Use remaining argument if provided, otherwise detect from current branch
PR_NUMBER="$(echo "$ARGS_REMAINING" | tr -d '[:space:]')"
PR_NUMBER="${PR_NUMBER:-$(gh pr view --json number -q .number 2>/dev/null)}"
```

If no PR is found, stop and tell the user to create a PR first.

### Step 2: Run MMR Review

Use the MMR CLI as the primary entry point for automated dispatch, reconciliation, and verdict:

```bash
MMR_FLAGS=(--pr "$PR_NUMBER" --sync --format json)
[ -n "$FIX_THRESHOLD" ] && MMR_FLAGS+=(--fix-threshold "$FIX_THRESHOLD")
MMR_RESULT=$(mmr review "${MMR_FLAGS[@]}")
# Extract job_id from JSON output for use in mmr reconcile
JOB_ID=$(echo "$MMR_RESULT" | grep -o '"job_id": "[^"]*"' | head -1 | cut -d'"' -f4)
```

The CLI handles:
- Installation and auth checks for each channel (codex, gemini, claude)
- Compensating passes when channels are unavailable (dispatched via `claude -p`)
- Output parsing and finding reconciliation
- Verdict derivation (pass/degraded-pass/blocked/needs-user-decision)
- Exit codes: 0=pass/degraded-pass, 2=blocked, 3=needs-user-decision

The CLI supports multiple input modes:
- `--pr <number>` — review a GitHub PR (fetches diff via `gh pr diff`)
- `--diff <file>` — review a diff file
- `--staged` — review staged changes (`git diff --cached`)
- `--base <ref> --head <ref>` — review diff between two refs

**Manual fallback** (when MMR CLI is not installed):

Run Codex, Gemini, and Claude CLI commands individually as foreground Bash calls.
Never use `run_in_background`, `&`, or `nohup`.

#### Channel 1: Codex CLI

```bash
command -v codex >/dev/null 2>&1 || echo "Codex not installed"
codex login status 2>/dev/null
codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null
```

If not installed or auth fails, queue a compensating pass focused on implementation
correctness, security, and API contracts. Auth failure recovery: `! codex login`.

#### Channel 2: Gemini CLI

```bash
command -v gemini >/dev/null 2>&1 || echo "Gemini not installed"
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null
```

If not installed or auth fails, queue a compensating pass focused on architectural
patterns, design reasoning, and broad context. Auth failure recovery: `! gemini -p "hello"`.

#### Channel 3: Claude CLI

```bash
claude -p "REVIEW_PROMPT" --output-format json 2>/dev/null
```

Claude CLI handles its own auth. Focus: plan alignment, code quality, testing.

**After all channels:** Run any queued compensating passes as additional `claude -p`
dispatches with focused prompts. Label findings as `[compensating: Codex-equivalent]`
or `[compensating: Gemini-equivalent]`.

### Step 3: Run Agent Code Review (4th channel)

Dispatch your platform's code-reviewer skill for a complementary review:
- **Claude Code:** dispatch `superpowers:code-reviewer` subagent with the PR diff and review criteria
- **Other platforms:** use your platform's equivalent agent review skill

The agent skill runs inside your agent's context — it has access to conversation history, project knowledge, and plan context that external CLIs lack.

**Important:** The agent's review output must use MMR-compatible finding schema: each finding needs `severity` (P0-P3), `location` (file:line), and `description` (`suggestion` is optional). The strict validator in `mmr reconcile` will reject findings with missing or invalid required fields.

### Step 4: Inject Agent Review into MMR

Feed the agent review findings into MMR for unified reconciliation:

```bash
# job_id is captured from mmr review --sync --format json output
# Write agent findings to a temp file for mmr reconcile
echo "$AGENT_FINDINGS" > /tmp/agent-findings.json
mmr reconcile "$JOB_ID" --channel superpowers --input /tmp/agent-findings.json
```

The `reconcile` command:
- Adds the agent's findings as a new channel in the job
- Re-runs reconciliation across ALL channels (CLI + agent)
- Outputs the unified verdict with all sources included

### Step 5: Reconcile Findings

When using `mmr review --sync`, reconciliation is automatic. For manual fallback,
reconcile findings after all channels complete:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| Multiple channels flag same issue | **High** | Fix immediately |
| All channels approve (no findings) | **High** | Proceed to merge |
| One channel flags P0, others approve | **High** | Fix it — P0 is critical from any source |
| One channel flags P1, others approve | **Medium** | Fix it — P1 findings are mandatory regardless of source count |
| Channels contradict each other | **Low** | Present to user for adjudication |
| Compensating-pass blocking finding | **Single-source** | Fix per normal thresholds, label as compensating |

### Step 6: Report Results

Output a review summary in this format:

```
## Code Review Summary — PR #[number]

### Channels Executed
- [ ] Codex CLI — root cause: [completed / not installed / auth failed / timeout / failed], coverage: [full / compensating (Codex-equivalent)]
- [ ] Gemini CLI — root cause: [completed / not installed / auth failed / timeout / failed], coverage: [full / compensating (Gemini-equivalent)]
- [ ] Claude CLI — root cause: [completed / not_installed / auth_failed / timeout / failed], coverage: [full / none (Claude is never compensated — it IS the compensator for Codex/Gemini)]
- [ ] Agent review — [completed / skipped], injected via mmr reconcile

### Consensus Findings (High Confidence)
[Findings flagged by 2+ channels]

### Single-Source Findings
[Findings from only one channel, with attribution]

### Disagreements
[Contradictions between channels]

### Verdict
[pass / degraded-pass / blocked / needs-user-decision]
```

### Step 6a: Final Verdict

Return exactly one verdict:

- `pass` — all channels completed and the gate passed (no unresolved findings at or above the configured fix threshold; the threshold defaults to `P2` but is configurable via `.mmr.yaml` or `--fix-threshold`)
- `degraded-pass` — gate passed but some channels were skipped or replaced by compensating passes (max achievable verdict when any channel was compensated)
- `blocked` — gate failed: at least one unresolved finding sits at or above the fix threshold (typically the *same* finding(s) remain unresolved after 3 fix attempts)
- `needs-user-decision` — no channels completed (no reconciled result was possible), reviewer disagreement / contradictions, or a finding requires human judgment that automated iteration can't resolve

Verdict precedence: `needs-user-decision` > `blocked` > `degraded-pass` > `pass`.

When compensating passes ran, maximum achievable verdict is `degraded-pass`. When both external channels were compensated, note "All findings are single-model."

### Step 7: Fix Blocking Findings

If any findings sit at or above `fix_threshold` (the verdict JSON's `fix_threshold` field; default `P2`):
1. Fix them in the code
2. Push the fixes: `git push`
3. Re-run the review to verify fixes: `mmr review --pr "$PR_NUMBER" --sync --format json`
4. The 3-round limit is **per finding**, not total rounds:
   - **Keep going** when each new round surfaces *different, concrete, fixable* findings — that is healthy review/fix iteration.
   - **Stop and ask the user** when (a) the *same* blocking finding (or set) recurs across 3 attempts without progress, (b) a finding is genuinely ambiguous (channels contradict each other), or (c) the user explicitly asks to stop.
   - **When stopped**, do NOT merge automatically. Document the unresolved findings (severity, location, attempt count) and let the user decide whether to continue fixing, create follow-up issues, or override.

**Note:** Fix cycles are an orchestration concern — the caller (agent or human) handles the fix loop. The CLI provides the review and verdict; the caller decides whether to fix and re-run.

**Fix cycle channel rule:** Re-run only channels that originally completed or ran as compensating passes. Never retry a channel marked `not_installed`, `auth_failed`, or `timeout` during fix rounds — its availability does not change within a session.

### Step 8: Confirm Completion

**Success path** — all findings resolved (verdict is `pass` or `degraded-pass`):

```
Code review complete. Verdict: [pass/degraded-pass]. Channels: [N] executed, [N] compensating. PR #[number] is ready for merge.
```

**Stop path** — a per-finding stop condition from Step 7 was hit (verdict is `blocked` or `needs-user-decision`). Do NOT use the ready-for-merge message and do NOT merge. Instead, hand off to the user:

```
Code review halted. Verdict: [blocked/needs-user-decision]. PR #[number] is NOT ready for merge.
Unresolved findings:
- [severity] [location] — [description] (rounds attempted: [N])
- ...
Reason for stop: [same finding recurred 3× / channels contradict each other / user requested stop]
```

In either path, output the message and stop. Do NOT proceed to the next task without this confirmation.

## Fallback Behavior

| Situation | Action |
|-----------|--------|
| Channel not installed | Queue compensating pass, report root-cause `not_installed` |
| Auth expired, user recovers | Retry dispatch |
| Auth expired, user declines | Queue compensating pass, report root-cause `auth_failed` |
| Auth check timeout (after retry) | Queue compensating pass, report root-cause `timeout` |
| Channel fails during execution | Queue compensating pass, report root-cause `failed` |
| Both external channels unavailable | Two compensating passes, max verdict: `degraded-pass`, note "All findings single-model" |

## Process Rules

1. **Foreground only** — Always run Codex, Gemini, and Claude CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`.
2. **All three CLI channels are mandatory** — Codex CLI, Gemini CLI, and Claude CLI. Plus the Superpowers code-reviewer agent as a complementary 4th channel reconciled via `mmr reconcile` (Step 3). Skip a CLI channel only when a tool is genuinely not installed or auth cannot be recovered (in which case MMR emits a compensating pass for missing Codex/Gemini channels; a missing Claude CLI has no compensator). Never skip by choice.
3. **Auth failures are not silent** — always surface to the user with the exact recovery command.
4. **Independence** — never share one channel's output with another. Each reviews the diff independently.
5. **Fix before proceeding** — findings at or above `fix_threshold` must be resolved before moving to the next task.
6. **3-round limit (per finding)** — never attempt to fix the *same* blocking finding more than 3 times. Each round that surfaces a *new* fixable finding is healthy iteration — keep going. Stop only when the same finding recurs across 3 attempts, channels contradict each other, or the user asks to stop.
7. **Document everything** — the review summary must show which channels ran and which were skipped, with reasons.
8. **CLI-first** — use `mmr review --sync` as the primary entry point. Manual dispatch is a fallback only.
9. **Job storage** — the CLI stores job data at `~/.mmr/jobs/{job-id}/results.json`. Review results are available via `mmr results <job-id>`.
10. **Dispatch pattern** follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-code.md` and `post-implementation-review.md`.

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
