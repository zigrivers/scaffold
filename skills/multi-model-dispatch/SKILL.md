---
name: multi-model-dispatch
description: Correct patterns for invoking Codex CLI and Gemini CLI as independent reviewers from Claude Code. Covers headless invocation, context bundling, output parsing, dual-model reconciliation, and fallback handling.
---

# Multi-Model Dispatch

This skill teaches Claude Code how to correctly invoke Codex and Gemini CLIs for independent review of artifacts. Use this whenever a pipeline step needs multi-model validation at depth 4-5.

## When This Skill Activates

- A review or validation step is running at depth 4+ and wants independent model validation
- User asks to "run multi-model review" or "get a second opinion from Codex/Gemini"
- The `automated-pr-review` step is using local CLI review mode
- The `multi-model-review-tasks` step dispatches to external CLIs

## CLI Detection

Before attempting any dispatch, detect what's available:

```bash
command -v codex && echo "codex available" || echo "codex not found"
command -v gemini && echo "gemini available" || echo "gemini not found"
```

**If neither is available**: Fall back to structured Claude-only self-review. Re-read the artifact with an adversarial lens — actively try to find issues the initial review missed. Document this as "single-model review (no external CLIs available)."

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

### Gemini CLI (`gemini -p`)

**Use `-p` / `--prompt` for headless mode.** Without this flag, Gemini launches interactive mode.

```bash
# Basic review dispatch
gemini -p "REVIEW_PROMPT_HERE" --output-format json --approval-mode yolo 2>/dev/null

# With specific model
gemini -p "REVIEW_PROMPT_HERE" -m pro --output-format json --approval-mode yolo 2>/dev/null

# Reading context from stdin
cat artifact.md | gemini -p "Review this artifact for issues" --output-format json --approval-mode yolo 2>/dev/null

# With sandbox (no file writes)
gemini -p "REVIEW_PROMPT_HERE" --output-format json -s --approval-mode yolo 2>/dev/null
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `-p "prompt"` | **Required** — headless mode, no interactive UI |
| `--output-format json` | Structured JSON output for parsing |
| `--approval-mode yolo` | Auto-approve all tool calls (reviewer doesn't need to write) |
| `-s` | Sandbox mode (extra safety for read-only review) |
| `-m pro` | Use Gemini Pro model (default is auto) |
| `2>/dev/null` | Suppress progress output |

**Output**: JSON on stdout with `{ response, stats, error }` structure.

## Context Bundling

When dispatching a review, bundle all relevant context into the prompt. Each CLI gets the same bundle — do NOT share one model's review with the other.

### Template for Artifact Review

```
You are reviewing a project artifact for quality issues. Focus on P0 (critical) and P1 (high) issues only.

## Severity Definitions
- P0: Will cause implementation failure, data loss, security vulnerability, or fundamental architectural flaw
- P1: Will cause bugs in normal usage, inconsistency across documents, or blocks downstream work
- Do NOT report P2/P3 issues (suggestions, style, minor improvements)

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
      "severity": "P0" or "P1",
      "location": "section or line reference",
      "description": "what's wrong",
      "suggestion": "specific fix"
    }
  ],
  "summary": "one-line assessment"
}

If no P0/P1 issues found, respond with: { "approved": true, "findings": [], "summary": "No P0/P1 issues found." }
```

### Template for PR Diff Review

```
You are reviewing a pull request diff. Focus on P0 and P1 issues only.

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

## Dual-Model Reconciliation

When both CLIs produce results, reconcile findings using these rules:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| Both flag same issue | **High** | Fix immediately — two independent models agree |
| Both approve (no findings) | **High** | Proceed confidently |
| One flags P0, other approves | **High** | Fix it — P0 is critical enough from a single source |
| One flags P1, other approves | **Medium** | Review the finding carefully before fixing. If the finding is specific and actionable, fix it. If vague, skip. |
| Models contradict each other | **Low** | Present both findings to the user for adjudication |

**Independence rule**: Never share one model's review output with the other. Each model must review the artifact independently to avoid confirmation bias.

**Round tracking**: For iterative reviews (like PR review loops), track the round number. After 3 fix rounds, merge with a warning and create a follow-up issue for remaining findings.

## Fallback Behavior

| Situation | Fallback |
|-----------|----------|
| Neither CLI available | Structured Claude-only adversarial self-review |
| Codex only | Single-model review with Codex |
| Gemini only | Single-model review with Gemini |
| One CLI fails mid-review | Continue with the other; note the failure in summary |
| Both CLIs fail | Fall back to Claude-only self-review; warn user |
| CLI output not parseable as JSON | Treat as text, extract findings manually |

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
# Capture exit code and output separately
OUTPUT=$(codex exec --skip-git-repo-check -s read-only --ephemeral "prompt" 2>/dev/null) || {
  echo "Codex CLI failed with exit code $?"
  # Fall back to Gemini or Claude-only
}

OUTPUT=$(gemini -p "prompt" --output-format json --approval-mode yolo 2>/dev/null) || {
  echo "Gemini CLI failed with exit code $?"
  # Fall back to Codex or Claude-only
}
```

**Gemini exit codes**: 0 = success, 1 = general error, 42 = input error, 53 = turn limit exceeded.

## What This Skill Does NOT Do

- Does not install CLIs (user must install `codex` and `gemini` separately)
- Does not handle authentication (user must authenticate each CLI independently)
- Does not replace Claude's own review passes — it adds independent validation on top
- Does not work as an MCP server — it uses Bash tool invocations directly
