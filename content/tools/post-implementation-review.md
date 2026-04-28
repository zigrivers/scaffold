---
name: post-implementation-review
description: Run a systematic three-channel post-implementation code review across the entire codebase
summary: "Run a systematic three-channel post-implementation code review across the entire codebase after an AI agent completes all implementation tasks."
phase: null
order: null
dependencies: []
outputs: [docs/reviews/post-implementation-review.md]
conditional: null
stateless: true
category: tool
knowledge-base: [multi-model-review-dispatch, automated-review-tooling, post-implementation-review-methodology]
argument-hint: "[--report-only] [--fix-threshold P0|P1|P2|P3]"
---

## Purpose

Run a systematic three-channel post-implementation code review across the entire
scaffold-generated codebase. Unlike `/scaffold:review-pr` (which reviews a git diff),
this tool reviews the full implemented codebase against requirements, acceptance
criteria, and coding standards.

Run this after an AI agent has completed all implementation tasks and you want a
comprehensive quality check before releasing or handing off the project.

The three channels are:
1. **Codex CLI** — Implementation correctness, security, API contracts
2. **Gemini CLI** — Design reasoning, architectural patterns, broad context
3. **Claude CLI** — Plan alignment, code quality, testing

## Inputs

- `$ARGUMENTS` — `--report-only` flag and/or `--fix-threshold P0|P1|P2|P3` (both optional)
- `docs/user-stories.md` (required) — user stories with acceptance criteria; organizing manifest for Phase 2
- `docs/implementation-plan.md` (optional) — implementation tasks; used to cross-check that all planned deliverables were built
- `docs/coding-standards.md` (required) — coding conventions for review context
- `docs/system-architecture.md` (optional) — used for architecture alignment checks
- `docs/adrs/` (optional) — architecture decision records for alignment checks
- `docs/tdd-standards.md` (optional) — test coverage expectations
- `docs/review-standards.md` (optional) — severity definitions and review criteria
- `docs/reviews/post-implementation-review.md` (optional) — prior report; triggers Update Mode if present

## Expected Outputs

- `docs/reviews/post-implementation-review.md` — consolidated findings report
- Fixed code (findings at or above `fix_threshold` resolved) — in review+fix and update modes

## Mode Detection

| Condition | Mode |
|-----------|------|
| No prior report, no `--report-only` | **Review + Fix** — run all phases, then fix findings at or above `fix_threshold` |
| No prior report, `--report-only` | **Report Only** — run all phases, write report, no code changes |
| Prior report exists, no `--report-only` | **Update Mode** — load prior findings, skip to Phase 3 fix execution |
| Prior report exists, `--report-only` | **Re-review** — run full review fresh, overwrite prior report |

## Instructions

### Step 1: Detect Mode

```bash
# Detect --report-only flag
REPORT_ONLY=false
[[ "$ARGUMENTS" == *"--report-only"* ]] && REPORT_ONLY=true

# Detect --fix-threshold flag
FIX_THRESHOLD=""
if [[ "$ARGUMENTS" =~ (^|[[:space:]])--fix-threshold[[:space:]]+(P[0-3])($|[[:space:]]) ]]; then
  FIX_THRESHOLD="${BASH_REMATCH[2]}"
fi

# Detect prior report
PRIOR_REPORT="docs/reviews/post-implementation-review.md"
[[ -f "$PRIOR_REPORT" ]] && PRIOR_EXISTS=true || PRIOR_EXISTS=false
```

Determine the active mode from the combination of flags:
- `PRIOR_EXISTS=false`, `REPORT_ONLY=false` → **Review + Fix** (proceed to Step 3)
- `PRIOR_EXISTS=false`, `REPORT_ONLY=true` → **Report Only** (proceed to Step 3, skip Step 8)
- `PRIOR_EXISTS=true`, `REPORT_ONLY=false` → **Update Mode** (proceed to Step 2)
- `PRIOR_EXISTS=true`, `REPORT_ONLY=true` → **Re-review** (proceed to Step 3, overwrite report)

Tell the user which mode is active before proceeding.

### Step 2: Handle Update Mode

*Skip this step unless in Update Mode.*

1. Read `docs/reviews/post-implementation-review.md`.
2. Extract the "Remaining Findings" section. If it contains any entries, stop and
   tell the user:

   > These findings were unresolved in the prior review:
   > [list each finding with its severity and description]
   >
   > How would you like to proceed?
   > (a) Retry fixing them
   > (b) Skip them and fix only new findings
   > (c) Cancel

   Wait for the user's response before continuing.

3. Load all unresolved findings from the prior report into memory as the fix queue.
4. Skip directly to Step 8 (Fix Execution).

### Step 3: Build Phase 1 Context Bundle

*Skip this step in Update Mode.*

Codex and Gemini cannot read files directly. Build a context bundle before
dispatching them. Superpowers code-reviewer does not need a bundle.

**Generate the file tree:**

```bash
find . -type f \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -not -path '*/.next/*' \
  -not -path '*/coverage/*' \
  -not -path '*/.scaffold/*' \
  | sort
```

**Read architecture docs (if present):**

Read `docs/system-architecture.md` if it exists. Read all files in `docs/adrs/` if
the directory exists. Combine into a single architecture context string. If
neither exists, use an empty string and note "Architecture docs not found."

**Read standards:**

Read `docs/coding-standards.md`. Also read `docs/tdd-standards.md` and
`docs/review-standards.md` if they exist; append to the standards string.

**Select and read up to 15 key files:**

From the file tree, identify and read files in this priority order (skip
categories absent from this project):

1. Entry points: `main.*`, `index.*`, `app.*`, `server.*` at root or `src/`
2. Core services: files under `src/services/`, `src/lib/`, `src/core/`, or similar
3. Auth layer: files with `auth`, `login`, `session`, or `token` in their path
4. Database layer: files with `db`, `database`, `model`, `schema`, or `migration` in path
5. Test examples: 2–3 test files from different areas of the codebase

Format key files for the bundle:

```
=== relative/path/to/file.ts ===
[full file contents]

=== relative/path/to/next-file.ts ===
[full file contents]
```

### Step 4: Run Phase 1 — Cross-Cutting Sweep

*Skip this step in Update Mode.*

All three channels run independently on the context bundle from Step 3.
No channel sees another's output.

Construct the Phase 1 review prompt using the bundle assembled in Step 3:

```
You are reviewing a software codebase for systemic quality issues.

## Project File Tree
[FILE_TREE]

## Architecture Documentation
[ARCHITECTURE, or "Not provided" if absent]

## Coding Standards
[CODING_STANDARDS]

## Key Source Files
[KEY_FILE_CONTENTS]

## Review Task

Review for SYSTEMIC concerns only. Do NOT review individual feature logic.
Focus on these categories:
1. architecture-alignment — Does the code match the architecture docs and ADRs? Are layers respected?
2. security — Auth implementation, input validation, secrets in code, OWASP Top 10
3. error-handling — Is error handling consistent? Are errors swallowed silently?
4. test-coverage — Are critical paths tested? Are there obvious coverage gaps?
5. complexity — Over-engineered areas, dead code, unnecessary abstractions, functions doing too much
6. dependencies — Unused dependencies, obviously outdated packages

Return ALL findings as valid JSON:
{
  "findings": [
    {
      "severity": "P0|P1|P2|P3",
      "category": "architecture-alignment|security|error-handling|test-coverage|complexity|dependencies",
      "location": "relative/path/to/file.ts:42",
      "file": "relative/path/to/file.ts",
      "line": 42,
      "description": "Specific description of the issue",
      "suggestion": "How to fix it"
    }
  ]
}

Severity:
- P0: Critical — security vulnerabilities, data loss risk, broken functionality
- P1: Important — bugs, missing critical-path tests, significant performance issues
- P2: Suggestion — inconsistent patterns, naming, minor improvements
- P3: Nit — style preferences, very minor optimizations

Return ONLY valid JSON. No markdown, no explanation outside the JSON object.
```

**Foreground only:** Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output.

#### Channel 1: Codex CLI

**Installation check first:**

```bash
command -v codex >/dev/null 2>&1 || echo "Codex not installed"
```

If not installed: queue a compensating pass (implementation correctness, security, API contracts, labeled `[compensating: Codex-equivalent]`). Skip to Channel 2.

**Auth check** (tokens expire — always re-verify):

```bash
codex login status 2>/dev/null && echo "codex authenticated" || echo "codex NOT authenticated"
```

If not authenticated: tell the user "Codex auth expired. Run: `! codex login`". Do NOT silently skip. Wait for re-auth and retry once. If auth cannot be recovered (timeout or user declines): queue a compensating pass (implementation correctness, security, API contracts, labeled `[compensating: Codex-equivalent]`).

If Codex fails during execution (non-zero exit, malformed output, timeout): queue a compensating pass with the same focus and label.

**Run the review:**

```bash
codex exec --skip-git-repo-check -s read-only --ephemeral "[PHASE 1 REVIEW PROMPT]" 2>/dev/null
```

Store the JSON output as `CODEX_PHASE1_FINDINGS`.

#### Channel 2: Gemini CLI

**Installation check first:**

```bash
command -v gemini >/dev/null 2>&1 || echo "Gemini not installed"
```

If not installed: queue a compensating pass (architectural patterns, design reasoning, broad context, labeled `[compensating: Gemini-equivalent]`). Skip to Channel 3.

**Auth check:**

```bash
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
```

If exit code is 41: tell the user "Gemini auth expired. Run: `! gemini -p \"hello\"`". Do NOT silently skip. Wait for re-auth and retry once. If auth cannot be recovered (timeout or user declines): queue a compensating pass (architectural patterns, design reasoning, broad context, labeled `[compensating: Gemini-equivalent]`).

If Gemini fails during execution (non-zero exit, malformed output, timeout): queue a compensating pass with the same focus and label.

**Run the review (independent — do NOT include Codex output in this prompt):**

```bash
NO_BROWSER=true gemini -p "[PHASE 1 REVIEW PROMPT]" --output-format json --approval-mode yolo 2>/dev/null
```

Store as `GEMINI_PHASE1_FINDINGS`.

**After all Phase 1 channels:** Run any queued compensating passes. Record which channels were real, compensating, or skipped. This availability map is used for Phase 2.

#### Channel 3: Superpowers Code-Reviewer

Dispatch the `superpowers:code-reviewer` subagent. This channel always runs.

Provide:
- `WHAT_WAS_IMPLEMENTED`: "Cross-cutting systemic review of the full codebase"
- `PLAN_OR_REQUIREMENTS`: Content of `docs/coding-standards.md` plus any architecture docs
- `DESCRIPTION`: "Review the full codebase for systemic concerns: architecture alignment,
  security, error handling consistency, test coverage gaps, complexity/dead code, and
  dependency health. This is a whole-codebase review — read all source files directly.
  Do not review individual feature logic."

Do NOT provide BASE_SHA / HEAD_SHA — this is not a diff review.

The subagent must return findings in this JSON shape (normalize any findings it
surfaces to this format before returning):

```json
{
  "findings": [
    {
      "severity": "P0|P1|P2|P3",
      "category": "architecture-alignment|security|error-handling|test-coverage|complexity|dependencies",
      "location": "relative/path/to/file.ts:42",
      "file": "relative/path/to/file.ts",
      "line": 42,
      "description": "Specific description of the issue",
      "suggestion": "How to fix it"
    }
  ]
}
```

**MMR compatibility:** The `location` field (`file:line` format) is required for
`mmr reconcile` injection. The `file` and `line` fields are retained for backward
compatibility with direct channel consumers.

Store as `SUPERPOWERS_PHASE1_FINDINGS`.

### Step 5: Run Phase 2 — Parallel User Story Review

*Skip this step in Update Mode.*

#### 5a: Parse User Stories

Read `docs/user-stories.md`. Extract each story:
- Story title
- Description
- Acceptance criteria (the checklist items)

Use story headings (`## Story: [title]`, `### US-[N]`, or similar) as story
boundaries. Adapt to whatever heading format is used in the document.

#### 5b: Map Stories to Files

For each story, identify the files that implement it:

1. Read the story's acceptance criteria
2. Extract domain keywords (e.g. "password reset" → look for `password`, `reset` in file paths)
3. Scan the file tree for paths containing those keywords
4. Include other files in the same directory or module as matched files
5. Aim for 3–15 files per story; when uncertain, include more rather than fewer

Read the identified files. Format as:

```
=== relative/path/to/file.ts ===
[full file contents]
```

#### 5c: Apply Grouping Rules

- **Fewer than 5 stories:** Group into 2–3 thematic batches; one subagent per batch
- **5–20 stories:** One subagent per story (standard case)
- **Story maps to more than 20 files:** The subagent for that story splits its
  review by layer (run Codex on backend files, then frontend files separately)

#### 5d: Dispatch Parallel Subagents

Use `superpowers:dispatching-parallel-agents` to dispatch one subagent per
story (or group). Each subagent is dispatched with full tool access and **can
dispatch further subagents** — this is how each story subagent runs its own
`superpowers:code-reviewer` as Channel 3. This two-level nesting is intentional
and supported. Each subagent receives these instructions:

```
You are reviewing the implementation of one user story using all three review channels.

## User Story
[STORY_TITLE]
[STORY_DESCRIPTION]

Acceptance Criteria:
[ACCEPTANCE_CRITERIA — bullet list]

## Implementation Files
[FILE_CONTENTS — formatted as === path === / contents blocks]

## Coding Standards
[CODING_STANDARDS content]

## Your Task

Run all three review channels. Each runs independently — do NOT share one channel's
output with another.

**Foreground only:** Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output.

**Session-scoped channel availability:** Phase 1 has already probed channel installation and auth. Pass the Phase 1 channel availability results to each Phase 2 subagent. Subagents do NOT re-probe — if Codex was `auth failed` in Phase 1, every Phase 2 subagent treats Codex as unavailable and runs a compensating pass immediately.

Phase 2 compensating passes adapt the focus to story context:
- Missing Codex → focus compensating pass on implementation correctness and edge cases for this story's acceptance criteria.
- Missing Gemini → focus compensating pass on design coherence and architectural alignment for this story.

Channel 1 — Codex CLI:
  Run: codex exec --skip-git-repo-check -s read-only --ephemeral "[PER-STORY PROMPT]" 2>/dev/null
  (Only if Codex was available in Phase 1. Otherwise run compensating pass immediately.)

Channel 2 — Gemini CLI (independent):
  Run: NO_BROWSER=true gemini -p "[PER-STORY PROMPT]" --output-format json --approval-mode yolo 2>/dev/null
  (Only if Gemini was available in Phase 1. Otherwise run compensating pass immediately.)

Channel 3 — Superpowers code-reviewer:
  Dispatch superpowers:code-reviewer with:
  - WHAT_WAS_IMPLEMENTED: "[STORY_TITLE]"
  - PLAN_OR_REQUIREMENTS: "Acceptance criteria: [ACCEPTANCE_CRITERIA]"
  - DESCRIPTION: "Review these files against the story acceptance criteria. Check for
    bugs, missing edge cases, incorrect behavior, and security concerns."

The per-story review prompt for Codex and Gemini:

  "You are reviewing the implementation of a specific user story.

  ## User Story
  [STORY_TITLE]: [STORY_DESCRIPTION]

  Acceptance Criteria:
  [ACCEPTANCE_CRITERIA]

  ## Implementation Files
  [FILE_CONTENTS]

  ## Coding Standards
  [CODING_STANDARDS]

  ## Review Task
  Review these files against the acceptance criteria above. Check:
  1. Does the implementation satisfy each acceptance criterion?
  2. Are there bugs or missing edge cases?
  3. Are edge cases from the story handled?
  4. Any security or validation concerns specific to this story?

  Return JSON:
  {
    \"story\": \"[STORY_TITLE]\",
    \"findings\": [
      {
        \"severity\": \"P0|P1|P2|P3\",
        \"acceptance_criterion\": \"Which criterion (or null if general)\",
        \"file\": \"relative/path/to/file.ts\",
        \"line\": 42,
        \"description\": \"Specific description\",
        \"suggestion\": \"How to fix it\"
      }
    ],
    \"criteria_status\": {
      \"[criterion text]\": \"satisfied|partial|not-satisfied\"
    }
  }

  Return ONLY valid JSON."

Normalize the Superpowers code-reviewer findings to the same JSON shape as
Codex/Gemini (severity, acceptance_criterion, file, line, description, suggestion)
before returning. Then return all three channels' findings plus channel status:
{
  "story": "[STORY_TITLE]",
  "channel_status": {
    "codex": { "root_cause": "null|not_installed|auth_failed|timeout|failed", "coverage_status": "full|compensating" },
    "gemini": { "root_cause": "null|not_installed|auth_failed|timeout|failed", "coverage_status": "full|compensating" },
    "superpowers": { "root_cause": null, "coverage_status": "full" }
  },
  "codex": { "findings": [...] },
  "gemini": { "findings": [...] },
  "superpowers": { "findings": [...] }
}
```

Collect findings from all subagents. Store as `PHASE2_FINDINGS`.

### Step 5e: Optional — Inject Findings into MMR for Unified Reconciliation

If an MMR job exists (e.g., from a prior `mmr review` run on the same branch), the
agent can inject its post-implementation review findings into MMR for unified
reconciliation across all channels:

```bash
# Inject Phase 1 and Phase 2 findings into an existing MMR job
# Write agent findings to a temp file for mmr reconcile
echo "$AGENT_FINDINGS" > /tmp/agent-findings.json
mmr reconcile "$JOB_ID" --channel superpowers --input /tmp/agent-findings.json
```

All findings injected via `mmr reconcile` must use MMR-compatible schema: each
finding needs `severity` (P0-P3), `location` (file:line), and `description`
(`suggestion` is optional). The strict validator will reject findings with
missing or invalid required fields.

This step is optional — post-implementation review is a full-codebase review (not
diff-only), so it operates independently of `mmr review`. Use `mmr reconcile` only
when you want to merge post-implementation findings into an existing MMR job for a
single unified verdict.

If `$FIX_THRESHOLD` is set and a fresh `mmr review` is dispatched as part
of this flow (e.g., to seed a job for `mmr reconcile`), forward it to that
invocation: `mmr review … --fix-threshold "$FIX_THRESHOLD" …`. The
existing `mmr reconcile` call does not take `--fix-threshold` directly —
the job's threshold is set at `mmr review` time.

### Step 6: Consolidate Findings

Merge all findings from Phase 1 (`CODEX_PHASE1_FINDINGS`, `GEMINI_PHASE1_FINDINGS`,
`SUPERPOWERS_PHASE1_FINDINGS`) and Phase 2 (`PHASE2_FINDINGS`) into one flat list.

**Deduplication:** If two findings reference the same `file` and have similar
`description` keywords (indicating the same underlying issue), merge them into one
entry. Record all source channels in a `sources` array on the merged finding.

**Confidence tagging:** If `sources` has 2 or more entries, set `high_confidence: true`.

**Sorting:** P0 first, then P1, then P2, then P3.

**Fix queue:** Findings at or above the configured `fix_threshold` enter the
fix queue. The threshold defaults to `P2` (so P0, P1, P2 enter the queue and
P3 is advisory) and is configurable via `.mmr.yaml`, `--fix-threshold`
passed to this command, or the user's `~/.mmr/config.yaml`. The agent
reads the active threshold from `$FIX_THRESHOLD` if set; otherwise from
`.mmr.yaml` or the built-in default.

### Step 7: Write the Findings Report

Create `docs/reviews/` if it does not exist. Write the following to
`docs/reviews/post-implementation-review.md`:

```
# Post-Implementation Code Review

## Summary

- **Date:** [YYYY-MM-DD]
- **Mode:** [Review + Fix | Report Only | Update Mode | Re-review]
- **Coverage:** [full-coverage / degraded-coverage / partial-coverage]
- **Channels (Phase 1):** Codex [completed | compensating | skipped — reason] | Gemini [completed | compensating | skipped — reason] | Superpowers [completed]
- **Channels (Phase 2):** [N] stories reviewed, [N] with full channels, [N] with compensating passes
- **Findings:** P0: [N] | P1: [N] | P2: [N] | P3: [N]
- **Fixed:** [N findings fixed | N/A — report-only]

## Phase 1: Systemic Findings

### Architecture Alignment
[Findings in this category, one per bullet. Or: "No findings."]

### Security
[Findings or "No findings."]

### Error Handling
[Findings or "No findings."]

### Test Coverage
[Findings or "No findings."]

### Complexity
[Findings or "No findings."]

### Dependencies
[Findings or "No findings."]

## Phase 2: Functional Findings

### Story: [story title]
**Criteria Status:**
- [criterion]: satisfied | partial | not-satisfied

**Findings:**
[Findings sorted by severity, or "No findings."]

[Repeat for each story]

## Fix Log
_Populated during fix execution._

## Remaining Findings
_Populated when the same finding remains unresolved after 3 fix attempts._
```

**If Report Only mode:** After writing the report, stop. Tell the user:

> Report written to `docs/reviews/post-implementation-review.md`.
>
> To apply fixes, re-run without the `--report-only` flag.
> To refresh the report with a new review, re-run with `--report-only`.

### Step 8: Fix Execution

*Skip this step in Report Only mode.*

Before making any fixes, record the current HEAD SHA:

```bash
PRE_FIX_SHA=$(git rev-parse HEAD)
```

This is used in Step 9 to identify all files modified across all fix commits,
regardless of how many severity-tier commits are made.

Process the fix queue in priority order: iterate severity tiers from most
critical to least, processing every tier from `P0` down to and including
the configured `fix_threshold` (default `P2`). At threshold `P3` this
includes all four tiers; at `P0` only critical findings are processed.
Within each severity tier, fix high-confidence findings (multi-source) first.

For each finding:

1. Read the file at `finding.file`.
2. Apply the fix suggested by `finding.suggestion`, guided by `finding.description`.
3. Verify the fix immediately:
   - Identify the project's test command (check `package.json` scripts for `test`,
     `Makefile` for `make test`, `pytest` for Python, `go test ./...` for Go, etc.)
   - Run the tests most relevant to the modified file
   - If no tests exist for this file, re-read the file to confirm the fix is correct
4. If verification passes: mark the finding as resolved.
5. If verification fails: attempt to fix the failure. This counts as the same round.
6. Track fix attempts per finding. After 3 failed attempts:
   - Record the finding under "Remaining Findings" in the report
   - Stop attempting to fix it
   - Continue to the next finding in the queue

After all findings in a severity tier are fixed, re-read each modified file
once to confirm correctness before moving to the next tier.

Commit after each severity tier processed (the tier label varies by run —
`P0`, `P1`, `P2`, or `P3` depending on the configured threshold):

```bash
git add [modified source files only — not the report]
git commit -m "fix: resolve <tier> post-implementation review findings"
# Substitute <tier> with the severity label of the tier you just processed
```

### Step 9: Final Verification Pass

After all fixes are applied, run a targeted re-check on modified files only
using Superpowers code-reviewer (fastest channel).

Identify all files modified across all fix commits using the pre-fix SHA
recorded at the start of Step 8:

```bash
git diff --name-only $PRE_FIX_SHA..HEAD
```

This captures files from every severity-tier commit, not just
the most recent one.

Dispatch `superpowers:code-reviewer` with:
- `WHAT_WAS_IMPLEMENTED`: "Post-implementation review fix pass"
- `PLAN_OR_REQUIREMENTS`: Content of `docs/coding-standards.md`
- `DESCRIPTION`: "Verify these files after code review fixes were applied:
  [list of modified files]. Check: (1) did the fixes resolve the reported issues?
  (2) did any fix introduce a new problem? Report any new P0 or P1 findings only."

If the subagent reports new P0 or P1 findings:
- Add them to the findings report
- Fix them using the same process as Step 8
- Re-run this verification step on the newly modified files

When verification passes with no new P0/P1 findings, update
`docs/reviews/post-implementation-review.md` with the Fix Log:

- **Review + Fix / Re-review mode:** Replace the `_Populated during fix execution._`
  placeholder in the "Fix Log" section
- **Update Mode:** The prior report already has a populated Fix Log; append a new
  `## Fix Log — Update Run [YYYY-MM-DD]` section at the end of the report instead
  of overwriting the existing one

Use this table format:

```
## Fix Log

| Finding | Severity | File | Fix Applied | Status |
|---------|----------|------|-------------|--------|
| [description] | P0 | path/to/file.ts | [brief description of fix] | Resolved |
| [description] | P1 | path/to/file.ts | [brief description of fix] | Resolved |
| [description] | P2 | path/to/file.ts | [brief description of fix] | Unresolved (3 attempts) |
```

Commit the updated report:

```bash
git add docs/reviews/post-implementation-review.md
git commit -m "docs: update post-implementation review report with fix log"
```

### Step 10: Confirm Completion

Output the completion summary:

```
Post-implementation review complete.

Coverage: [full-coverage / degraded-coverage / partial-coverage]
Channels (Phase 1): Codex [completed|compensating|skipped — reason] | Gemini [completed|compensating|skipped — reason] | Superpowers [completed]
Channels (Phase 2): [N] stories reviewed, [N] with full channels, [N] with compensating passes
Findings: P0: [N] | P1: [N] | P2: [N] | P3: [N]
Fixed: [N] | Remaining: [N]

Report: docs/reviews/post-implementation-review.md
```

If any findings remain in "Remaining Findings", list them explicitly and tell
the user they require manual attention before the project is ready to release.

## Fallback Behavior

| Situation | Action |
|-----------|--------|
| Codex not installed (`command -v` fails) | Queue compensating pass (implementation correctness, security, API contracts, labeled `[compensating: Codex-equivalent]`); document as "not_installed" in report |
| Gemini not installed (`command -v` fails) | Queue compensating pass (architectural patterns, design reasoning, broad context, labeled `[compensating: Gemini-equivalent]`); document as "not_installed" in report |
| Codex auth expired — user recovers | Re-run auth check; proceed with full Codex channel |
| Codex auth expired — user declines or timeout | Queue compensating pass (implementation correctness, security, API contracts, labeled `[compensating: Codex-equivalent]`); document as "auth_failed" or "timeout" in report |
| Gemini auth expired (exit 41) — user recovers | Re-run auth check; proceed with full Gemini channel |
| Gemini auth expired — user declines or timeout | Queue compensating pass (architectural patterns, design reasoning, broad context, labeled `[compensating: Gemini-equivalent]`); document as "auth_failed" or "timeout" in report |
| Channel fails during execution (non-zero exit, malformed output, timeout) | Queue compensating pass for that channel with same focus and label; document root cause in report |
| Both external CLIs unavailable (any combination of not_installed / auth failure) | Run all compensating passes plus Superpowers code-reviewer; report coverage as "degraded-coverage"; warn user that review coverage is reduced |
| Superpowers unavailable | Document as "unavailable" in report; proceed with remaining channels; Superpowers is a Claude subagent and should always be available |
| `docs/user-stories.md` missing | Skip Phase 2; run Phase 1 only; warn user that functional review is incomplete |
| `docs/coding-standards.md` missing | Proceed without it; note its absence in the report summary |

## Process Rules

1. **Foreground only** — Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output.
2. **All three channels are mandatory** — a channel enters degraded mode (compensating pass) when not installed, auth cannot be recovered, or it fails during execution. Never skip silently by choice.
3. **Auth failures are not silent** — always surface to the user with the exact recovery command (`! codex login` or `! gemini -p "hello"`). Wait for user response before queuing a compensating pass.
4. **Independence** — never share one channel's output with another. Each reviews independently.
5. **Verify every fix** — run tests (or re-read the file) immediately after each fix before moving on.
6. **3-round limit (per finding)** — never attempt to fix the *same* blocking finding more than 3 times. Each round that surfaces a *new, different, fixable* finding is healthy iteration — keep going. Stop only when the same finding recurs across 3 attempts, channels contradict each other, or the user asks to stop. Surface unresolved findings to the user.
7. **Document everything** — the report must show which channels ran, which were compensating, which were skipped, and the root cause for any degraded channel.
8. **No auto-merge** — this tool modifies local files only. It never pushes, merges, or creates PRs.
9. **Dispatch pattern cross-reference** — Phase 2 parallel dispatch uses `superpowers:dispatching-parallel-agents`. Each story subagent dispatches its own `superpowers:code-reviewer` as Channel 3. This two-level nesting is intentional and supported.

## After This Step

When the review is complete, tell the user:

---
**Post-implementation review complete.**

Results:
- Coverage: [full-coverage / degraded-coverage / partial-coverage]
- Channels (Phase 1): Codex [completed|compensating|skipped — reason] | Gemini [completed|compensating|skipped — reason] | Superpowers [completed]
- Channels (Phase 2): [N] stories reviewed, [N] with full channels, [N] with compensating passes
- Phase 1 (systemic): [N] findings — [N] fixed, [N] remaining
- Phase 2 (functional): [N] findings across [N] stories — [N] fixed, [N] remaining
- Report: `docs/reviews/post-implementation-review.md`

Next: If all findings are resolved, the codebase is ready for final review or
release. If findings remain, address them manually before proceeding.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
