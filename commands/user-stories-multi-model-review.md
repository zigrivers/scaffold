---
description: "Multi-model review of user stories for PRD coverage"
long-description: "Dispatches user stories to independent AI models (Codex, Gemini) for parallel coverage audits, then synthesizes findings into an actionable review."
---

Run independent Codex and Gemini reviews of `docs/user-stories.md` against the PRD to eliminate single-model blind spots. This is a quality gate that enforces 100% PRD coverage with hard traceability — every atomic PRD requirement must map to at least one user story.

## Mode Detection

Before starting, check if `docs/reviews/user-stories/review-summary.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing review artifacts (`docs/reviews/user-stories/requirements-index.md`, `docs/reviews/user-stories/coverage.json`, `docs/reviews/user-stories/review-summary.md`). Check for a tracking comment on line 1 of `review-summary.md`: `<!-- scaffold:user-stories-mmr v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing artifacts against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing artifacts
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific decisions and prior review findings
3. **Cross-doc consistency**: Read `docs/user-stories.md` and `docs/plan.md` and verify updates won't contradict them.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   Wait for user approval before proceeding.
5. **Execute update**: Re-run the full review pipeline. Preserve prior findings that are still valid.
6. **Update tracking comment**: Add/update on line 1 of `review-summary.md`: `<!-- scaffold:user-stories-mmr v<ver> <date> -->`
7. **Post-update summary**: Report what changed since the last review.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/reviews/user-stories/review-summary.md`
- **Secondary output**: `docs/reviews/user-stories/requirements-index.md`, `docs/reviews/user-stories/coverage.json`, `docs/reviews/user-stories/codex-review.json`, `docs/reviews/user-stories/gemini-review.json`
- **Preserve**: Prior review findings still valid, requirement IDs (REQ-xxx), custom coverage mappings
- **Related docs**: `docs/plan.md`, `docs/user-stories.md`
- **Special rules**: **Never renumber requirement IDs** — coverage.json references them. New requirements get the next available ID in sequence.

---

## Goals
- **100% PRD coverage** — every atomic requirement in the PRD maps to at least one user story
- **AI-implementation readiness** — stories are unambiguous enough for AI agents to implement without clarification
- **Multi-model validation** — independent reviewers catch blind spots that a single model misses

## Hard Scope Boundary
- **No new features** — reviewers critique existing stories, they don't invent new product capabilities
- **Preserve all story IDs** — US-xxx IDs are referenced by Beads tasks and implementation plans
- **Single-writer rule** — only Claude edits `docs/user-stories.md`. Codex and Gemini only critique.

## Prerequisites

Before starting, verify:

1. **Required files exist**:
   - `docs/plan.md` — the PRD
   - `docs/user-stories.md` — user stories from Steps 14-15
2. **At least one review CLI is available** (check with `command -v`):
   - `codex` — Codex CLI (install: `npm install -g @openai/codex`)
   - `gemini` — Gemini CLI (install: `npm install -g @google/gemini-cli`)
3. **CLI authentication**:
   - Codex: ChatGPT subscription login (`codex` uses subscription credits, not API billing)
   - Gemini: Google account login (`gemini` uses subscription quota, not API billing)

If neither CLI is available, tell the user and stop — this prompt requires at least one external reviewer.

## Outputs

All review artifacts go under `docs/reviews/user-stories/`:

| File | Description |
|------|-------------|
| `requirements-index.md` | Atomic PRD requirements with IDs (REQ-001, REQ-002, ...) |
| `coverage.json` | Requirement → story mapping |
| `codex-review.json` | Raw Codex review findings (if available) |
| `gemini-review.json` | Raw Gemini review findings (if available) |
| `review-summary.md` | Reconciled findings, actions taken, final coverage status |

Additionally updates: `docs/user-stories.md` (fixes applied by Claude)

---

## Step 0: Create Beads Task

```
bd create "review: user stories multi-model review" -p 0
bd update <id> --claim
```

## Step 1: Build Atomic PRD Requirements Index

Read `docs/plan.md` thoroughly. Extract every distinct, testable requirement into an atomic list.

Create `docs/reviews/user-stories/requirements-index.md`:

```markdown
<!-- scaffold:user-stories-mmr v1.0 YYYY-MM-DD -->
# PRD Requirements Index

Atomic requirements extracted from docs/plan.md for traceability.

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-001 | Users can create an account with email and password | User Authentication | Must |
| REQ-002 | Users can reset their password via email link | User Authentication | Must |
| ... | ... | ... | ... |
```

Rules:
- One requirement per row — split compound requirements ("X and Y") into separate rows
- Each requirement must be testable (a developer could write a pass/fail test for it)
- Include implicit requirements (error handling, validation, accessibility) if the PRD implies them
- Priority comes from PRD emphasis (Must/Should/Could/Won't)

## Step 2: Create Coverage Map

Map each requirement to the user story (or stories) that cover it.

Create `docs/reviews/user-stories/coverage.json`:

```json
{
  "generated": "YYYY-MM-DD",
  "total_requirements": 47,
  "covered": 45,
  "uncovered": 2,
  "requirements": {
    "REQ-001": {
      "text": "Users can create an account with email and password",
      "stories": ["US-001", "US-002"],
      "status": "covered"
    },
    "REQ-042": {
      "text": "App sends push notification on task reminder",
      "stories": [],
      "status": "uncovered"
    }
  }
}
```

If any requirements are uncovered at this point, note them but continue — the external reviews will independently verify coverage.

## Step 3: Run External Reviews

Run `scripts/user-stories-mmr.sh` to execute Codex and Gemini reviews in parallel:

```bash
./scripts/user-stories-mmr.sh
```

The script:
- Bundles PRD + requirements index + coverage map + user stories into a review package
- Runs Codex CLI with schema-enforced output → `codex-review.json`
- Runs Gemini CLI with prompt-engineered JSON → `gemini-review.json`
- Validates both outputs against the JSON schema
- Reports results

If the script fails for one tool, it continues with the other. If both fail, proceed to Step 4 with whatever partial results exist.

**Do NOT edit the review JSON files** — they are raw evidence from independent reviewers.

## Step 4: Reconcile Reviews & Apply Fixes

Read both review JSONs (whichever are available). For each finding:

### 4a. Triage findings

Create a reconciliation table:

| Finding | Source | Severity | Action |
|---------|--------|----------|--------|
| REQ-014 uncovered | Both | high | Add story |
| US-007 vague AC | Codex only | medium | Rewrite AC |
| US-003/US-017 overlap | Gemini only | low | Clarify boundaries |

Rules:
- **Both models agree** → high confidence, apply fix
- **One model only, severity critical/high** → apply fix
- **One model only, severity medium/low** → use judgment; present to user if uncertain
- **Contradictory findings** → present both to user, let them decide

### 4b. Apply fixes to user-stories.md

For each accepted finding:
- **Missing requirements**: Add new user stories with the next available US-xxx ID
- **Story issues**: Fix acceptance criteria, scope boundaries, data requirements in-place
- **Contradictions**: Resolve by aligning story with PRD (PRD is source of truth)
- **Overlaps**: Clarify boundaries or consolidate (preserve IDs of consolidated stories)

Use AskUserQuestionTool for any findings where the right action isn't clear.

## Step 5: Quality Gate — Verify Coverage

Update `docs/reviews/user-stories/coverage.json` with the post-fix state.

**The quality gate**: `coverage.json` must show zero uncovered requirements.

If any requirements remain uncovered after applying fixes:
1. List the uncovered requirements
2. Ask the user whether to add stories for them or mark them as intentionally deferred
3. If deferred, add a `"status": "deferred"` with a `"reason"` field in coverage.json

## Step 6: Write Review Summary

Create `docs/reviews/user-stories/review-summary.md`:

```markdown
<!-- scaffold:user-stories-mmr v1.0 YYYY-MM-DD -->
# User Stories Multi-Model Review Summary

## Review Metadata
- **Date**: YYYY-MM-DD
- **Reviewers**: Codex CLI, Gemini CLI (or whichever were available)
- **Stories reviewed**: N
- **PRD requirements**: N
- **Pre-review coverage**: X/Y (Z%)
- **Post-review coverage**: Y/Y (100%)

## Findings Summary

| Category | Codex | Gemini | Agreed | Applied |
|----------|-------|--------|--------|---------|
| Missing requirements | N | N | N | N |
| Story issues | N | N | N | N |
| Contradictions | N | N | N | N |
| Overlaps | N | N | N | N |

## Actions Taken

### Stories Added
- US-xxx: [title] — covers REQ-xxx

### Stories Modified
- US-xxx: [what changed and why]

### Findings Deferred
- [any findings not actioned, with rationale]

## Coverage Verification
- Total PRD requirements: N
- Covered by user stories: N
- Uncovered: 0 (or list deferred items)
- Confidence: X%
```

## Step 7: Close Beads Task

```
bd close <id>
```

## Process
- Create a Beads task for this work before starting (Step 0)
- When complete and committed, close it (Step 7)
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- The single-writer rule is absolute: Codex and Gemini produce JSON critiques, only Claude modifies `docs/user-stories.md`
- Present reconciliation decisions to the user when findings conflict or severity is ambiguous
- All review artifacts are committed to the repo for auditability

## After This Step

When this step is complete, tell the user:

---
**Phase 5 in progress** — User stories reviewed by independent models, coverage verified against PRD.

**Next:**
- If your project targets **multiple platforms** (web + mobile): Run `/scaffold:platform-parity-review` — Audit platform coverage across all docs.
- Otherwise: Skip to `/scaffold:claude-md-optimization` — Consolidate and optimize CLAUDE.md (starts Phase 6).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
