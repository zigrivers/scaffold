---
name: multi-model-dispatch
description: Correct patterns for invoking Codex CLI and Antigravity CLI (`agy`) as independent reviewers from Claude Code. Covers headless invocation, context bundling, output parsing, dual-model reconciliation, and fallback handling.
---

# Multi-Model Dispatch

This skill teaches Claude Code how to correctly invoke Codex and Antigravity CLIs for independent review of artifacts. Use this whenever a pipeline step needs multi-model validation at depth 4-5.

## When This Skill Activates

- A review or validation step is running at depth 4+ and wants independent model validation
- User asks to "run multi-model review" or "get a second opinion from Codex/Antigravity"
- The `automated-pr-review` step is using local CLI review mode
- The `implementation-plan-review` step dispatches to external CLIs at depth 4+

## CLI Detection & Auth Verification

Before attempting any dispatch, detect what's available AND verify authentication. A CLI that's installed but not authenticated is useless in headless mode — it will hang on an interactive auth prompt or fail silently.

### Step 1: Check CLI Installation

```bash
command -v codex && echo "codex installed" || echo "codex not found"
command -v agy && echo "agy installed" || echo "agy not found"
```

### Step 2: Verify Authentication

**CRITICAL: Do not skip this step.** Auth tokens expire mid-session. A CLI that worked 30 minutes ago may fail now.

**CRITICAL: Previous auth failures do NOT exempt subsequent dispatches.** Auth tokens refresh — a CLI that failed auth during user story review may work fine for domain modeling review. Always re-check auth before EACH review step, not once per session.

**Codex auth check** (has a built-in status command):
```bash
codex login status 2>/dev/null && echo "codex authenticated" || echo "codex NOT authenticated"
```

**Antigravity auth check** (detect auth-failure sentinel text):
```bash
AGY_AUTH_CHECK=$(agy -p "respond with ok" --print-timeout 12s 2>&1)
if echo "$AGY_AUTH_CHECK" | grep -qiE "authentication required|authentication timed out"; then
  echo "agy NOT authenticated (auth error)"
else
  echo "agy authenticated"
fi
```

Antigravity's `agy -p "hello"` recovery command prints a Google OAuth URL when credentials need refreshing.

### Step 3: Handle Auth Failures

**If a CLI fails auth, do NOT silently fall back.** Instead:

1. **Tell the user** which CLI failed auth and why
2. **Offer interactive recovery**: Ask the user to run the auth command in their terminal:
   - **Codex**: `! codex login` (opens browser for OAuth) or set `CODEX_API_KEY` env var
   - **Antigravity**: `! agy -p "hello"` (triggers OAuth flow)
3. **After recovery**: Re-run the auth check. If it passes, proceed with dispatch.
4. **If user declines**: Fall back to the other CLI or Claude-only review, but **document the auth failure** in the review summary.

The `!` prefix runs the command in the user's terminal session, allowing interactive auth flows (browser OAuth, Y/n prompts) that can't work in headless mode.

**If neither CLI is available or authenticated**: Queue a compensating Claude pass focused on the failed channel's strength area. Document this as "single-model review (no external CLIs available)."

## Correct Invocation Patterns

### Codex CLI (`codex exec`)

**CRITICAL: Use `codex exec`, NOT `codex` directly.** The bare `codex` command launches an interactive TUI that requires a TTY and will fail with "stdin is not a terminal" when run from Claude Code.

**CRITICAL: Always include `--skip-git-repo-check`.** Without this flag, Codex fails with "Not inside a trusted directory" when the project hasn't initialized git yet (common early in the pipeline).

```bash
# Basic review dispatch
codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT_HERE" 2>/dev/null

# With specific model and reasoning effort
codex exec --skip-git-repo-check -m o4-mini -s read-only -c model_reasoning_effort=high --ephemeral "REVIEW_PROMPT_HERE" 2>/dev/null

# Reading prompt from stdin (use - flag)
echo "$REVIEW_PROMPT" | codex exec --skip-git-repo-check -s read-only --ephemeral - 2>/dev/null

# With JSON schema enforcement
codex exec --skip-git-repo-check -s read-only --ephemeral --output-schema schema.json "REVIEW_PROMPT_HERE" 2>/dev/null
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `exec` | **Required** — headless mode, no TUI, no TTY needed |
| `--skip-git-repo-check` | **Required** — allows running outside a git repo or untrusted directory |
| `-s read-only` | Sandbox: reviewer cannot write files (read-only analysis) |
| `--ephemeral` | Don't persist session (one-shot review) |
| `2>/dev/null` | Suppress thinking tokens on stderr (keeps Claude Code context clean) |
| `--output-schema` | Enforce structured JSON output against a schema file |
| `-c model_reasoning_effort=high` | Increase reasoning depth for complex reviews |

**Output**: Progress streams to stderr (suppressed by `2>/dev/null`). Final answer prints to stdout.

### Antigravity CLI (`agy`)

**Use `--print` for headless review dispatch.** Antigravity reads the prompt from
stdin in print mode and writes the model reply to stdout.

```bash
# Basic review dispatch
printf '%s' "REVIEW_PROMPT_HERE" | agy --print --sandbox --dangerously-skip-permissions --print-timeout 300s 2>/dev/null

# Reading prompt from a file
agy --print --sandbox --dangerously-skip-permissions --print-timeout 300s < prompt.txt 2>/dev/null
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `--print` | **Required** — headless mode, no interactive UI |
| `--sandbox` | OS sandbox for reviewer execution |
| `--dangerously-skip-permissions` | Auto-approve so review runs do not hang |
| `--print-timeout 300s` | Bounds a hung reviewer run |
| `2>/dev/null` | Suppress progress output |

**Output**: Plain model response on stdout; the review prompt should require JSON findings and downstream parsers handle the reply.

## Foreground-Only Execution

Always run Codex and Antigravity CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty or truncated output from both CLIs. Multiple foreground calls in a single message are fine — the tool runner supports parallel invocations.

This means: when dispatching reviews, make each CLI call a separate foreground Bash tool invocation. Do NOT use shell `&` or background subshells.

## Context Bundling

When dispatching a review, bundle all relevant context into the prompt. Each CLI gets the same bundle — do NOT share one model's review with the other.

### Template for Artifact Review

```
You are reviewing a project artifact for quality issues. Report all P0, P1, P2, and P3 findings; the project's fix threshold is applied downstream.

## Severity Definitions
- P0: Will cause implementation failure, data loss, security vulnerability, or fundamental architectural flaw
- P1: Will cause bugs in normal usage, inconsistency across documents, or blocks downstream work
- P2: Improvement opportunity — style, naming, documentation, minor optimization
- P3: Personal preference, trivial nits — included so a strict project (`fix_threshold: P3`) can act on them; otherwise advisory

## Review Standards
[paste contents of docs/review-standards.md if it exists, otherwise use severity definitions above]

## Artifact to Review
[paste full artifact content]

## Upstream References
[paste relevant upstream docs: PRD, tech-stack, coding-standards, etc.]

## Output Format
Respond with a JSON object:
{
  "approved": true/false,
  "findings": [
    {
      "severity": "P0" or "P1" or "P2" or "P3",
      "location": "section or line reference",
      "description": "what's wrong",
      "suggestion": "specific fix"
    }
  ],
  "summary": "one-line assessment"
}

If no findings, respond with: { "approved": true, "findings": [], "summary": "No issues found." }
```

### Template for PR Diff Review

```
You are reviewing a pull request diff. Report all P0, P1, P2, and P3 findings; the project's fix threshold is applied downstream.

## Review Standards
[paste docs/review-standards.md]

## Project Coding Standards
[paste docs/coding-standards.md]

## Test Standards
[paste docs/tdd-standards.md]

## PR Diff
[paste output of gh pr diff <number> or git diff origin/main...HEAD]

## Output Format
[same JSON format as above, but location = file:line]
```

### Context Size Guidelines

| Artifact Type | Max Context | Strategy |
|--------------|------------|----------|
| PRD | Full document | Include entirely |
| User stories | Full document | Include entirely |
| Architecture | Full document | Include entirely |
| Domain models | Directory listing + key files | Summarize index, include 2-3 representative files |
| PR diff | Full diff | If >2000 lines, split into file groups |
| Implementation plan | Task list + representative tasks | Include full task list, detail for flagged tasks |

## Finding Reconciliation

When multiple models produce findings, reconcile them using the rules defined in `multi-model-review-dispatch`. Key principles:

- **Independence rule**: Never share one model's review output with the other. Each model must review the artifact independently to avoid confirmation bias.
- **Round tracking**: For iterative reviews (like PR review loops), track the round number. After 3 fix rounds with unresolved findings, stop and surface the verdict (`blocked` or `needs-user-decision`) to the user. Do NOT auto-merge.

For the full consensus rules, confidence scoring, and disagreement resolution process, see `multi-model-review-dispatch`.

## Fallback Behavior

| Situation | Fallback |
|-----------|----------|
| Neither CLI available | Queue two compensating Claude passes (one per missing channel's strength area). Label findings. Max verdict: `degraded-pass`. |
| Codex only | Single-model review with Codex + compensating Claude pass for Antigravity |
| Antigravity only | Single-model review with Antigravity + compensating Claude pass for Codex |
| **CLI auth expired** | **Surface to user with `!` recovery command — do NOT silently fall back** |
| One CLI fails mid-review | Use partial results if available, else queue compensating pass. Note failure in summary. |
| Both CLIs fail | Two compensating passes, max verdict: `degraded-pass`. Warn user. |

Auth failures are NOT silent fallbacks.

## Integration with Review Steps

All review steps can reference this skill at depth 4-5. The pattern is:

1. **Depth 1-3**: Claude-only multi-pass review (step's existing logic)
2. **Depth 4**: Claude review + single external CLI review (if available)
3. **Depth 5**: Claude review + dual-model CLI review with reconciliation

Each review step adds a "Multi-Model Validation" section at the end that:
1. Detects available CLIs
2. Bundles the artifact + upstream references into a review prompt
3. Dispatches to available CLIs using the patterns above
4. Reconciles findings using the dual-model rules
5. Applies fixes for high-confidence findings
6. Presents medium/low-confidence findings to the user

## Error Handling

```bash
# Capture exit code AND stderr separately (don't suppress stderr for error detection)
CODEX_STDERR=$(mktemp)
OUTPUT=$(codex exec --skip-git-repo-check -s read-only --ephemeral "prompt" 2>"$CODEX_STDERR") || {
  EXIT_CODE=$?
  STDERR_CONTENT=$(cat "$CODEX_STDERR")
  if echo "$STDERR_CONTENT" | grep -qi "refresh token\|please re-run.*login\|sign in again\|auth"; then
    echo "Codex auth expired. Ask user to run: ! codex login"
    # DO NOT silently fall back — surface to user
  else
    echo "Codex CLI failed with exit code $EXIT_CODE"
    # Fall back to Antigravity or Claude-only
  fi
  rm -f "$CODEX_STDERR"
}

AGY_STDERR=$(mktemp)
OUTPUT=$(printf '%s' "prompt" | agy --print --sandbox --dangerously-skip-permissions --print-timeout 300s 2>"$AGY_STDERR") || {
  EXIT_CODE=$?
  STDERR_CONTENT=$(cat "$AGY_STDERR")
  if echo "$STDERR_CONTENT" | grep -qiE "authentication required|authentication timed out"; then
    echo "Antigravity auth failed. Ask user to run: ! agy -p \"hello\""
    # DO NOT silently fall back — surface to user
  else
    echo "Antigravity CLI failed with exit code $EXIT_CODE"
    # Fall back to Codex or Claude-only
  fi
  rm -f "$AGY_STDERR"
}
```

### Exit Codes

**Antigravity auth failures:**

`agy` may print an auth-failure message instead of returning a distinct exit code.
Treat output containing `authentication required` or `authentication timed out` as
auth failure and offer `! agy -p "hello"` recovery.

**Codex exit codes:**

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Parse output |
| 1 | General failure | Check stderr for auth messages |

Codex uses exit code 1 for all failures. **Check stderr** for auth-specific messages: "refresh token", "please re-run", "sign in again", "ChatGPT account ID not available".

### Auth Recovery Flow

When an auth failure is detected during dispatch (not during pre-flight):

1. Stop the review dispatch immediately
2. Tell the user: "Antigravity/Codex auth has expired. To re-authenticate, run:"
3. Suggest: `! codex login` or `! agy -p "hello"` (the `!` prefix runs it interactively)
4. After the user re-authenticates, re-run the auth check
5. If auth succeeds, resume the review dispatch from where it stopped
6. If the user declines, fall back to the other CLI or Claude-only review

## What This Skill Does NOT Do

- Does not install CLIs (user must install `codex` and `agy` separately)
- Does not authenticate CLIs — but it **detects auth failures** and guides the user through interactive recovery via `!` prefix commands
- Does not replace Claude's own review passes — it adds independent validation on top
- Does not work as an MCP server — it uses Bash tool invocations directly
