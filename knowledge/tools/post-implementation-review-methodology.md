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
