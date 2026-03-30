---
description: "Run a systematic three-channel post-implementation code review across the entire codebase"
long-description: "Run a systematic three-channel post-implementation code review across the entire codebase after an AI agent completes all implementation tasks."
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
3. **Superpowers code-reviewer** — Plan alignment, code quality, testing

## Inputs

- `$ARGUMENTS` — `--report-only` flag (optional; omit to review + fix)
- `docs/user-stories.md` (required) — user stories with acceptance criteria; organizing manifest for Phase 2
- `docs/implementation-plan.md` (optional) — implementation tasks; used to cross-check that all planned deliverables were built
- `docs/coding-standards.md` (required) — coding conventions for review context
- `docs/architecture.md` (optional) — used for architecture alignment checks
- `docs/adrs/` (optional) — architecture decision records for alignment checks
- `docs/tdd-standards.md` (optional) — test coverage expectations
- `docs/review-standards.md` (optional) — severity definitions and review criteria
- `docs/reviews/post-implementation-review.md` (optional) — prior report; triggers Update Mode if present

## Expected Outputs

- `docs/reviews/post-implementation-review.md` — consolidated findings report
- Fixed code (P0/P1/P2 findings resolved) — in review+fix and update modes

## Mode Detection

| Condition | Mode |
|-----------|------|
| No prior report, no `--report-only` | **Review + Fix** — run all phases, then fix P0/P1/P2 |
| No prior report, `--report-only` | **Report Only** — run all phases, write report, no code changes |
| Prior report exists, no `--report-only` | **Update Mode** — load prior findings, skip to Phase 3 fix execution |
| Prior report exists, `--report-only` | **Re-review** — run full review fresh, overwrite prior report |

## Instructions

### Step 1: Detect Mode

```bash
# Detect --report-only flag
REPORT_ONLY=false
[[ "$ARGUMENTS" == *"--report-only"* ]] && REPORT_ONLY=true

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

Read `docs/architecture.md` if it exists. Read all files in `docs/adrs/` if
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

#### Channel 1: Codex CLI

**Auth check first** (tokens expire — always re-verify):

```bash
codex login status 2>/dev/null && echo "codex authenticated" || echo "codex NOT authenticated"
```

If not authenticated: tell the user "Codex auth expired. Run: `! codex login`".
Do NOT silently skip. Retry after user re-authenticates.
If Codex is not installed: skip this channel and note it in the report.

**Run the review:**

```bash
codex exec --skip-git-repo-check -s read-only --ephemeral "[PHASE 1 REVIEW PROMPT]" 2>/dev/null
```

Store the JSON output as `CODEX_PHASE1_FINDINGS`.

#### Channel 2: Gemini CLI

**Auth check first:**

```bash
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
```

If exit code is 41: tell the user "Gemini auth expired. Run: `! gemini -p \"hello\"`".
Do NOT silently skip.
If Gemini is not installed: skip this channel and note it in the report.

**Run the review (independent — do NOT include Codex output in this prompt):**

```bash
NO_BROWSER=true gemini -p "[PHASE 1 REVIEW PROMPT]" --output-format json --approval-mode yolo 2>/dev/null
```

Store as `GEMINI_PHASE1_FINDINGS`.

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
      "file": "relative/path/to/file.ts",
      "line": 42,
      "description": "Specific description of the issue",
      "suggestion": "How to fix it"
    }
  ]
}
```

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

Channel 1 — Codex CLI:
  Auth: codex login status 2>/dev/null
  Run: codex exec --skip-git-repo-check -s read-only --ephemeral "[PER-STORY PROMPT]" 2>/dev/null

Channel 2 — Gemini CLI (independent):
  Auth: NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1 (exit 41 = auth failure)
  Run: NO_BROWSER=true gemini -p "[PER-STORY PROMPT]" --output-format json --approval-mode yolo 2>/dev/null

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
before returning. Then return all three channels' findings:
{
  "story": "[STORY_TITLE]",
  "codex": { "findings": [...] },
  "gemini": { "findings": [...] },
  "superpowers": { "findings": [...] }
}
```

Collect findings from all subagents. Store as `PHASE2_FINDINGS`.

### Step 6: Consolidate Findings

Merge all findings from Phase 1 (`CODEX_PHASE1_FINDINGS`, `GEMINI_PHASE1_FINDINGS`,
`SUPERPOWERS_PHASE1_FINDINGS`) and Phase 2 (`PHASE2_FINDINGS`) into one flat list.

**Deduplication:** If two findings reference the same `file` and have similar
`description` keywords (indicating the same underlying issue), merge them into one
entry. Record all source channels in a `sources` array on the merged finding.

**Confidence tagging:** If `sources` has 2 or more entries, set `high_confidence: true`.

**Sorting:** P0 first, then P1, then P2, then P3.

**Fix queue:** P0, P1, and P2 findings enter the fix queue. P3 findings are recorded
in the report but not actioned.

### Step 7: Write the Findings Report

Create `docs/reviews/` if it does not exist. Write the following to
`docs/reviews/post-implementation-review.md`:

```
# Post-Implementation Code Review

## Summary

- **Date:** [YYYY-MM-DD]
- **Mode:** [Review + Fix | Report Only | Update Mode | Re-review]
- **Channels:** Codex [completed | skipped — reason] | Gemini [completed | skipped — reason] | Superpowers [completed]
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
[P0/P1/P2/P3 findings for this story, or "No findings."]

[Repeat for each story]

## Fix Log
_Populated during fix execution._

## Remaining Findings
_Populated if any findings exceed 3 fix rounds._
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

Process the fix queue in priority order: all P0s first, then all P1s, then all P2s.
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

After all P0s are fixed, re-read each P0-modified file once to confirm correctness
before moving to P1s.

Commit after each severity tier:

```bash
git add [modified source files only — not the report]
git commit -m "fix: resolve P0 post-implementation review findings"
# Replace P0 with P1 or P2 for the respective tiers
```

### Step 9: Final Verification Pass

After all fixes are applied, run a targeted re-check on modified files only
using Superpowers code-reviewer (fastest channel).

Identify all files modified across all fix commits using the pre-fix SHA
recorded at the start of Step 8:

```bash
git diff --name-only $PRE_FIX_SHA..HEAD
```

This captures files from every severity-tier commit (P0, P1, P2), not just
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

Channels: Codex [status] | Gemini [status] | Superpowers [completed]
Findings: P0: [N] | P1: [N] | P2: [N] | P3: [N]
Fixed: [N] | Remaining: [N]

Report: docs/reviews/post-implementation-review.md
```

If any findings remain in "Remaining Findings", list them explicitly and tell
the user they require manual attention before the project is ready to release.

## Fallback Behavior

| Situation | Action |
|-----------|--------|
| Codex not installed | Skip Codex in all phases; document as "not installed" in report |
| Gemini not installed | Skip Gemini in all phases; document as "not installed" in report |
| Codex auth expired | Tell user: "Codex auth expired. Run: `! codex login`". Do NOT silently skip. Retry after re-auth. |
| Gemini auth expired (exit 41) | Tell user: "Gemini auth expired. Run: `! gemini -p \"hello\"`". Do NOT silently skip. |
| Neither CLI installed | Run Superpowers code-reviewer only; warn user that review coverage is reduced |
| `docs/user-stories.md` missing | Skip Phase 2; run Phase 1 only; warn user that functional review is incomplete |
| `docs/coding-standards.md` missing | Proceed without it; note its absence in the report summary |

## Process Rules

1. **All three channels are mandatory** — skip only when a tool is genuinely not installed, never by choice.
2. **Auth failures are not silent** — always surface to the user with the exact recovery command.
3. **Independence** — never share one channel's output with another. Each reviews independently.
4. **Verify every fix** — run tests (or re-read the file) immediately after each fix before moving on.
5. **3-round limit** — never attempt to fix the same finding more than 3 times. Surface unresolved findings to the user.
6. **Document everything** — the report must show which channels ran, which were skipped, and why.
7. **No auto-merge** — this tool modifies local files only. It never pushes, merges, or creates PRs.

## After This Step

When the review is complete, tell the user:

---
**Post-implementation review complete.**

Results:
- Channels run: [list which ran in Phase 1 and Phase 2]
- Phase 1 (systemic): [N] findings — [N] fixed, [N] remaining
- Phase 2 (functional): [N] findings across [N] stories — [N] fixed, [N] remaining
- Report: `docs/reviews/post-implementation-review.md`

Next: If all findings are resolved, the codebase is ready for final review or
release. If findings remain, address them manually before proceeding.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

---

## Domain Knowledge

### multi-model-review-dispatch

*Patterns for dispatching reviews to external AI models (Codex, Gemini) at depth 4+, including fallback strategies and finding reconciliation*

# Multi-Model Review Dispatch

At higher methodology depths (4+), reviews benefit from independent validation by external AI models. Different models have different blind spots — Codex excels at code-centric analysis while Gemini brings strength in design and architectural reasoning. Dispatching to multiple models and reconciling their findings produces higher-quality reviews than any single model alone. This knowledge covers when to dispatch, how to dispatch, how to handle failures, and how to reconcile disagreements.

## Summary

### When to Dispatch

Multi-model review activates at depth 4+ in the methodology scaling system:

| Depth | Review Approach |
|-------|----------------|
| 1-2 | Claude-only, reduced pass count |
| 3 | Claude-only, full pass count |
| 4 | Full passes + one external model (if available) |
| 5 | Full passes + multi-model with reconciliation |

Dispatch is always optional. If no external model CLI is available, the review proceeds as a Claude-only enhanced review with additional self-review passes to partially compensate.

### Model Selection

| Model | Strength | Best For |
|-------|----------|----------|
| **Codex** (OpenAI) | Code analysis, implementation correctness, API contract validation | Code reviews, security reviews, API reviews, database schema reviews |
| **Gemini** (Google) | Design reasoning, architectural patterns, broad context understanding | Architecture reviews, PRD reviews, UX reviews, domain model reviews |

When both models are available at depth 5, dispatch to both and reconcile. At depth 4, choose the model best suited to the artifact type.

### Graceful Fallback

External models are never required. The fallback chain:
1. Attempt dispatch to selected model(s)
2. If CLI unavailable → skip that model, note in report
3. If timeout → use partial results if any, note incompleteness
4. If all external models fail → Claude-only enhanced review (additional self-review passes)

The review never blocks on external model availability.

## Deep Guidance

### Dispatch Mechanics

#### CLI Availability Check

Before dispatching, verify the model CLI is installed and authenticated:

```bash
# Codex check
which codex && codex --version 2>/dev/null

# Gemini check (via Google Cloud CLI or dedicated tool)
which gemini 2>/dev/null || (which gcloud && gcloud ai models list 2>/dev/null)
```

If the CLI is not found, skip dispatch immediately. Do not prompt the user to install it — this is a review enhancement, not a requirement.

#### Prompt Formatting

External model prompts must be self-contained. The external model has no access to the pipeline context, CLAUDE.md, or prior conversation. Every dispatch includes:

1. **Artifact content** — The full text of the document being reviewed
2. **Review focus** — What specific aspects to evaluate (coverage, consistency, correctness)
3. **Upstream context** — Relevant upstream artifacts that the document should be consistent with
4. **Output format** — Structured JSON for machine-parseable findings

**Prompt template:**
```
You are reviewing the following [artifact type] for a software project.

## Document Under Review
[full artifact content]

## Upstream Context
[relevant upstream artifacts, summarized or in full]

## Review Instructions
Evaluate this document for:
1. Coverage — Are all expected topics addressed?
2. Consistency — Does it agree with the upstream context?
3. Correctness — Are technical claims accurate?
4. Completeness — Are there gaps that would block downstream work?

## Output Format
Respond with a JSON array of findings:
[
  {
    "id": "F-001",
    "severity": "P0|P1|P2|P3",
    "category": "coverage|consistency|correctness|completeness",
    "location": "section or line reference",
    "finding": "description of the issue",
    "suggestion": "recommended fix"
  }
]
```

#### Output Parsing

External model output is parsed as JSON. Handle common parsing issues:
- Strip markdown code fences (```json ... ```) if the model wraps output
- Handle trailing commas in JSON arrays
- Validate that each finding has the required fields (severity, category, finding)
- Discard malformed entries rather than failing the entire parse

Store raw output for audit:
```
docs/reviews/{artifact}/codex-review.json   — raw Codex findings
docs/reviews/{artifact}/gemini-review.json  — raw Gemini findings
docs/reviews/{artifact}/review-summary.md   — reconciled synthesis
```

### Timeout Handling

External model calls can hang or take unreasonably long. Set reasonable timeouts:

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| CLI availability check | 5 seconds | Should be instant |
| Small artifact review (<2000 words) | 60 seconds | Quick read and analysis |
| Medium artifact review (2000-10000 words) | 120 seconds | Needs more processing time |
| Large artifact review (>10000 words) | 180 seconds | Maximum reasonable wait |

#### Partial Result Handling

If a timeout occurs mid-response:
1. Check if the partial output contains valid JSON entries
2. If yes, use the valid entries and note "partial results" in the report
3. If no, treat as a model failure and fall back

Never wait indefinitely. A review that completes in 3 minutes with Claude-only findings is better than one that blocks for 10 minutes waiting for an external model.

### Finding Reconciliation

When multiple models produce findings, reconciliation synthesizes them into a unified report.

#### Consensus Analysis

Compare findings across models to identify agreement and disagreement:

**Consensus** — Multiple models flag the same issue (possibly with different wording). High confidence in the finding. Use the most specific description.

**Single-source finding** — Only one model flags an issue. Lower confidence but still valuable. Include in the report with a note about which model found it.

**Disagreement** — One model flags an issue that another model explicitly considers correct. Requires manual analysis.

#### Reconciliation Process

1. **Normalize findings.** Map each model's findings to a common schema (severity, category, location, description).

2. **Match findings across models.** Two findings match if they reference the same location and describe the same underlying issue (even with different wording). Use location + category as the matching key.

3. **Score by consensus.**
   - Found by all models → confidence: high
   - Found by majority → confidence: medium
   - Found by one model → confidence: low (but still reported)

4. **Resolve severity disagreements.** When models disagree on severity:
   - If one says P0 and another says P1 → use P0 (err on the side of caution)
   - If one says P1 and another says P3 → investigate the specific finding before deciding
   - Document the disagreement in the synthesis report

5. **Merge descriptions.** When multiple models describe the same finding differently, combine their perspectives. Model A might identify the symptom while Model B identifies the root cause.

#### Disagreement Resolution

When models actively disagree (one flags an issue, another says the same thing is correct):

1. **Read both arguments.** Each model explains its reasoning. One may have a factual error.
2. **Check against source material.** Read the actual artifact and upstream docs. The correct answer is in the documents, not in model opinions.
3. **Default to the stricter interpretation.** If genuinely ambiguous, the finding stands at reduced severity (P1 → P2).
4. **Document the disagreement.** The reconciliation report should note: "Models disagreed on [topic]. Resolution: [decision and rationale]."

### Consensus Classification

When synthesizing multi-model findings, classify each finding:
- **Consensus**: All participating models flagged the same issue at similar severity → report at the agreed severity
- **Majority**: 2+ models agree, 1 dissents → report at the lower of the agreeing severities; note the dissent
- **Divergent**: Models disagree on severity or one model found an issue others missed → present to user for decision, minimum P2 severity
- **Unique**: Only one model raised the finding → include with attribution, flag as "single-model finding" for user review

### Output Format

#### Review Summary (review-summary.md)

```markdown
# Multi-Model Review Summary: [Artifact Name]

## Models Used
- Claude (primary reviewer)
- Codex (external, depth 4+) — [available/unavailable/timeout]
- Gemini (external, depth 5) — [available/unavailable/timeout]

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P0 | [description] | Claude, Codex | High |
| 2 | P1 | [description] | Claude, Codex, Gemini | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 3 | P1 | [description] | Gemini | Low |

## Disagreements
| # | Topic | Claude | Codex | Resolution |
|---|-------|--------|-------|------------|
| 4 | [topic] | P1 issue | No issue | [resolution rationale] |

## Reconciliation Notes
[Any significant observations about model agreement patterns, recurring themes,
or areas where external models provided unique value]
```

#### Raw JSON Preservation

Always preserve the raw JSON output from external models, even after reconciliation. The raw findings serve as an audit trail and enable re-analysis if the reconciliation logic is later improved.

```
docs/reviews/{artifact}/
  codex-review.json     — raw output from Codex
  gemini-review.json    — raw output from Gemini
  review-summary.md     — reconciled synthesis
```

### Quality Gates

Minimum standards for a multi-model review to be considered complete:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| Minimum finding count | At least 3 findings across all models | A review with zero findings likely missed something |
| Coverage threshold | Every review pass has at least one finding or explicit "no issues found" note | Ensures all passes were actually executed |
| Reconciliation completeness | All cross-model disagreements have documented resolutions | No unresolved conflicts |
| Raw output preserved | JSON files exist for all models that were dispatched | Audit trail |

If the primary Claude review produces zero findings and external models are unavailable, the review should explicitly note this as unusual and recommend a targeted re-review at a later stage.

### Common Anti-Patterns

**Blind trust of external findings.** An external model flags an issue and the reviewer includes it without verification. External models hallucinate — they may flag a "missing section" that actually exists, or cite a "contradiction" based on a misread. Fix: every external finding must be verified against the actual artifact before inclusion in the final report.

**Ignoring disagreements.** Two models disagree, and the reviewer picks one without analysis. Fix: disagreements are the most valuable signal in multi-model review. They identify areas of genuine ambiguity or complexity. Always investigate and document the resolution.

**Dispatching at low depth.** Running external model reviews at depth 1-2 where the review scope is intentionally minimal. The external model does a full analysis anyway, producing findings that are out of scope. Fix: only dispatch at depth 4+. Lower depths use Claude-only review with reduced pass count.

**No fallback plan.** The review pipeline assumes external models are always available. When Codex is down, the review fails entirely. Fix: external dispatch is always optional. The fallback to Claude-only enhanced review must be implemented and tested.

**Over-weighting consensus.** Two models agree on a finding, so it must be correct. But both models may share the same bias (e.g., both flag a pattern as an anti-pattern that is actually appropriate for this project's constraints). Fix: consensus increases confidence but does not guarantee correctness. All findings still require artifact-level verification.

**Dispatching the full pipeline context.** Sending the entire project context (all docs, all code) to the external model. This exceeds context limits and dilutes focus. Fix: send only the artifact under review and the minimal upstream context needed for that specific review.

**Ignoring partial results.** A model times out after producing 3 of 5 findings. The reviewer discards all results because the review is "incomplete." Fix: partial results are still valuable. Include them with a note about incompleteness. Three real findings are better than zero.

---

### automated-review-tooling

*Patterns for setting up automated PR code review using AI models (Codex, Gemini) via local CLI, including dual-model review, reconciliation, and CI integration*

# Automated Review Tooling

Automated PR review leverages AI models to provide consistent, thorough code review without manual reviewer bottlenecks. This knowledge covers the local CLI approach (no GitHub Actions), dual-model review patterns, and integration with the PR workflow.

## Summary

### Architecture: Local CLI Review

The scaffold approach uses local CLI review rather than GitHub Actions:
- **No CI secrets required** — models run locally via CLI tools
- **Dual-model review** — run Codex and Gemini (when available) for independent perspectives
- **Agent-managed loop** — Claude orchestrates the review-fix cycle locally

Components:
- `AGENTS.md` — reviewer instructions with project-specific rules
- `docs/review-standards.md` — severity definitions (P0-P3) and criteria
- `scripts/cli-pr-review.sh` — dual-model review script
- `scripts/await-pr-review.sh` — polling script for external bot mode

### Review Severity Levels

Consistent with the pipeline's review step severity:
- **P0 (blocking)** — must fix before merge (security, data loss, broken functionality)
- **P1 (important)** — should fix before merge (bugs, missing tests, performance)
- **P2 (suggestion)** — consider fixing (style, naming, documentation)
- **P3 (nit)** — optional (personal preference, minor optimization)

### Dual-Model Review Pattern

When both Codex CLI and Gemini CLI are available:
1. Run both reviewers independently on the PR diff
2. Collect findings from each
3. Reconcile: consensus findings get higher confidence
4. Disagreements are flagged for the implementing agent to resolve

### Integration with PR Workflow

The review step integrates into the standard PR flow:
1. Agent creates PR
2. Agent runs `scripts/cli-pr-review.sh` (or review runs automatically)
3. Review findings are posted as PR comments or written to a local file
4. Agent addresses P0/P1/P2 findings, pushes fixes
5. Re-review until no P0/P1/P2 findings remain
6. PR is ready for merge

## Deep Guidance

### AGENTS.md Structure

The `AGENTS.md` file provides reviewer instructions:

```markdown
# Code Review Instructions

## Project Context
[Brief description of what this project does]

## Review Focus Areas
- Security: [project-specific security concerns]
- Performance: [known hot paths or constraints]
- Testing: [coverage requirements, test patterns]

## Coding Standards Reference
See docs/coding-standards.md for:
- Naming conventions
- Error handling patterns
- Logging standards

## Known Patterns
[Project-specific patterns reviewers should enforce]

## Out of Scope
[Things reviewers should NOT flag]
```

### CLI Review Script Pattern

The `cli-pr-review.sh` script follows this structure:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Get the PR diff
diff=$(gh pr diff "$PR_NUMBER")

# 2. Run Codex review (if available)
if command -v codex &>/dev/null; then
  codex_findings=$(echo "$diff" | codex review --context AGENTS.md)
fi

# 3. Run Gemini review (if available)
if command -v gemini &>/dev/null; then
  gemini_findings=$(echo "$diff" | gemini review --context AGENTS.md)
fi

# 4. Reconcile findings
# - Findings from both models: HIGH confidence
# - Findings from one model: MEDIUM confidence
# - Contradictions: flagged for human review
```

### Review Standards Document

`docs/review-standards.md` should define:
- Severity levels with concrete examples per project
- What constitutes a blocking review (P0/P1/P2 threshold)
- Auto-approve criteria (when review can be skipped)
- Review SLA (how long before auto-approve kicks in)

### Fallback When Models Unavailable

If neither Codex nor Gemini CLI is available:
1. Claude performs an enhanced self-review of the diff
2. Focus on the AGENTS.md review criteria
3. Apply the same severity classification
4. Document that the review was single-model

### Updating Review Standards Over Time

As the project evolves:
- Add new review focus areas when new patterns emerge
- Remove rules that linters now enforce automatically
- Update AGENTS.md when architecture changes
- Track false-positive rates and adjust thresholds

### Review Finding Reconciliation

When running dual-model review, reconcile findings systematically:

```
Finding Classification:
┌─────────────────┬──────────┬──────────┬───────────────────┐
│                 │ Codex    │ Gemini   │ Action            │
├─────────────────┼──────────┼──────────┼───────────────────┤
│ Same issue      │ Found    │ Found    │ HIGH confidence   │
│ Unique finding  │ Found    │ -        │ MEDIUM confidence │
│ Unique finding  │ -        │ Found    │ MEDIUM confidence │
│ Contradiction   │ Fix X    │ Keep X   │ Flag for agent    │
└─────────────────┴──────────┴──────────┴───────────────────┘
```

HIGH confidence findings are always addressed. MEDIUM confidence findings are addressed if P0/P1/P2. Contradictions require the implementing agent to make a judgment call and document the reasoning.

### Security-Focused Review Checklist

Every automated review should check:
- No secrets or credentials in the diff (API keys, passwords, tokens)
- No `eval()` or equivalent unsafe operations introduced
- SQL queries use parameterized queries (no string concatenation)
- User input is validated before use
- Authentication/authorization checks are present on new endpoints
- Dependencies added are from trusted sources with known versions

### Performance Review Patterns

Look for these performance anti-patterns:
- N+1 queries (loop with individual DB calls)
- Missing pagination on list endpoints
- Synchronous operations that should be async
- Large objects passed by value instead of reference
- Missing caching for expensive computations
- Unbounded growth in arrays or maps

### Integration with CLAUDE.md

The workflow-audit step should add review commands to CLAUDE.md:

```markdown
## Code Review
| Command | Purpose |
|---------|---------|
| `scripts/cli-pr-review.sh <PR#>` | Run dual-model review |
| `scripts/await-pr-review.sh <PR#>` | Poll for external review |
```

This ensures agents always know how to trigger reviews without consulting separate docs.

### Common False Positives

Track and suppress recurring false positives:
- Test files flagged for "hardcoded values" (test fixtures are intentional)
- Migration files flagged for "raw SQL" (migrations must use raw SQL)
- Generated files flagged for style issues (generated code has its own conventions)

Add suppressions to AGENTS.md under "Out of Scope" to prevent repeated false findings.

### Review Metrics and Continuous Improvement

Track these metrics over time to improve review quality:
- **False positive rate** — findings that are dismissed without action
- **Escape rate** — bugs that reach production despite review
- **Time to resolve** — average time between finding and fix
- **Coverage** — percentage of PRs that receive automated review
- **Model agreement rate** — how often Codex and Gemini agree

Use these metrics to calibrate severity thresholds and update AGENTS.md focus areas.

---

### post-implementation-review-methodology

*Two-phase whole-codebase review methodology for post-implementation quality validation*

# Post-Implementation Review Methodology

A systematic approach for reviewing an entire scaffold-generated codebase after
an AI agent has completed all implementation tasks. Differs from PR review in
that it covers the full codebase against requirements, not just a diff.

## Why Two Phases

Cross-cutting issues — security architecture, error handling patterns, test
coverage gaps — must be identified before diving into feature-level review.
Fixing a systemic security pattern affects how you write feature-level fixes.
Running cross-cutting first sets the frame for everything that follows.

Phase 1 catches what story-level review misses (systemic problems).
Phase 2 catches what cross-cutting review misses (requirement satisfaction gaps).

## Phase 1: Cross-Cutting Sweep

Review the whole codebase for systemic concerns:

| Category | What to Check |
|----------|---------------|
| Architecture alignment | Does code match architecture docs and ADRs? Are layers respected? |
| Security | Auth, input validation, secrets in code, OWASP Top 10 |
| Error handling | Consistent patterns? Errors swallowed silently? |
| Test coverage | Critical paths tested? Obvious gaps in high-risk code? |
| Complexity | Over-engineered areas, dead code, unnecessary abstractions |
| Dependencies | Unused deps, obviously outdated packages |

### Context Bundle for CLI Channels

Codex and Gemini cannot read files directly. Build a context bundle:

1. Full file tree (excluding node_modules, .git, dist, build, coverage)
2. Architecture docs (docs/architecture.md, docs/adrs/*.md if present)
3. Coding standards (docs/coding-standards.md)
4. Up to 15 strategically selected files:
   - Entry points (main.*, index.*, app.*, server.* at root/src level)
   - Core services (src/services/, src/lib/, src/core/)
   - Auth layer (files with auth, login, session, token in name/path)
   - Database layer (files with db, model, schema, migration in name/path)
   - 2-3 test files from different areas

Superpowers code-reviewer subagent has full tool access and reads files
directly — no bundling needed.

## Phase 2: Parallel User Story Review

Use docs/user-stories.md as the organizing manifest. For each story:

1. Parse the story title, description, and acceptance criteria
2. Map the story to relevant code files:
   - Read acceptance criteria for domain keywords
   - Match keywords to file/directory names in the codebase
   - Include files from the same module as matched files
   - When uncertain, include more files rather than fewer
3. Dispatch a parallel subagent per story (or thematic group for small projects)
4. Each subagent runs all three channels independently on its story's files

### Grouping Rules

- **Small project (fewer than 5 stories):** Group into 2-3 thematic batches
- **Normal (5-20 stories):** One subagent per story
- **Large story (maps to more than 20 files):** The subagent splits its review
  by layer (backend files first, frontend second) within a single subagent

## Phase 3: Finding Consolidation & Fix Execution

1. Flatten all findings from all channels across both phases into one list
2. Deduplicate: same `file` + matching issue type/description = one finding;
   record all source channels in a `sources` array
3. Multi-source (2+ channels): tag as `high_confidence: true`
4. Sort: P0 → P1 → P2 → P3
5. P3 findings go into the report but NOT into the fix queue

## Update Mode

When docs/reviews/post-implementation-review.md already exists and
--report-only is not set:

- Load prior findings directly — skip Phase 1 and Phase 2
- Surface previously-unresolved findings (those in "Remaining Findings") to
  the user immediately before starting fix execution
- Only retry a previously-failed finding if the user explicitly says to

This shortcut is safe because the user ran --report-only first to validate
the findings before approving fix execution.

## Fix Execution Rules

- Fix high-confidence (multi-source) findings first within each severity tier
- Verify immediately after each fix (run relevant tests)
- 3-round limit per finding before surfacing to user for direction
- After all fixes: run Superpowers code-reviewer on modified files only
- Full 3-channel re-review only if the Superpowers pass finds new P0/P1 findings
