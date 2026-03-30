---
description: "Create a focused task for a bug fix, refactor, or small improvement"
long-description: "Takes a one-off request (bug fix, refactor, performance tweak) and creates a single well-scoped task with acceptance criteria and a test plan — for work outside the main implementation plan."
---

## Purpose
Create a focused, implementation-ready task for a small, well-defined piece
of work — a bug fix, refactor, performance improvement, accessibility fix,
or minor refinement. Produces a single task with clear acceptance criteria
and a TDD test plan, without the full discovery process of the Enhancement
prompt.

## Inputs
- $ARGUMENTS (required) — description of the task to create
- CLAUDE.md (required) — project conventions, key commands, workflow
- docs/plan.md (optional) — PRD for requirement context
- docs/user-stories.md (optional) — existing stories and epics
- docs/coding-standards.md (required) — code conventions, naming, patterns
- docs/tdd-standards.md (required) — test categories, mocking strategy, test file locations
- docs/project-structure.md (required) — where files live, module organization
- docs/implementation-playbook.md (optional) — quality gates section for project-specific gates
- docs/system-architecture.md (optional) — for bug fixes involving component boundaries or layer violations
- docs/domain-models/ (optional) — for bug fixes involving domain logic or entity relationships
- tasks/lessons.md (optional) — previous lessons learned
- .beads/ (conditional) — Beads task tracking if configured
- Relevant source code — files that will be modified

## Expected Outputs
- One well-defined task with acceptance criteria, test plan, and implementation notes
- Task created via Beads (`bd create`) if configured, or documented inline
- Task summary presented for review

## Quality Criteria
- (mvp) Complexity gate applied — redirects to Enhancement if scope is too large
- (mvp) Acceptance criteria are testable Given/When/Then scenarios
- (mvp) Every criterion maps to at least one test case
- (mvp) File paths match project-structure.md conventions
- (mvp) Task uses conventional commit title format: type(scope): description
- (deep) Duplicate check performed against existing tasks
- (deep) lessons.md consulted for relevant anti-patterns
- (deep) Implementation notes reference specific coding standards, not generic advice
- (deep) Edge cases and regression guards included in acceptance criteria

## Methodology Scaling
- **deep**: Full complexity gate, duplicate check, lessons.md review, detailed
  acceptance criteria with edge cases and regression guards, comprehensive
  test plan with mocking strategy, specific implementation notes referencing
  coding standards.
- **mvp**: Complexity gate, basic acceptance criteria (happy path + one edge
  case), test plan with category and cases, file list. Skip duplicate check
  and detailed implementation notes.
- **custom:depth(1-5)**:
  - Depth 1: complexity gate, basic acceptance criteria (happy path only), and file list.
  - Depth 2: add one edge case to AC, test cases mapped to criteria, and test file locations.
  - Depth 3: add duplicate check, lessons.md review, regression guards.
  - Depth 4: add mocking strategy, specific coding standard references.
  - Depth 5: full analysis with innovation suggestions and cross-module impact.

## Mode Detection
This is a task-creation execution command. Task persistence depends on context:
- If Beads is configured, the task is persistent via `bd create`.
- If not, the task is documented inline for immediate execution (not persistent).
- Always operates in CREATE MODE — produces a task definition each time.

## Update Mode Specifics
Not applicable — this creates a new task each time. If a similar task already
exists, the duplicate check will surface it for the user to decide.

## Instructions

### The Request

$ARGUMENTS

---

### Phase 0: Complexity Gate

Before proceeding, evaluate whether this task is actually small enough for Quick Task. If **any** of these are true, **stop and redirect**:

1. The change requires updating `docs/plan.md` or `docs/user-stories.md`
2. The change introduces a new user-facing feature (not a fix or improvement to an existing one)
3. The change affects 3+ unrelated modules or features
4. The change requires new data model entities or schema migrations
5. The change requires competitive analysis or UX research
6. You estimate 4+ Beads tasks will be needed

**If any criteria match**, tell the user:

> This looks like an enhancement, not a quick task. Redirecting to the Enhancement prompt which handles PRD updates, user stories, and multi-task planning.
>
> Run: `/scaffold:new-enhancement <description>`

**Hard stop** — do not continue with the Quick Task flow.

---

### Phase 1: Understand & Contextualize

#### Review Project Context
Before asking questions, review:
- `CLAUDE.md` — Project conventions, Key Commands, workflow
- `docs/coding-standards.md` — Code conventions, naming, patterns
- `docs/tdd-standards.md` — Test categories, mocking strategy, test file locations
- `docs/project-structure.md` — Where files live, module organization
- `tasks/lessons.md` (if it exists) — Previous lessons learned (extract any relevant to this task)
- If `docs/implementation-playbook.md` exists, check its quality gates section for project-specific gates
- Relevant source code — Read the files that will be modified

#### Check for Duplicates
**If Beads:** Run `bd list` and check for existing tasks that overlap with this request. If a matching or overlapping task exists:
- Tell the user which task(s) already cover this work
- Ask whether to proceed (create a new task) or use the existing one
- If proceeding, note the relationship in the new task's description

#### Extract Relevant Lessons
Review `tasks/lessons.md` (if it exists) for anti-patterns, gotchas, or conventions related to:
- The area of code being modified
- The type of change (fix, refactor, perf, etc.)
- Similar past mistakes to avoid

#### Clarify Ambiguities
If anything is unclear about the request, use AskUserQuestionTool to batch all questions in a single call. Common clarifications:
- What is the expected behavior vs. current behavior? (for bugs)
- What metric or outcome defines success? (for performance)
- What should NOT change? (for refactors)

---

### Phase 2: Define the Task

#### Categorize
Determine the task type using conventional commit prefixes:
- `fix` — Bug fix (something is broken)
- `feat` — Small feature addition within an existing feature area
- `perf` — Performance improvement
- `a11y` — Accessibility fix
- `refactor` — Code restructuring with no behavior change
- `chore` — Tooling, dependencies, config
- `test` — Adding or fixing tests only
- `style` — Code style, formatting (no logic change)

#### Priority
Assign priority using Beads conventions:
- **P0** — Blocking release or breaking production
- **P1** — Must-have for current milestone
- **P2** — Should-have (default for most quick tasks)
- **P3** — Nice-to-have, backlog

#### Acceptance Criteria
Write 2-5 testable acceptance criteria in Given/When/Then format:

```
Given <precondition>
When <action>
Then <expected result>
```

Each criterion must be unambiguous — pass/fail should be obvious. Cover:
- The primary fix or change (happy path)
- At least one edge case or error state
- Any regression guard (behavior that must NOT change)

#### Files to Modify
List exact file paths from `docs/project-structure.md`:
```
Files:
- src/features/auth/services/session.ts (modify)
- src/features/auth/services/__tests__/session.test.ts (modify)
```

#### Test Plan
Reference `docs/tdd-standards.md` for the project's test conventions:
- **Test category**: unit / integration / e2e (per tdd-standards.md rules for this code area)
- **Test cases**: Map each acceptance criterion to at least one test case
- **Mocking**: What to mock and what NOT to mock (per the project's mocking strategy)
- **Test file location**: Per the project's test file convention

#### Implementation Notes
- Patterns to follow (reference specific conventions from coding-standards.md)
- Known gotchas or pitfalls (from lessons.md or code review)
- What is explicitly out of scope

---

### Phase 3: Create the Task

**If Beads:**
```bash
bd create "type(scope): description" -p <priority>
# Example: bd create "fix(auth): prevent duplicate session creation on rapid re-login" -p 2
```

**Without Beads:** Document the task inline and proceed directly to implementation.

Then set the task description with the full context from Phase 2. Include all of:

```
## Acceptance Criteria

- Given <precondition>, when <action>, then <expected result>
- ...

## Files to Modify

- path/to/file.ts (modify — reason)
- path/to/test.ts (modify — add test cases)

## Test Plan

**Category**: unit
**Cases**:
1. Test description -> validates AC #1
2. Test description -> validates AC #2
**Mocking**: Mock X, do not mock Y
**Location**: path/to/__tests__/file.test.ts

## Implementation Notes

- Follow pattern from [reference]
- Watch out for [gotcha from lessons.md]
- Out of scope: [what NOT to do]
```

---

### Phase 4: Output Summary

Present the task summary:

```
+---------------------------------------------------+
| Quick Task Created                                |
+----------+----------------------------------------+
| ID       | <task-id>                              |
| Title    | type(scope): description               |
| Priority | P<n>                                   |
| Status   | open                                   |
+----------+----------------------------------------+
| Acceptance Criteria                               |
| - Given... When... Then...                        |
| - Given... When... Then...                        |
+---------------------------------------------------+
| Files                                             |
| - path/to/file.ts                                 |
| - path/to/test.ts                                 |
+---------------------------------------------------+
| Test Plan                                         |
| - Category: unit                                  |
| - Cases: N test cases                             |
+---------------------------------------------------+
| Implementation Notes                              |
| - Key note 1                                      |
| - Key note 2                                      |
+---------------------------------------------------+
```

---

### Process Rules

1. **Respect the complexity gate** — If it is bigger than a quick task, redirect immediately. Do not try to squeeze a feature into the quick task format.
2. **One task only** — Quick Task creates exactly one Beads task. If you need multiple, use the Enhancement prompt.
3. **Check for duplicates first** — Run `bd list` before creating. Do not create tasks that already exist.
4. **Lessons.md is required reading** — Always check `tasks/lessons.md` (if it exists) for relevant anti-patterns before defining the task.
5. **Acceptance criteria drive tests** — Every criterion must map to at least one test case. If you cannot test it, rewrite the criterion.
6. **Conventional commit titles** — Always use `type(scope): description` format. This feeds directly into commit messages.

---

### When to Use This Prompt

- Bug fixes — something is broken and needs fixing
- Refactoring — restructuring code without changing behavior
- Performance improvements — targeted optimizations
- Accessibility fixes — a11y improvements to existing features
- Test gaps — adding missing test coverage
- Chores — dependency updates, config changes, tooling fixes
- Small refinements — polish within an existing feature

### When NOT to Use This Prompt

- **New features**: Use `/scaffold:new-enhancement` — new features need PRD updates and user stories
- **Multi-task work**: Use `/scaffold:new-enhancement` — if you need 4+ tasks, it is an enhancement
- **Initial project setup**: Use the pipeline from `/scaffold:create-prd` forward
- **Major refactors**: If the refactor touches 3+ unrelated modules, use `/scaffold:new-enhancement` for proper impact analysis

---

### Quality Standards

#### From `docs/tdd-standards.md`:
- Every acceptance criterion maps to at least one test case
- Test category (unit/integration/e2e) follows the project's rules for this code area
- Mocking strategy matches the project's conventions — do not over-mock or under-mock

#### From `docs/coding-standards.md`:
- File paths match `docs/project-structure.md` conventions
- Naming follows project patterns
- Implementation notes reference specific standards, not generic advice

#### Quality Gates
- Quick tasks follow the same quality gates as all other tasks — see `docs/implementation-playbook.md` § Quality Gates

#### Eval Gate
- If `tests/evals/` exists, run `make eval` (or equivalent eval command from CLAUDE.md Key Commands) as a required pre-commit check

---

### Example

Here is what the output looks like for a typical quick task:

**Request**: "The save button shows a success toast even when the API returns a 409 conflict"

```
+---------------------------------------------------+
| Quick Task Created                                |
+----------+----------------------------------------+
| ID       | abc-123                                |
| Title    | fix(editor): show error toast on       |
|          | 409 conflict during save               |
| Priority | P1                                     |
| Status   | open                                   |
+----------+----------------------------------------+
| Acceptance Criteria                               |
| 1. Given the user saves a document,               |
|    when the API returns 409 Conflict,             |
|    then an error toast "Save conflict --          |
|    someone else edited this document"             |
|    is shown instead of the success toast          |
| 2. Given the user saves a document,               |
|    when the API returns 200 OK,                   |
|    then the success toast still appears           |
|    (regression guard)                             |
| 3. Given the user sees a 409 error toast,         |
|    when they click "Refresh",                     |
|    then the latest version is fetched             |
+---------------------------------------------------+
| Files                                             |
| - src/features/editor/services/save.ts            |
| - src/features/editor/services/__tests__/         |
|   save.test.ts                                    |
+---------------------------------------------------+
| Test Plan                                         |
| - Category: unit                                  |
| - Cases: 3 (one per AC)                           |
| - Mock: HTTP client. Don't mock toast service.    |
+---------------------------------------------------+
| Implementation Notes                              |
| - save.ts catches errors but doesn't check        |
|   status codes -- add 409 handling in catch       |
| - Follow error handling pattern from              |
|   src/features/auth/services/login.ts             |
| - Out of scope: auto-merge or diff view           |
+---------------------------------------------------+
```

---

## After This Step

When this step is complete, tell the user:

---
**Quick task created** — Task ready with acceptance criteria, test plan, and implementation notes.

**After implementation:**
- If this fix revealed a pattern or gotcha: update `tasks/lessons.md`.
- If this fix changed a convention or pattern: consider updating `docs/implementation-playbook.md` and `docs/coding-standards.md`.
- After merging, consider running `/scaffold:version-bump` if the change is user-facing.

**Next:** Run `/scaffold:single-agent-start` or `/scaffold:single-agent-resume` to begin implementation (or `/scaffold:multi-agent-start <agent-name>` / `/scaffold:multi-agent-resume <agent-name>` for worktree agents).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

---

## Domain Knowledge

### task-claiming-strategy

*Task selection and management patterns for AI agent execution*

# Task Claiming Strategy

Expert knowledge for how AI agents select, claim, and manage tasks during implementation. Covers deterministic selection algorithms, dependency awareness, and multi-agent conflict avoidance patterns.

## Summary

### Task Selection Algorithm

Select the lowest-ID unblocked task. This provides deterministic, conflict-free ordering when multiple agents operate on the same task list.

### Dependency Awareness

Before starting a task, verify all its blockers are resolved. After completing each task, re-check the dependency graph — your completion may have unblocked downstream tasks.

### Multi-Agent Conflict Avoidance

- Claim the task before starting work (branch creation = claim)
- Communicate via git branches — branch existence signals ownership
- Detect file overlap in implementation plans before starting — if two tasks modify the same files, they should not run in parallel

## Deep Guidance

### Task Selection — Extended

**The algorithm:**
1. List all tasks in the backlog
2. Filter to tasks with status "ready" or "unblocked"
3. Sort by task ID (ascending)
4. Select the first task in the sorted list
5. Claim it by creating a feature branch

**Why lowest-ID first:**
- Deterministic — two agents independently applying this rule will never pick the same task (the first agent claims it, the second sees it as taken)
- Dependency-friendly — lower IDs are typically earlier in the plan and have fewer blockers
- Predictable — humans can anticipate which tasks agents will pick next

**Exceptions:**
- If the lowest-ID task requires skills or context the agent doesn't have, skip it and document why
- If a task is labeled "high priority" or "urgent," it takes precedence over ID ordering
- If a human has assigned a specific task to the agent, honor the assignment

### Dependency Awareness — Extended

**Before starting a task:**
1. Read the task's dependency list (blockers, prerequisites)
2. Verify each blocker is in "done" or "merged" state
3. If any blocker is incomplete, skip this task and select the next eligible one
4. Pull the latest main branch to ensure you have the outputs from completed blockers

**After completing a task:**
1. Check which downstream tasks list the completed task as a blocker
2. If any downstream tasks are now fully unblocked, they become eligible for selection
3. If you're continuing work, re-run the selection algorithm — the next task may have changed

**Dependency types:**
- **Hard dependency** — cannot start until blocker is merged (e.g., "implement auth" blocks "implement protected routes")
- **Soft dependency** — can start with a stub/mock, but must integrate before PR (e.g., "design API" informs "implement client," but the client can start with a contract)
- **Data dependency** — needs output artifacts from another task (e.g., database schema must exist before writing queries)

### Multi-Agent Conflict Avoidance — Extended

**Claiming a task:**
- Creating a feature branch (e.g., `bd-42/add-user-endpoint`) is the claim signal
- Other agents should check for existing branches before claiming the same task
- If two agents accidentally claim the same task, the one with fewer commits yields

**Detecting file overlap:**
- Before starting, review the implementation plan for file-level scope
- If two tasks both modify `src/auth/middleware.ts`, they should not run in parallel
- When overlap is detected: serialize the tasks (one blocks the other), or split the overlapping file into two files first

**Communication via branches:**
- Branch exists = task claimed
- Branch merged = task complete
- Branch deleted without merge = task abandoned, available for re-claim

### What to Do When Blocked

When no eligible tasks remain (all are blocked or claimed):

1. **Document the blocker** — note which task you need and what it produces
2. **Skip to the next available task** — don't wait idle; there may be non-dependent tasks further down the list
3. **Look for prep work** — can you write tests, set up scaffolding, or create stubs for the blocked task?
4. **If truly nothing is available** — report status and wait for new tasks to become unblocked

**Never:**
- Start a blocked task hoping the blocker will finish soon
- Work on the same task as another agent without coordination
- Sit idle without communicating status

### Conditional Beads Integration

Beads is an optional task-tracking tool. Detect its presence and adapt.

**When `.beads/` directory exists:**
- Use `bd ready` to list tasks that are ready for work
- Use `bd claim <id>` to claim a task (if available)
- Use `bd close <id>` after PR is merged to mark task complete
- Task IDs come from Beads (`bd-42`, `bd-43`, etc.)
- Branch naming follows Beads convention: `bd-<id>/<short-desc>`

**Without Beads:**
- Parse `implementation-plan.md` task list for task IDs and dependencies
- Or use the project's task tracking system (GitHub Issues, Linear, Jira)
- Branch naming uses the project's convention (e.g., `feat/US-001-slug`)
- Task status is tracked via PR state: open PR = in progress, merged PR = done

### Task Completion Criteria

A task is complete when all of the following are true:

1. **All acceptance criteria met** — every criterion listed in the task description is satisfied
2. **Tests passing** — new tests written for the task, plus the full existing suite, all pass
3. **PR created** — code is pushed and a pull request is open with a structured description
4. **CI passing** — all automated quality gates pass on the PR
5. **No regressions** — existing functionality is unchanged unless the task explicitly modifies it

Only after all five criteria are met should the task be marked as done.

## See Also

- [tdd-execution-loop](./tdd-execution-loop.md) — Red-green-refactor cycle and commit timing
- [worktree-management](./worktree-management.md) — Parallel agent worktree setup
- [task-tracking](../core/task-tracking.md) — Task tracking systems and conventions
