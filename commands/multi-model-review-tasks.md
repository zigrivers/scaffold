---
description: "Multi-model review of implementation plan tasks for coverage and quality"
---

Run independent Codex and Gemini reviews of the implementation plan task graph to catch coverage gaps, description issues, dependency problems, sizing mismatches, and architecture inconsistencies. This is a quality gate that enforces agent-implementable tasks with full acceptance criteria coverage.

## Mode Detection

Before starting, check if `docs/reviews/implementation-plan/review-summary.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing review artifacts (`docs/reviews/implementation-plan/task-coverage.json`, `docs/reviews/implementation-plan/review-summary.md`). Check for a tracking comment on line 1 of `review-summary.md`: `<!-- scaffold:implementation-plan-mmr v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing artifacts against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing artifacts
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific decisions and prior review findings
3. **Cross-doc consistency**: Read `docs/implementation-plan.md`, `docs/user-stories.md`, and `docs/plan.md` and verify updates won't contradict them.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   Wait for user approval before proceeding.
5. **Execute update**: Re-run the full review pipeline. Preserve prior findings that are still valid.
6. **Update tracking comment**: Add/update on line 1 of `review-summary.md`: `<!-- scaffold:implementation-plan-mmr v<ver> <date> -->`
7. **Post-update summary**: Report what changed since the last review.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/reviews/implementation-plan/review-summary.md`
- **Secondary output**: `docs/reviews/implementation-plan/task-coverage.json`, `docs/reviews/implementation-plan/codex-review.json`, `docs/reviews/implementation-plan/gemini-review.json`
- **Preserve**: Prior review findings still valid, BD-xxx task IDs, custom dependency decisions
- **Related docs**: `docs/plan.md`, `docs/user-stories.md`, `docs/implementation-plan.md`
- **Special rules**: **Never renumber or rename Beads task IDs** — dependencies and commit messages reference them.

---

## Goals
- **100% AC coverage** — every acceptance criterion in user stories maps to at least one task
- **Agent-implementable descriptions** — tasks are unambiguous enough for AI agents to implement without clarification
- **Dependency correctness** — no missing deps, no file contention between parallel tasks, no over-constraining
- **Single-session sizing** — every task is completable in one Claude Code session
- **Architecture coherence** — tasks are consistent with documented project structure and standards

## Hard Scope Boundary
- **No new features** — reviewers critique existing tasks, they don't invent new product capabilities
- **Preserve task IDs** — BD-xxx IDs are referenced by dependency graphs and commit messages
- **Single-writer rule** — only Claude modifies Beads tasks. Codex and Gemini only critique.

## Prerequisites

Before starting, verify:

1. **Required files exist**:
   - `docs/plan.md` — the PRD
   - `docs/user-stories.md` — user stories from Steps 14-15
   - `docs/implementation-plan.md` — implementation plan from Step 19
   - `docs/project-structure.md` — project structure
   - `docs/tdd-standards.md` — TDD standards
2. **Beads tasks exist**: `bd list` returns tasks
3. **At least one review CLI is available** (check with `command -v`):
   - `codex` — Codex CLI (install: `npm install -g @openai/codex`)
   - `gemini` — Gemini CLI (install: `npm install -g @google/gemini-cli`)
4. **CLI authentication**:
   - Codex: ChatGPT subscription login (`codex` uses subscription credits, not API billing)
   - Gemini: Google account login (`gemini` uses subscription quota, not API billing)

If neither CLI is available, tell the user and stop — this prompt requires at least one external reviewer.

## Outputs

All review artifacts go under `docs/reviews/implementation-plan/`:

| File | Description |
|------|-------------|
| `task-coverage.json` | Acceptance criterion → task mapping |
| `codex-review.json` | Raw Codex review findings (if available) |
| `gemini-review.json` | Raw Gemini review findings (if available) |
| `review-summary.md` | Reconciled findings, actions taken, final status |

Additionally updates: Beads tasks (descriptions, dependencies, splits) via `bd` commands.

---

## Step 0: Create Beads Task

```
bd create "review: implementation plan multi-model review" -p 0
bd update <id> --claim
```

## Step 1: Build Task Coverage Map

Read `docs/user-stories.md` and `bd list` output. For every acceptance criterion in every user story, identify which Beads task(s) cover it.

Create `docs/reviews/implementation-plan/task-coverage.json`:

```json
{
  "generated": "YYYY-MM-DD",
  "total_criteria": 47,
  "covered": 45,
  "uncovered": 2,
  "criteria": {
    "US-001:AC-1": {
      "story_id": "US-001",
      "criterion_text": "User can log in with email and password",
      "tasks": ["BD-scaffold-abc"],
      "status": "covered"
    },
    "US-001:AC-3": {
      "story_id": "US-001",
      "criterion_text": "Show error for invalid credentials",
      "tasks": [],
      "status": "uncovered"
    }
  }
}
```

If any criteria are uncovered at this point, note them but continue — the external reviews will independently verify coverage.

## Step 2: Export Task Data

Capture the current Beads state for the review script:

```bash
bd list > /tmp/bd-list-output.txt
bd dep tree > /tmp/bd-dep-tree-output.txt
```

The review script also captures this data automatically, but having it available helps with the reconciliation step.

## Step 3: Run External Reviews

Run `scripts/implementation-plan-mmr.sh` to execute Codex and Gemini reviews in parallel:

```bash
./scripts/implementation-plan-mmr.sh
```

The script:
- Bundles PRD + user stories + implementation plan + project structure + TDD standards + task coverage JSON + bd list output + bd dep tree output into a review package
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
| US-001:AC-3 uncovered | Both | high | Add task |
| BD-xxx vague description | Codex only | medium | Update description |
| BD-xxx/BD-yyy file contention | Gemini only | high | Add dependency |

Rules:
- **Both models agree** → high confidence, apply fix
- **One model only, severity critical/high** → apply fix
- **One model only, severity medium/low** → use judgment; present to user if uncertain
- **Contradictory findings** → present both to user, let them decide

### 4b. Apply fixes

For each accepted finding, apply the appropriate action:

**Dependencies added:**
```bash
bd dep add <child> <parent>   # File contention or logical dependency
```

**Dependencies removed:**
```bash
bd dep remove <child> <parent>   # Over-constrained
```

**Descriptions updated:**
```bash
bd update <id> --description "Updated description with file paths, test requirements, and acceptance criteria"
```

**Tasks split (oversized):**
```bash
# Create replacement tasks
bd create "first split task title" -p <priority>
bd create "second split task title" -p <priority>
# Transfer dependencies to new tasks
bd dep add <new-child> <new-parent>
# Close the oversized original
bd close <original-id>
```

**Tasks added (coverage gaps):**
```bash
bd create "task title covering the gap" -p <priority>
bd update <id> --claim
bd dep add <new-task> <dependency>
```

Use AskUserQuestionTool for any findings where the right action isn't clear.

## Step 5: Quality Gate — Verify Coverage

Update `docs/reviews/implementation-plan/task-coverage.json` with the post-fix state.

**The quality gate**: task-coverage.json must show zero uncovered acceptance criteria.

If any criteria remain uncovered after applying fixes:
1. List the uncovered criteria
2. Ask the user whether to add tasks for them or mark them as intentionally deferred
3. If deferred, add a `"status": "deferred"` with a `"reason"` field in task-coverage.json

## Step 6: Write Review Summary

Create `docs/reviews/implementation-plan/review-summary.md`:

```markdown
<!-- scaffold:implementation-plan-mmr v1.0 YYYY-MM-DD -->
# Implementation Plan Multi-Model Review Summary

## Review Metadata
- **Date**: YYYY-MM-DD
- **Reviewers**: Codex CLI, Gemini CLI (or whichever were available)
- **Tasks reviewed**: N
- **Acceptance criteria**: N
- **Pre-review coverage**: X/Y (Z%)
- **Post-review coverage**: Y/Y (100%)

## Findings Summary

| Category | Codex | Gemini | Agreed | Applied |
|----------|-------|--------|--------|---------|
| Coverage gaps | N | N | N | N |
| Description issues | N | N | N | N |
| Dependency issues | N | N | N | N |
| Sizing issues | N | N | N | N |
| Architecture issues | N | N | N | N |

## Actions Taken

### Tasks Added
- BD-xxx: [title] — covers US-xxx:AC-N

### Tasks Split
- BD-xxx → BD-yyy, BD-zzz — [reason]

### Dependencies Added
- bd dep add BD-xxx BD-yyy — [reason]

### Dependencies Removed
- bd dep remove BD-xxx BD-yyy — [reason]

### Descriptions Updated
- BD-xxx: [what changed and why]

### Findings Deferred
- [any findings not actioned, with rationale]

## Coverage Verification
- Total acceptance criteria: N
- Covered by tasks: N
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
- The single-writer rule is absolute: Codex and Gemini produce JSON critiques, only Claude modifies Beads tasks
- Present reconciliation decisions to the user when findings conflict or severity is ambiguous
- All review artifacts are committed to the repo for auditability

## After This Step

When this step is complete, tell the user:

---
**Phase 7 in progress** — Implementation tasks reviewed by independent models, coverage verified, dependencies corrected.

**Next:** Choose an execution mode:
- **Single agent:** Run `/scaffold:single-agent-start` — Start execution from the main repo.
- **Multiple agents:** Set up worktrees per `docs/git-workflow.md`, then run `/scaffold:multi-agent-start <agent-name>` in each worktree.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
