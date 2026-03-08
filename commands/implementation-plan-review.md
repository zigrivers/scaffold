---
description: "Review task quality, coverage, and dependencies"
long-description: "Performs a second pass on the implementation plan to verify task granularity, dependency correctness, coverage completeness, and priority assignments."
---

Review the implementation plan by cross-referencing `docs/plan.md`, `docs/user-stories.md`, project standards, and all Beads tasks. Identify gaps, oversized tasks, missing coverage, and dependency issues. Then fix them.

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

Then load ALL existing Beads tasks:
```bash
bd list
bd dep tree
```

---

## Phase 1: Coverage Audit

### 1.1 User Story → Task Mapping

For EVERY user story in `docs/user-stories.md`:

1. List each acceptance criterion
2. Identify which Beads task(s) cover it
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

List any Beads tasks that don't trace back to a user story or plan.md requirement. These are either:
- Legitimate infrastructure tasks (DB setup, CI pipeline) — verify they're necessary
- Scope creep — flag for removal

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

Titles should be imperative, specific, and map to commit messages (`[BD-<id>] title`):

- Flag vague titles: "Set up auth", "Handle errors", "Add tests"
- Flag horizontal titles: "Create all models", "Add routes for everything"
- Flag titles that don't indicate scope: "Update dashboard" (update what?)

---

## Phase 3: Dependency Audit

### 3.1 File Contention Check

For every pair of tasks that `bd ready` would surface simultaneously (no dependency between them):

1. Compare the files each task will create or modify
2. If two independent tasks modify the same file, flag it

Pay special attention to high-contention files from `docs/project-structure.md`:
- Route indexes / app entry points
- Database schema / migrations
- Shared type definitions
- Configuration files
- Package manifests (package.json, requirements.txt)

### 3.2 Missing Logical Dependencies

Check for tasks that depend on something another task produces but have no Beads dependency:

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

```bash
bd dep tree
```

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

## Phase 5: Present Findings and Fix

### 5.1 Summary Report

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
```

### 5.2 Proposed Changes

Organize changes by category. For each change, specify the exact action:

**Tasks to Add (coverage gaps):**
```
bd create "feat(auth): show validation error for invalid email format" -p 1
  → Covers: US-1 acceptance criterion "Show error for invalid credentials"
  → Depends on: BD-12 (login endpoint)
```

**Tasks to Split (oversized):**
```
BD-15 "feat(dashboard): build complete dashboard page"
  → Split into:
    1. "feat(dashboard): add session list component with pagination"
    2. "feat(dashboard): add session detail panel"
    3. "feat(dashboard): add dashboard filtering and search"
```

**Dependencies to Add (contention/logic):**
```
bd dep add BD-18 BD-14
  → Reason: Both modify src/features/shared/types.ts
```

**Dependencies to Remove (over-constrained):**
```
bd dep remove BD-22 BD-19
  → Reason: No shared files or logical dependency; can run in parallel
```

**Descriptions to Update (incomplete/incorrect):**
```
BD-14: Add test requirements — integration test for API endpoint per tdd-standards.md
BD-17: Fix file path — should be src/features/auth/services/login.ts not src/auth/login.ts
```

**Tasks to Remove (orphans/scope creep):**
```
BD-25: "Add dark mode support" — not in any user story or plan.md requirement
```

### 5.3 Get Approval

Present the summary and proposed changes. Wait for approval before executing.

---

## Phase 6: Execute Changes

After approval:

1. Create new tasks for coverage gaps
2. Split oversized tasks (create new tasks, update dependencies, close the oversized original)
3. Add/remove dependencies
4. Update task descriptions
5. Remove orphan tasks

After all changes:
```bash
bd dep tree        # Verify dependency graph looks correct
bd ready           # Show the updated first wave of parallel work
```

### Final Verification

- [ ] Every user story acceptance criterion maps to at least one task
- [ ] No two tasks in `bd ready` output modify the same high-contention file
- [ ] All task descriptions include file paths, test requirements, and acceptance criteria
- [ ] No oversized tasks remain (each completable in one session)
- [ ] No orphan tasks without traceability to plan.md or user-stories.md
- [ ] Dependency graph has no bottleneck tasks blocking 4+ downstream tasks

---

## Process Rules

1. **Be exhaustive in Phase 1** — every acceptance criterion must be checked, not just the obvious ones
2. **Propose, don't execute** — present findings and get approval before making changes
3. **Err toward splitting** — if you're unsure whether a task is too large, it probably is
4. **Don't add scope** — if something isn't in plan.md or user-stories.md, don't create a task for it
5. **Fix descriptions in place** — use `bd update` to fix task descriptions rather than recreating tasks (preserves IDs and existing dependencies)
6. After all changes are applied, add a tracking comment to `docs/implementation-plan.md` after any existing scaffold tracking comment: `<!-- scaffold:implementation-plan-review v1 YYYY-MM-DD -->` (use actual date)

## After This Step

When this step is complete, tell the user:

---
**Phase 7 in progress** — Tasks reviewed, gaps filled, dependencies verified.

**Next:**
- If you have **Codex CLI and/or Gemini CLI**: Run `/scaffold:multi-model-review-tasks` — Independent multi-model review of implementation tasks for coverage and quality.
- Otherwise: Choose an execution mode:
  - **Single agent:** Run `/scaffold:single-agent-start` — Start execution from the main repo.
  - **Multiple agents:** Set up worktrees per `docs/git-workflow.md`, then run `/scaffold:multi-agent-start <agent-name>` in each worktree.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
