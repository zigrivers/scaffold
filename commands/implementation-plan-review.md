---
description: "Review task quality, coverage, dependencies, and multi-model validation"
long-description: "Performs a comprehensive review of the implementation plan: task granularity, dependency correctness, coverage completeness, risk assessment, and (at depth 4+) independent multi-model validation via Codex/Gemini CLIs."
---

Review the implementation plan by cross-referencing `docs/plan.md`, `docs/user-stories.md`, project standards, and all tasks. Identify gaps, oversized tasks, missing coverage, dependency issues, and risks. Then fix them. At depth 4+, dispatch to independent AI models for multi-model validation.

**Beads Detection:** Check if `.beads/` directory exists. If yes, use `bd` commands to manage tasks. If no, work directly with `docs/implementation-plan.md` task list.

## Mode Detection

Before starting, check if `docs/reviews/review-tasks.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing review artifacts. Check for tracking comments: `<!-- scaffold:implementation-plan-review v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing artifacts against what this prompt would produce fresh. Categorize:
   - **ADD** — Required by current prompt but missing
   - **RESTRUCTURE** — Exists but doesn't match current structure
   - **PRESERVE** — Project-specific decisions and prior review findings
3. **Cross-doc consistency**: Read related docs and verify updates won't contradict them.
4. **Preview changes**: Present the user a summary table. Wait for approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve project-specific content.
6. **Update tracking comment**: Add/update: `<!-- scaffold:implementation-plan-review v<ver> <date> -->`
7. **Post-update summary**: Report what changed.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/reviews/review-tasks.md`
- **Secondary outputs**: `docs/reviews/implementation-plan/task-coverage.json`, `docs/reviews/implementation-plan/review-summary.md` (depth 4+)
- **Preserve**: Prior review findings still valid, task IDs, custom dependency decisions
- **Related docs**: `docs/plan.md`, `docs/user-stories.md`, `docs/implementation-plan.md`
- **Special rules**: **Never renumber or rename task IDs** — dependencies and commit messages reference them. If Beads: use `bd update` to fix task descriptions rather than recreating tasks.

## Required Reading

Read ALL of these before starting the review:

| Document | What to Check Against |
|----------|----------------------|
| `docs/plan.md` | Every feature and requirement has corresponding tasks |
| `docs/user-stories.md` | Every acceptance criterion maps to at least one task |
| `docs/implementation-plan.md` | Architecture decisions are reflected in task structure |
| `docs/project-structure.md` | File paths in tasks are correct, high-contention files have dependencies |
| `docs/tdd-standards.md` | Test requirements in tasks specify correct categories and patterns |
| `docs/coding-standards.md` | Tasks reference correct conventions |
| `docs/dev-setup.md` | Available dev commands, environment setup |
| `docs/design-system.md` (if exists) | Design tokens, component patterns for frontend tasks |
| `docs/git-workflow.md` | CI configuration, high-contention file awareness |
| `CLAUDE.md` | Workflow, priority definitions |

Then load ALL existing tasks:

**If Beads:**
```bash
bd list
bd dep tree
```

**Without Beads:** Read the task list in `docs/implementation-plan.md`.

---

## Phase 1: Coverage Audit

### 1.1 User Story → Task Mapping

For EVERY user story in `docs/user-stories.md`:

1. List each acceptance criterion
2. Identify which task(s) cover it
3. Flag any acceptance criterion with no corresponding task

**Be thorough.** The most common gaps are:
- Error handling and edge cases (user story says "show error when X" but no task handles it)
- Validation rules mentioned in acceptance criteria but not in any task description
- Secondary flows (e.g., "user can also access via Y" buried in a story)
- Non-functional requirements (performance, accessibility, security mentioned in stories)

Produce a table:

| User Story | Acceptance Criterion | Covered By Task(s) | Status |
|------------|---------------------|---------------------|--------|
| US-1 | User can log in with email/password | BD-12 | ✓ Covered |
| US-1 | Show error for invalid credentials | — | ✗ MISSING |
| US-2 | Dashboard loads in under 2 seconds | — | ✗ MISSING |

### 1.2 Plan.md → Task Mapping

For every feature or requirement in `docs/plan.md` that isn't already captured by user stories:

- Technical requirements (API rate limits, data retention, etc.)
- Infrastructure requirements (deployment, monitoring, etc.)
- Integration requirements (third-party services, webhooks, etc.)

Flag anything with no corresponding task.

### 1.3 Orphan Task Check

List any tasks that don't trace back to a user story or plan.md requirement. These are either:
- Legitimate infrastructure tasks (DB setup, CI pipeline) — verify they're necessary
- Scope creep — flag for removal

### 1.4 Coverage Matrix Artifact

Create `docs/reviews/implementation-plan/task-coverage.json` from the Phase 1 mapping:

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
      "tasks": ["BD-xxx"],
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

This artifact is consumed by Phase 7 (multi-model validation) and serves as the quality gate for AC coverage.

---

## Phase 2: Task Quality Audit

### 2.1 Task Sizing

For each task, assess whether it's completable in a single Claude Code session. Warning signs of oversized tasks:

- Description mentions 3+ files being created
- Description includes both backend and frontend work
- Description covers multiple user stories
- Description includes "and also" or "additionally" sections
- Test requirements span multiple test categories (unit AND integration AND e2e)

Flag oversized tasks with a recommended split.

### 2.2 Task Description Completeness

Each task description must include (per the implementation plan prompt):

- [ ] Acceptance criteria tied to specific user stories
- [ ] File paths per `docs/project-structure.md` (not vague locations)
- [ ] Test category (unit/integration/e2e) per `docs/tdd-standards.md`
- [ ] Test file location per the project's convention
- [ ] What to mock and what not to mock
- [ ] Key interfaces or contracts

Flag tasks missing any of these.

### 2.3 Task Title Quality

Titles should be imperative, specific, and map to commit messages:

- Flag vague titles: "Set up auth", "Handle errors", "Add tests"
- Flag horizontal titles: "Create all models", "Add routes for everything"
- Flag titles that don't indicate scope: "Update dashboard" (update what?)

---

## Phase 3: Dependency Audit

### 3.1 File Contention Check

For every pair of tasks that would be surfaced simultaneously (no dependency between them):

1. Compare the files each task will create or modify
2. If two independent tasks modify the same file, flag it

Pay special attention to high-contention files from `docs/project-structure.md`:
- Route indexes / app entry points
- Database schema / migrations
- Shared type definitions
- Configuration files
- Package manifests (package.json, requirements.txt)

### 3.2 Missing Logical Dependencies

Check for tasks that depend on something another task produces but have no dependency declared:

- Task uses a database table that another task creates
- Task imports a component/service that another task builds
- Task tests an endpoint that another task implements
- Task modifies a file that another task creates

### 3.3 Over-Constrained Dependencies

Check for unnecessary dependencies that limit parallelism:

- Task B depends on Task A, but they touch completely different files and features
- Long dependency chains where intermediate tasks could run in parallel
- Tasks that depend on a large "setup" task that could be split

### 3.4 Dependency Graph Health

**If Beads:**
```bash
bd dep tree
```

**Without Beads:** Trace the dependency annotations in `docs/implementation-plan.md`.

Check for:
- Circular dependencies (should be impossible but verify)
- Bottleneck tasks that block many downstream tasks (candidates for splitting)
- Orphan tasks with no dependencies that should have them
- Very deep chains (5+ levels) that could be parallelized more

---

## Phase 4: Standards Alignment

### 4.1 Project Structure Check

For every file path mentioned in a task description:
- Verify it follows the module organization strategy in `docs/project-structure.md`
- Verify test files are in the correct location per the project's convention
- Flag any paths that don't match the documented structure

### 4.2 Shared Code Check

- Flag any task that creates shared/common code without specifying tests for it
- Flag any task that pre-builds shared utilities before 2+ features need them (per shared code rules in project-structure.md)
- Verify infrastructure tasks are genuinely foundational, not premature abstractions

### 4.3 TDD Alignment

For each task's test requirements:
- Verify the test category matches what `docs/tdd-standards.md` prescribes for that type of code
- Verify the mocking strategy aligns with the project's mocking rules
- Flag tasks with no test requirements at all
- Flag tasks where test requirements are vague ("add tests" without specifying what kind)

---

## Phase 5: Risk Assessment

Identify the riskiest tasks and flag them for attention:

### 5.1 Uncertainty Flags

For each task, check for:
- **Technology risk**: Uses a library/API the team hasn't used before
- **Integration risk**: Touches 3+ external systems or services
- **Complexity risk**: Non-trivial algorithms, concurrency, or state management
- **Dependency risk**: On the critical path with many downstream dependents
- **Ambiguity risk**: Acceptance criteria reference undecided or unclear requirements

### 5.2 Risk Table

Produce a summary:

| Task | Risk Type | Severity | Mitigation |
|------|-----------|----------|------------|
| BD-xx | Technology — first use of WebSocket lib | High | Spike task or prototype first |
| BD-yy | Integration — 3 external APIs | Medium | Mock external APIs for dev |
| BD-zz | Critical path bottleneck (blocks 5 tasks) | High | Consider splitting |

### 5.3 Parallelism Readiness

Assess the dependency graph for agent allocation:

1. Count tasks per wave (groups with no unmet dependencies)
2. Identify the maximum useful parallelism (widest wave)
3. Flag waves where all tasks are sequential (bottleneck wave)

Produce a wave summary:

```
Wave 1: N tasks (infrastructure) — N agents useful
Wave 2: N tasks (core features) — N agents useful
Wave 3: N tasks (dependent features) — N agents useful
Wave 4: N tasks (integration/polish) — N agents useful
Maximum useful agents: N (Wave X)
```

---

## Phase 6: Present Findings and Fix

### 6.1 Summary Report

```
## Implementation Plan Review Summary

### Coverage
- User stories reviewed: X
- Acceptance criteria reviewed: X
- Criteria with task coverage: X (Y%)
- Criteria with NO coverage: X — GAPS FOUND

### Task Quality
- Total tasks: X
- Oversized (recommend split): X
- Incomplete descriptions: X
- Vague titles: X

### Dependencies
- File contention conflicts: X
- Missing logical dependencies: X
- Over-constrained dependencies: X
- Bottleneck tasks: X

### Standards Alignment
- Incorrect file paths: X
- Shared code violations: X
- TDD alignment issues: X

### Risk
- High-risk tasks: X
- Maximum useful agents: X (Wave N)
```

### 6.2 Proposed Changes

Organize changes by category. For each change, specify the exact action:

**Tasks to Add (coverage gaps):**
```
Create "feat(auth): show validation error for invalid email format" -p 1
  → Covers: US-1 acceptance criterion "Show error for invalid credentials"
  → Depends on: login endpoint task
```

**Tasks to Split (oversized):**
```
"feat(dashboard): build complete dashboard page"
  → Split into:
    1. "feat(dashboard): add session list component with pagination"
    2. "feat(dashboard): add session detail panel"
    3. "feat(dashboard): add dashboard filtering and search"
```

**Dependencies to Add (contention/logic):**
```
Task 18 depends on Task 14
  → Reason: Both modify src/features/shared/types.ts
```

**Dependencies to Remove (over-constrained):**
```
Remove dependency: Task 22 on Task 19
  → Reason: No shared files or logical dependency; can run in parallel
```

**Descriptions to Update (incomplete/incorrect):**
```
Task 14: Add test requirements — integration test for API endpoint per tdd-standards.md
Task 17: Fix file path — should be src/features/auth/services/login.ts not src/auth/login.ts
```

**Tasks to Remove (orphans/scope creep):**
```
"Add dark mode support" — not in any user story or plan.md requirement
```

**If Beads:** Use `bd create`, `bd dep add`/`bd dep remove`, `bd update` for these changes.
**Without Beads:** Update the task list in `docs/implementation-plan.md` directly.

### 6.3 Get Approval

Present the summary and proposed changes. Wait for approval before executing.

---

## Phase 7: Execute Changes

After approval:

1. Create new tasks for coverage gaps
2. Split oversized tasks (create new tasks, update dependencies, close the oversized original)
3. Add/remove dependencies
4. Update task descriptions
5. Remove orphan tasks
6. Update `docs/reviews/implementation-plan/task-coverage.json` with the post-fix state

**If Beads**, after all changes:
```bash
bd dep tree        # Verify dependency graph looks correct
bd ready           # Show the updated first wave of parallel work
```

### Post-Fix Verification

- [ ] Every user story acceptance criterion maps to at least one task
- [ ] No two tasks in the first parallel wave modify the same high-contention file
- [ ] All task descriptions include file paths, test requirements, and acceptance criteria
- [ ] No oversized tasks remain (each completable in one session)
- [ ] No orphan tasks without traceability to plan.md or user-stories.md
- [ ] Dependency graph has no bottleneck tasks blocking 4+ downstream tasks
- [ ] task-coverage.json shows zero uncovered criteria (or explicitly deferred with reason)

---

## Phase 8: Multi-Model Validation (Depth 4+)

**Skip this phase at depth 1-3. MANDATORY at depth 4+.**

At depth 4+, dispatch the reviewed implementation plan to independent AI models for additional validation. This catches blind spots that a single model misses — what Claude considers correct, Codex or Gemini may flag as problematic. Follow the invocation patterns and auth verification in the `multi-model-dispatch` skill.

### 8.1 Prerequisites

Verify at least one review CLI is available:

```bash
command -v codex && echo "codex installed" || echo "codex not found"
command -v gemini && echo "gemini installed" || echo "gemini not found"
```

If neither is available, perform a structured adversarial self-review instead (see 8.5).

### 8.2 Verify Authentication

**Previous auth failures do NOT exempt this dispatch.** Auth tokens refresh — always re-check.

```bash
# Codex
codex login status 2>/dev/null && echo "codex authenticated" || echo "codex NOT authenticated"

# Gemini
GEMINI_AUTH_CHECK=$(NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1)
GEMINI_EXIT=$?
if [ "$GEMINI_EXIT" -eq 0 ]; then echo "gemini authenticated"
elif [ "$GEMINI_EXIT" -eq 41 ]; then echo "gemini NOT authenticated (exit 41)"
else echo "gemini auth unknown (exit $GEMINI_EXIT)"
fi
```

If auth fails, tell the user and offer interactive recovery: `! codex login` or `! gemini -p "hello"`. Do NOT silently skip.

### 8.3 Run External Reviews

Run `scripts/implementation-plan-mmr.sh` to execute Codex and Gemini reviews in parallel:

```bash
./scripts/implementation-plan-mmr.sh
```

The script bundles PRD + user stories + implementation plan + project structure + TDD standards + task coverage JSON + task list + dependency tree into a review package, runs both CLIs with schema-enforced output, and validates the results.

If the script fails for one tool, it continues with the other. If both fail, proceed to 8.5.

**Do NOT edit the review JSON files** — they are raw evidence from independent reviewers.

### 8.4 Reconcile Reviews & Apply Fixes

Read both review JSONs (whichever are available). For each finding, triage:

| Scenario | Confidence | Action |
|----------|-----------|--------|
| Both models flag same issue | **High** | Fix immediately |
| Both models approve | **High** | Proceed confidently |
| One flags P0, other approves | **High** | Fix it — P0 is critical |
| One flags P1, other approves | **Medium** | Review before fixing; if specific and actionable, fix |
| Models contradict each other | **Low** | Present both to user for adjudication |

**Hard scope boundary:** Reviewers critique existing tasks — they don't invent new features. Only Claude modifies tasks (single-writer rule). Codex and Gemini only produce JSON critiques.

For each accepted finding, apply fixes:

**If Beads:**
```bash
bd dep add <child> <parent>        # File contention or logical dependency
bd dep remove <child> <parent>     # Over-constrained
bd update <id> --description "..." # Fix descriptions
bd create "title" -p <priority>    # Coverage gaps
bd close <original-id>             # After splitting oversized task
```

**Without Beads:** Update `docs/implementation-plan.md` directly.

Use AskUserQuestionTool for any findings where the right action isn't clear.

### 8.5 Fallback: Adversarial Self-Review

If neither CLI is available or both fail:

1. Re-read the implementation plan with an adversarial lens
2. Specifically look for issues the Phases 1-5 review might have missed
3. Focus on: implicit dependencies, agent context gaps, untestable acceptance criteria, file contention not caught by static analysis
4. Document findings in the same format as external review findings

### 8.6 Quality Gate

Update `docs/reviews/implementation-plan/task-coverage.json` with the post-multi-model state.

**The quality gate**: task-coverage.json must show zero uncovered acceptance criteria.

If any criteria remain uncovered:
1. List the uncovered criteria
2. Ask the user whether to add tasks or mark as intentionally deferred
3. If deferred, add `"status": "deferred"` with a `"reason"` field in task-coverage.json

### 8.7 Write Review Summary

Create `docs/reviews/implementation-plan/review-summary.md`:

```markdown
<!-- scaffold:implementation-plan-review v1.0 YYYY-MM-DD -->
# Implementation Plan Review Summary

## Review Metadata
- **Date**: YYYY-MM-DD
- **Reviewers**: Claude (Phases 1-7) + Codex CLI, Gemini CLI (Phase 8) — or whichever were available
- **Tasks reviewed**: N
- **Acceptance criteria**: N
- **Pre-review coverage**: X/Y (Z%)
- **Post-review coverage**: Y/Y (100%)

## Findings Summary

| Category | Claude | Codex | Gemini | Agreed | Applied |
|----------|--------|-------|--------|--------|---------|
| Coverage gaps | N | N | N | N | N |
| Description issues | N | N | N | N | N |
| Dependency issues | N | N | N | N | N |
| Sizing issues | N | N | N | N | N |
| Standards issues | N | N | N | N | N |
| Risk flags | N | — | — | — | N |

## Actions Taken

### Tasks Added
- BD-xxx: [title] — covers US-xxx:AC-N

### Tasks Split
- BD-xxx → BD-yyy, BD-zzz — [reason]

### Dependencies Added
- BD-xxx depends on BD-yyy — [reason]

### Dependencies Removed
- BD-xxx no longer depends on BD-yyy — [reason]

### Descriptions Updated
- BD-xxx: [what changed and why]

### Findings Deferred
- [any findings not actioned, with rationale]

## Risk Assessment
- High-risk tasks: N
- Maximum useful agents: N (Wave X)
- Critical path length: N tasks

## Coverage Verification
- Total acceptance criteria: N
- Covered by tasks: N
- Uncovered: 0 (or list deferred items)
```

---

## Process Rules

1. **Be exhaustive in Phase 1** — every acceptance criterion must be checked, not just the obvious ones
2. **Propose, don't execute** — present findings and get approval before making changes (Phase 6-7)
3. **Err toward splitting** — if you're unsure whether a task is too large, it probably is
4. **Don't add scope** — if something isn't in plan.md or user-stories.md, don't create a task for it
5. **Fix descriptions in place** — if using Beads, use `bd update` to fix task descriptions rather than recreating tasks (preserves IDs and existing dependencies)
6. **Single-writer rule** — at depth 4+, only Claude modifies tasks. Codex and Gemini produce JSON critiques only.
7. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
8. After all changes are applied, add a tracking comment to `docs/implementation-plan.md` after any existing scaffold tracking comment: `<!-- scaffold:implementation-plan-review v1 YYYY-MM-DD -->` (use actual date)

## After This Step

When this step is complete, tell the user:

---
**Planning phase complete** — Tasks reviewed, gaps filled, dependencies verified, coverage at 100%.

**Next (choose based on methodology):**
- **(Recommended)** Run `/scaffold:cross-phase-consistency` — Start the 7-check validation phase to verify documentation is internally consistent and implementation-ready.
- **(Skip validation)** For MVP or when ready to build now: Run `/scaffold:single-agent-start` or `/scaffold:multi-agent-start <agent-name>`.

**Full pipeline path:** Plan Review → Validation (7 checks) → Apply Fixes & Freeze → Onboarding Guide → Implementation Playbook → Execution

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
