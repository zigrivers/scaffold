# Post-Implementation Review Tool — Design Spec

**Date:** 2026-03-30
**Status:** Approved

---

## Overview

A new scaffold tool (`/scaffold:post-implementation-review`) that runs a systematic
three-channel code review across an entire scaffold-generated codebase after an AI
agent has completed all implementation tasks. Unlike `review-pr` (which reviews a
git diff), this tool reviews the full implemented codebase against requirements and
coding standards.

---

## Tool Identity & Placement

| Field | Value |
|-------|-------|
| Name | `post-implementation-review` |
| Source | `tools/post-implementation-review.md` |
| Generated | `commands/post-implementation-review.md` (via `scaffold build`) |
| Category | `tool` |
| Stateless | `true` |
| Invocation | `/scaffold:post-implementation-review [--report-only]` |
| Knowledge base | `multi-model-review-dispatch`, `automated-review-tooling`, `post-implementation-review-methodology` (new) |

This is the 8th scaffold tool, sitting alongside the existing `review-pr`, `dashboard`,
`release`, `version`, etc.

### Required Inputs

- `docs/user-stories.md` — organizing manifest for Phase 2
- `docs/implementation-plan.md` — completeness reference
- `docs/coding-standards.md` — review baseline

### Optional Inputs

- `docs/architecture.md`, `docs/adrs/` — used for architecture alignment checks
- `docs/tdd-standards.md`, `docs/review-standards.md` — used if present

---

## Modes

### Default (no flag): Review + Fix

Runs all three phases end-to-end. Collects findings and immediately fixes
P0→P1→P2 before reporting completion.

### Report-Only (`--report-only`): Findings Only

Runs Phase 1 and Phase 2 fully. Writes
`docs/reviews/post-implementation-review.md`. No code is modified. The report
is the artifact for human review before deciding to proceed with fixes.

### Update Mode (auto-detected): Fix From Prior Report

If `docs/reviews/post-implementation-review.md` already exists and `--report-only`
is not set, the tool skips Phase 1 and Phase 2 and loads the prior findings
directly into Phase 3 fix execution. Saves significant time on large projects
where the user ran `--report-only` first to inspect findings before applying fixes.

If the prior report contains findings that already exhausted 3 fix rounds
(recorded in "Remaining Findings"), those are surfaced to the user immediately
at the start of Phase 3 rather than retried — the user must decide how to handle
them before the tool proceeds with any other fixes.

**Mode detection logic:**

| Condition | Mode |
|-----------|------|
| No prior report + no flag | Full review + fix |
| No prior report + `--report-only` | Full review, report only |
| Prior report exists + no flag | Update mode: fix from prior report |
| Prior report exists + `--report-only` | Full review, overwrite report |

---

## Phase 1: Cross-Cutting Sweep

Runs first. Reviews the whole codebase for systemic issues before any
feature-level analysis. All three channels run independently.

### What Each Channel Reviews

| Category | What's Checked |
|----------|----------------|
| Architecture alignment | Does code match `docs/architecture.md` and ADRs? Are layers respected? |
| Security | Auth implementation, input validation, secrets in code, OWASP Top 10 |
| Error handling | Consistency across the codebase — are errors handled or swallowed? |
| Test coverage | Are critical paths tested? Are there obvious gaps? |
| Complexity debt | Over-engineered areas, dead code, unnecessary abstractions |
| Dependency health | Unused dependencies, obviously outdated packages |

### Context Bundle (Codex & Gemini)

Codex and Gemini cannot read files directly — the orchestrating agent builds a
context bundle before dispatching them:

1. Full file tree (`find . -type f -not -path '*/node_modules/*' | sort`)
2. Key architecture docs (vision, architecture.md, ADRs)
3. `docs/coding-standards.md`
4. Up to ~15 strategically selected files: entry points, core services, auth
   layer, database layer, and 2–3 test files — selected by the orchestrating
   agent based on file names and structure
5. Instruction: "Review for systemic concerns only — architecture, security,
   error handling, coverage, complexity. Do not review individual feature logic."

### Superpowers Code-Reviewer

Runs as a subagent with full tool access. Reads files directly — no bundling
needed. Gets the same cross-cutting focus instructions.

**All three channels run independently — no channel sees another's output.**

**Output:** Structured findings per category per channel, held in memory for
Phase 3 consolidation.

---

## Phase 2: Parallel User Story Review

Reviews each user story's implementation against its acceptance criteria.
Runs in parallel across stories.

### Orchestration Flow

1. Parse `docs/user-stories.md` to extract each story and acceptance criteria
2. Orchestrating agent maps each story to relevant files (reads acceptance
   criteria + scans file/directory names)
3. Dispatch one parallel subagent per story (via `superpowers:dispatching-parallel-agents`)
4. Each subagent runs all three review channels for its story, returns findings

### What Each Per-Story Subagent Checks

- Do the implemented files satisfy the acceptance criteria?
- Are there bugs, missing cases, or incorrect behavior?
- Are edge cases handled (those called out in the story)?
- Story-specific security or validation concerns

### Context Passed to Codex/Gemini Per Story

- The user story text and acceptance criteria
- Relevant files (full contents, not a diff)
- `docs/coding-standards.md`
- Instruction: "Review these files against the acceptance criteria for this
  user story. Report P0/P1/P2 findings."

### Grouping Rules

- **Small projects (< 5 stories or very small stories):** Group related stories
  into a single subagent rather than dispatching many tiny agents
- **Large stories (> ~20 files):** Subagent splits its 3-channel review into
  logical sub-chunks (e.g., backend files → one Codex pass, frontend files →
  another) rather than one giant bundle

**Output:** Per-story findings from each subagent, held in memory for Phase 3.

---

## Phase 3: Finding Consolidation & Fix Execution

### Consolidation

1. Merge all findings from Phase 1 (systemic) and Phase 2 (per-story) into one
   flat list
2. Deduplicate: same file + same issue type = one finding, tagged with which
   channels/phases flagged it; multi-source findings get a "high confidence" tag
3. Sort: P0 → P1 → P2 (P3 recorded in report but not actioned)
4. Write `docs/reviews/post-implementation-review.md`

**If `--report-only`:** Stop here. Inform user of the report path and how to
re-run to apply fixes.

### Fix Execution (Default Mode)

- Fix all P0s first, verify each fix immediately (run relevant tests or re-read
  the modified file)
- Fix all P1s the same way
- Fix all P2s the same way
- Within each severity tier, fix high-confidence (multi-source) findings first
- Mark each finding resolved in the in-memory list as it's fixed

### The 3-Round Limit

If a finding cannot be resolved after 3 fix attempts, stop and surface it to
the user with full context. Do NOT proceed automatically. This matches the
existing `review-pr` behavior.

### Fix Verification Pass

After all fixes are applied, run a final targeted re-check — Superpowers
code-reviewer only (fastest channel) — scoped to only the modified files. Full
3-channel re-review only if this pass surfaces new P0/P1 findings.

### Report Update

After fix execution, update `docs/reviews/post-implementation-review.md` with
a Fix Log section.

---

## Output: Report Format

```markdown
# Post-Implementation Code Review

## Summary
- Date: YYYY-MM-DD
- Mode: [report-only | review+fix | update (fix from prior report)]
- Channels: Codex [status] | Gemini [status] | Superpowers [status]
- Findings: P0: X | P1: Y | P2: Z | P3: W
- Fixed: [N findings fixed | N/A — report-only]

## Phase 1: Systemic Findings
### Architecture Alignment
### Security
### Error Handling
### Test Coverage
### Complexity Debt
### Dependency Health

## Phase 2: Functional Findings
### Story: [story title]
[findings]

## Fix Log
[resolved findings with brief description of fix applied]

## Remaining Findings
[anything unresolved after 3 rounds, with context for user decision]
```

---

## New Knowledge Base Entry Needed

**`post-implementation-review-methodology`** — captures:
- The two-phase review structure and why cross-cutting runs first
- Context-bundling strategy for whole-codebase review (vs. diff-based)
- Deduplication logic (same file + issue type = one finding)
- File-to-story mapping approach
- Grouping rules for small/large projects
- The Update Mode shortcut

---

## What's Not In Scope

- Reviewing documents (PRD, user stories, architecture docs) — existing review-* commands handle those
- Performance benchmarking or load testing
- Dependency version upgrades (flagged as findings, not auto-applied)
- Reviewing files outside the project (node_modules, build artifacts)
