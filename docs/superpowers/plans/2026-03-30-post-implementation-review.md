# Post-Implementation Review Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on Tasks 3–10:** Each "Append to file" step shows the content to write as a code block. Some of those blocks contain inner bash/prompt code blocks — this causes imperfect markdown rendering. Read the raw file to see the full content; the intent is always unambiguous.

**Goal:** Add `/scaffold:post-implementation-review` — a three-channel whole-codebase review tool that runs after an AI agent completes all implementation tasks, identifies P0/P1/P2 findings, and fixes them.

**Architecture:** A new tool source file in `tools/` instructs an AI agent to run two review phases (cross-cutting sweep → parallel per-story review) using Codex CLI, Gemini CLI, and Superpowers code-reviewer independently. A new knowledge entry in `knowledge/tools/` captures the methodology. `npm run build` generates the installable command in `commands/`.

**Tech Stack:** Bash (tool instructions), bats-core (tests), YAML frontmatter, TypeScript scaffold build pipeline, Codex CLI, Gemini CLI, Claude subagents

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `tests/post-implementation-review.bats` | Failing tests written first (TDD) |
| Create | `knowledge/tools/post-implementation-review-methodology.md` | Methodology knowledge entry |
| Create | `tools/post-implementation-review.md` | Tool source — written in Tasks 3–10 |
| Generate | `commands/post-implementation-review.md` | Built output via `npm run build` |

---

### Task 1: Write Failing Bats Tests

**Files:**
- Create: `tests/post-implementation-review.bats`

- [ ] **Step 1: Create the test file**

Write this to `tests/post-implementation-review.bats`:

```bash
#!/usr/bin/env bats

COMMAND="$BATS_TEST_DIRNAME/../commands/post-implementation-review.md"

@test "generated command file exists" {
    [ -f "$COMMAND" ]
}

@test "command has description frontmatter" {
    run grep -q '^description:' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents Phase 1 cross-cutting sweep" {
    run grep -q 'Phase 1' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents Phase 2 user story review" {
    run grep -q 'Phase 2' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents Phase 3 consolidation" {
    run grep -q 'Phase 3' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents report-only mode" {
    run grep -q 'report-only' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents Update Mode" {
    run grep -qi 'update mode' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command references Codex CLI" {
    run grep -q 'Codex' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command references Gemini CLI" {
    run grep -q 'Gemini' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command references Superpowers code-reviewer" {
    run grep -q 'Superpowers' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents fallback behavior" {
    run grep -qi 'fallback' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents P0 severity" {
    run grep -q 'P0' "$COMMAND"
    [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
bats tests/post-implementation-review.bats
```

Expected: All 12 tests fail. First failure should mention the command file does not exist.

- [ ] **Step 3: Commit**

```bash
git add tests/post-implementation-review.bats
git commit -m "test: add failing tests for post-implementation-review command"
```

---

### Task 2: Write Knowledge Entry

**Files:**
- Create: `knowledge/tools/post-implementation-review-methodology.md`

- [ ] **Step 1: Create the knowledge entry**

Write this to `knowledge/tools/post-implementation-review-methodology.md`:

```markdown
---
name: post-implementation-review-methodology
description: Two-phase whole-codebase review methodology for post-implementation quality validation
topics: [review, code-review, multi-model, post-implementation, methodology]
---

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

## Phase 3: Deduplication

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
```

- [ ] **Step 2: Verify frontmatter is correct**

```bash
head -7 knowledge/tools/post-implementation-review-methodology.md
```

Expected: Shows the three-field frontmatter block (name, description, topics).

- [ ] **Step 3: Commit**

```bash
git add knowledge/tools/post-implementation-review-methodology.md
git commit -m "feat: add post-implementation-review-methodology knowledge entry"
```

---

### Task 3: Write Tool Source File — Frontmatter and Static Sections

**Files:**
- Create: `tools/post-implementation-review.md`

- [ ] **Step 1: Create the file with frontmatter and static sections**

Write the following to `tools/post-implementation-review.md`:

```markdown
---
name: post-implementation-review
description: Run a systematic three-channel post-implementation code review across the entire codebase
phase: null
order: null
dependencies: []
outputs: [docs/reviews/post-implementation-review.md]
conditional: null
stateless: true
category: tool
knowledge-base: [multi-model-review-dispatch, automated-review-tooling, post-implementation-review-methodology]
argument-hint: "[--report-only]"
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
- `docs/implementation-plan.md` (required) — implementation tasks for completeness reference
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
| Prior report exists, no `--report-only` | **Update** — load prior findings, skip to Phase 3 fix execution |
| Prior report exists, `--report-only` | **Re-review** — run full review fresh, overwrite prior report |
```

- [ ] **Step 2: Confirm file was created with correct frontmatter**

```bash
head -15 tools/post-implementation-review.md
```

Expected: Shows frontmatter block with all fields including `category: tool` and `stateless: true`.

- [ ] **Step 3: Commit**

```bash
git add tools/post-implementation-review.md
git commit -m "feat: add post-implementation-review tool - frontmatter and static sections"
```

---

### Task 4: Write Tool Instructions — Steps 1 and 2 (Mode Detection)

**Files:**
- Modify: `tools/post-implementation-review.md`

- [ ] **Step 1: Append the Instructions header and Steps 1–2**

Append to `tools/post-implementation-review.md`:

```markdown

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
```

- [ ] **Step 2: Verify the section was appended**

```bash
grep -n "Step 2: Handle Update Mode" tools/post-implementation-review.md
```

Expected: A line number is returned (should be past line 60).

- [ ] **Step 3: Commit**

```bash
git add tools/post-implementation-review.md
git commit -m "feat: add mode detection steps to post-implementation-review tool"
```

---

### Task 5: Write Tool Instructions — Step 3 (Phase 1 Context Bundle)

**Files:**
- Modify: `tools/post-implementation-review.md`

- [ ] **Step 1: Append Step 3 to the tool file**

Append to `tools/post-implementation-review.md`:

```markdown

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
```

- [ ] **Step 2: Verify the section was appended**

```bash
grep -n "Step 3: Build Phase 1 Context Bundle" tools/post-implementation-review.md
```

Expected: A line number is returned.

- [ ] **Step 3: Commit**

```bash
git add tools/post-implementation-review.md
git commit -m "feat: add Phase 1 context bundle step to post-implementation-review tool"
```

---

### Task 6: Write Tool Instructions — Step 4 (Phase 1 Channel Dispatch)

**Files:**
- Modify: `tools/post-implementation-review.md`

- [ ] **Step 1: Append Step 4 to the tool file**

Append to `tools/post-implementation-review.md`:

```markdown

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

Store as `SUPERPOWERS_PHASE1_FINDINGS`.
```

- [ ] **Step 2: Verify the section was appended**

```bash
grep -n "Step 4: Run Phase 1" tools/post-implementation-review.md
```

Expected: A line number is returned.

- [ ] **Step 3: Commit**

```bash
git add tools/post-implementation-review.md
git commit -m "feat: add Phase 1 channel dispatch to post-implementation-review tool"
```

---

### Task 7: Write Tool Instructions — Step 5 (Phase 2 Parallel Story Review)

**Files:**
- Modify: `tools/post-implementation-review.md`

- [ ] **Step 1: Append Step 5 to the tool file**

Append to `tools/post-implementation-review.md`:

```markdown

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
story (or group). Each subagent receives these instructions:

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
[CODING_STANDARDS]

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

Return all three channels' findings:
{
  "story": "[STORY_TITLE]",
  "codex": { ...findings... },
  "gemini": { ...findings... },
  "superpowers": { ...findings... }
}
```

Collect findings from all subagents. Store as `PHASE2_FINDINGS`.
```

- [ ] **Step 2: Verify the section was appended**

```bash
grep -n "Step 5: Run Phase 2" tools/post-implementation-review.md
```

Expected: A line number is returned.

- [ ] **Step 3: Commit**

```bash
git add tools/post-implementation-review.md
git commit -m "feat: add Phase 2 parallel story review to post-implementation-review tool"
```

---

### Task 8: Write Tool Instructions — Steps 6 and 7 (Consolidation and Report)

**Files:**
- Modify: `tools/post-implementation-review.md`

- [ ] **Step 1: Append Steps 6–7 to the tool file**

Append to `tools/post-implementation-review.md`:

```markdown

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
- **Mode:** [Review + Fix | Report Only | Update | Re-review]
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
```

- [ ] **Step 2: Verify the section was appended**

```bash
grep -n "Step 7: Write the Findings Report" tools/post-implementation-review.md
```

Expected: A line number is returned.

- [ ] **Step 3: Commit**

```bash
git add tools/post-implementation-review.md
git commit -m "feat: add consolidation and report writing to post-implementation-review tool"
```

---

### Task 9: Write Tool Instructions — Steps 8–10 (Fix, Verify, Complete)

**Files:**
- Modify: `tools/post-implementation-review.md`

- [ ] **Step 1: Append Steps 8–10 to the tool file**

Append to `tools/post-implementation-review.md`:

```markdown

### Step 8: Fix Execution

*Skip this step in Report Only mode.*

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
git commit -m "fix: resolve P[N] post-implementation review findings"
```

### Step 9: Final Verification Pass

After all fixes are applied, run a targeted re-check on modified files only
using Superpowers code-reviewer (fastest channel).

Identify modified files:

```bash
git diff --name-only HEAD~1..HEAD  # adjust range to cover all fix commits
```

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
`docs/reviews/post-implementation-review.md` by replacing "Fix Log" placeholder:

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
```

- [ ] **Step 2: Verify the section was appended**

```bash
grep -n "Step 10: Confirm Completion" tools/post-implementation-review.md
```

Expected: A line number is returned.

- [ ] **Step 3: Commit**

```bash
git add tools/post-implementation-review.md
git commit -m "feat: add fix execution, verification, and completion to post-implementation-review tool"
```

---

### Task 10: Write Tool — Fallback, Process Rules, After This Step

**Files:**
- Modify: `tools/post-implementation-review.md`

- [ ] **Step 1: Append the final sections**

Append to `tools/post-implementation-review.md`:

```markdown

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
```

- [ ] **Step 2: Confirm the tool file is complete**

```bash
wc -l tools/post-implementation-review.md
grep -c "^###" tools/post-implementation-review.md
```

Expected: 300+ lines total, 10+ `###` headings (Steps 1–10 plus sub-sections).

- [ ] **Step 3: Commit**

```bash
git add tools/post-implementation-review.md
git commit -m "feat: complete post-implementation-review tool source file"
```

---

### Task 11: Generate Command File and Verify Tests Pass

**Files:**
- Generate: `commands/post-implementation-review.md`

- [ ] **Step 1: Run the scaffold build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors. The build output should list
`post-implementation-review` among generated commands.

If the build fails with a TypeScript error, read the error message, find the
affected file, and fix the issue before continuing.

- [ ] **Step 2: Verify the command file was generated**

```bash
ls -la commands/post-implementation-review.md
head -6 commands/post-implementation-review.md
```

Expected: File exists. Head shows frontmatter with `description:` and `long-description:` fields.

- [ ] **Step 3: Run the bats tests**

```bash
bats tests/post-implementation-review.bats
```

Expected: All 12 tests pass.

If any tests fail, diagnose which assertion failed:
- "command file does not exist" → build didn't generate the file; re-check Step 1
- "Phase 1 not found" → the tool file section name doesn't match; fix the tool file and rebuild
- Any other failure → fix the relevant section in `tools/post-implementation-review.md`, run `npm run build`, re-test

- [ ] **Step 4: Run frontmatter validation on all commands**

```bash
make validate
```

Expected: Exits 0 with no errors.

If validation fails on the new command: the generated file is missing a `description:` field.
Check `tools/post-implementation-review.md` frontmatter — the `description` field must be present.

- [ ] **Step 5: Commit the generated command**

```bash
git add commands/post-implementation-review.md
git commit -m "build: generate post-implementation-review command via scaffold build"
```

---

### Task 12: Run Full Quality Gate

- [ ] **Step 1: Run `make check`**

```bash
make check
```

Expected: All gates pass — lint, validate, test, eval.

- [ ] **Step 2: Fix any failures**

**If `make lint` fails:**
```bash
shellcheck --severity=warning scripts/<failing-script>.sh
```
Read the warning, fix the shell script, re-run `make lint`.

**If `make validate` fails:**
Read the error — it will name the file and the missing field. Fix the frontmatter in the
named file and re-run `make validate`.

**If `make test` fails:**
Read the failing test name. If it's in `tests/post-implementation-review.bats`, the generated
command is missing expected content — fix `tools/post-implementation-review.md`, rebuild, re-test.
If it's a different test file, investigate that test independently.

**If `make eval` fails:**
Read the failing eval in `tests/evals/`. Evals check cross-system consistency. Investigate
whether the new tool is causing a consistency violation and fix accordingly.

After any fix, re-run `make check` to confirm all gates pass.

- [ ] **Step 3: Commit if any fixes were applied in Step 2**

```bash
git add -p  # stage only the relevant changed files
git commit -m "fix: address make check failures for post-implementation-review"
```

If no fixes were needed, skip this step.
