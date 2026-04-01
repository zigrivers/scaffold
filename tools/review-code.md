---
name: review-code
description: Run all configured code review channels on local code before commit or push
summary: "Review the current local delivery candidate with Codex CLI, Gemini CLI, and Superpowers before committing or pushing, using staged changes, an explicit ref range, or the current branch diff."
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [multi-model-review-dispatch, automated-review-tooling]
argument-hint: "[--base <ref>] [--head <ref>] [--staged] [--report-only]"
---

## Purpose

Run the same three-channel review stack used by `review-pr`, but on local code
before commit or push. This is the preflight review entry point for bug fixes,
small features, and quick tasks when the user wants multi-model review before
anything leaves the machine.

The three channels are:
1. **Codex CLI** — implementation correctness, security, API contracts
2. **Gemini CLI** — architectural patterns, broad-context reasoning
3. **Superpowers code-reviewer** — Claude subagent review of code quality, tests, and plan alignment

## Inputs

- `$ARGUMENTS` (optional) — review scope flags:
  - `--base <ref>` — explicit base ref for diff review
  - `--head <ref>` — explicit head ref for diff review
  - `--staged` — review only staged changes (`git diff --cached`)
  - `--report-only` — collect findings and verdict, but do not apply fixes
- `docs/coding-standards.md` (required) — coding conventions for review context
- `docs/tdd-standards.md` (optional) — test expectations
- `docs/review-standards.md` (optional) — severity definitions and review criteria
- `AGENTS.md` (optional) — project-specific reviewer rules
- Local git state — staged diff, unstaged diff, branch diff, and changed file contents

## Expected Outputs

- A three-channel review summary for the local delivery candidate
- One of these verdicts: `pass`, `degraded-pass`, `blocked`, `needs-user-decision`
- Fixed code when findings are resolved in normal mode

## Instructions

### Step 1: Detect Mode

Parse `$ARGUMENTS` and set:

- `REPORT_ONLY=true` if `$ARGUMENTS` contains `--report-only`
- `STAGED_ONLY=true` if `$ARGUMENTS` contains `--staged`
- `BASE_REF` from `--base <ref>` if present
- `HEAD_REF` from `--head <ref>` if present

If `--head` is provided without `--base`, stop and tell the user both refs are
required for explicit-range review.

### Step 2: Build the Review Scope

Determine the delivery candidate to review.

#### Mode A: Explicit ref range

If both `BASE_REF` and `HEAD_REF` are provided:

```bash
git rev-parse --verify "$BASE_REF"
git rev-parse --verify "$HEAD_REF"
REVIEW_DIFF=$(git diff "$BASE_REF...$HEAD_REF")
CHANGED_FILES=$(git diff --name-only "$BASE_REF...$HEAD_REF")
```

Set the scope label to:

```text
ref-range: BASE_REF...HEAD_REF
```

If the diff is empty, stop and tell the user there is nothing to review in that range.

#### Mode B: Staged-only review

If `--staged` is provided:

```bash
REVIEW_DIFF=$(git diff --cached)
CHANGED_FILES=$(git diff --cached --name-only)
```

Set the scope label to:

```text
staged changes
```

If the staged diff is empty, stop and tell the user there are no staged changes.

#### Mode C: Default local delivery candidate

If no scope flags are provided, review everything that would be part of the next
delivery candidate:

1. Determine a reasonable base for committed work:
   - Prefer `origin/main` if it exists
   - Otherwise prefer `main`
   - Otherwise use `HEAD~1` if it exists
   - Otherwise treat this as a working-tree-only review
2. Collect these diff segments:
   - **Committed branch diff** from the base ref to `HEAD` (if a base ref exists and differs)
   - **Staged diff** from `git diff --cached`
   - **Unstaged diff** from `git diff`
3. Concatenate all non-empty segments into one review bundle with labels:

```text
=== COMMITTED DIFF (BASE...HEAD) ===
[diff]

=== STAGED DIFF ===
[diff]

=== UNSTAGED DIFF ===
[diff]
```

4. Build `CHANGED_FILES` as the union of file names from all non-empty segments

If all three segments are empty, stop and tell the user there is nothing to review.

### Step 3: Gather Review Context

Read these files if they exist:
- `docs/coding-standards.md`
- `docs/tdd-standards.md`
- `docs/review-standards.md`
- `AGENTS.md`

Then read the full contents of changed files from `CHANGED_FILES`, excluding:
- `node_modules/`
- `.git/`
- build artifacts (`dist/`, `build/`, `coverage/`, `.next/`)

If more than 15 files changed, prioritize:
1. Production files directly modified
2. New files
3. Test files covering the change
4. Config files affecting behavior or quality gates

Format the changed-file context like:

```text
=== relative/path/to/file.ts ===
[full file contents]
```

### Step 4: Run All Three Review Channels

Each channel reviews independently. Do NOT share one channel's output with another.

#### Channel 1: Codex CLI

Check installation and auth:

```bash
command -v codex >/dev/null 2>&1
codex login status 2>/dev/null
```

- If `codex` is not installed: skip this channel and record `skipped (not installed)`
- If auth fails: tell the user to run `! codex login`, retry after recovery, and if recovery is not possible, record `skipped (auth failed)` and continue with the remaining channels

Build the prompt in a temporary file and pass it over stdin:

```bash
PROMPT_FILE=$(mktemp)
# ...write the full review prompt to "$PROMPT_FILE"...
codex exec --skip-git-repo-check -s read-only --ephemeral - < "$PROMPT_FILE" 2>/dev/null
```

#### Channel 2: Gemini CLI

Check installation and auth:

```bash
command -v gemini >/dev/null 2>&1
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
```

- If `gemini` is not installed: skip this channel and record `skipped (not installed)`
- If auth fails (including exit 41): tell the user to run `! gemini -p "hello"`, retry after recovery, and if recovery is not possible, record `skipped (auth failed)` and continue with the remaining channels

Build the prompt in a temporary file and pass it as a single prompt string:

```bash
PROMPT_FILE=$(mktemp)
# ...write the full review prompt to "$PROMPT_FILE"...
NO_BROWSER=true gemini -p "$(cat "$PROMPT_FILE")" --output-format json --approval-mode yolo 2>/dev/null
```

#### Channel 3: Superpowers code-reviewer

Dispatch the `superpowers:code-reviewer` subagent.

- If explicit refs are being reviewed, provide `BASE_SHA` and `HEAD_SHA`
- Otherwise provide:
  - the scope label
  - the unified review diff bundle
  - the changed-file contents
  - project review standards

This channel must review the same local delivery candidate, even when no PR or
clean ref range exists.

### Step 5: Use This Review Prompt

All channels should receive an equivalent prompt bundle built from the local review scope:

```text
You are reviewing local code changes before commit or push. Report only P0, P1,
and P2 issues.

## Scope
[scope label]

## Review Standards
[docs/review-standards.md if present, otherwise define P0/P1/P2]

## Coding Standards
[docs/coding-standards.md]

## Test Standards
[docs/tdd-standards.md if present]

## Project Review Rules
[AGENTS.md excerpts if present]

## Delivery Candidate Diff
[review diff bundle]

## Changed File Contents
[changed file contents]

## Output Format
Respond with JSON:
{
  "approved": true/false,
  "findings": [
    {
      "severity": "P0" | "P1" | "P2",
      "location": "file:line or section",
      "description": "what is wrong",
      "suggestion": "specific fix"
    }
  ],
  "summary": "one-line assessment"
}
```

### Step 6: Reconcile Findings

Use these rules:

| Scenario | Action |
|----------|--------|
| Same issue flagged by 2+ channels | High confidence — fix immediately |
| Any single P0 | Fix immediately |
| Any single P1 | Fix immediately |
| Any single P2 | Fix unless clearly inapplicable; if disputed, surface to user |
| All executed channels approve | Candidate passes review |
| Strong contradiction on a medium-severity issue | Verdict becomes `needs-user-decision` |

### Step 7: Apply Fixes Unless in Report-Only Mode

If `REPORT_ONLY=true`:
- Do NOT edit code
- Output the review summary and final verdict
- Stop

Otherwise:
1. Fix all P0/P1/P2 findings
2. Re-run the channels that produced findings
3. Repeat for up to 3 fix rounds
4. If any finding remains unresolved after 3 rounds, stop with verdict `needs-user-decision`

### Step 8: Final Verdict

Return exactly one verdict:

- `pass` — all available channels ran and no unresolved P0/P1/P2 findings remain
- `degraded-pass` — at least one channel was skipped because the tool is not installed or auth could not be recovered, but all executed channels passed
- `blocked` — reviewer execution failure or unresolved mandatory findings
- `needs-user-decision` — reviewer disagreement or findings still unresolved after 3 fix rounds

### Step 9: Report Results

Output a concise summary in this format:

```text
## Code Review Summary — Local Delivery Candidate

### Scope
[scope label]

### Channels Executed
- Codex CLI — [completed / skipped (not installed) / skipped (auth failed) / error]
- Gemini CLI — [completed / skipped (not installed) / skipped (auth failed) / error]
- Superpowers code-reviewer — [completed / error]

### Findings
[consensus findings first, then single-source findings]

### Verdict
[pass / degraded-pass / blocked / needs-user-decision]
```

If the verdict is `pass` or `degraded-pass`, explicitly say the code is ready
for the next delivery step (commit, push, or PR creation).
