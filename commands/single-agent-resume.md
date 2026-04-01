---
description: "Resume single-agent work after a break"
long-description: "Recovers context from the previous session — reads lessons learned, checks git state, reconciles merged PRs — and continues the TDD loop from where you left off."
---

## Purpose
Resume single-agent implementation work after a break — whether from a
context window reset, a paused session, or returning the next day. Recovers
session context by checking git state, task status, and open PRs, then
continues the TDD execution loop from where you left off.

## Inputs
- CLAUDE.md (required) — project conventions, key commands, workflow
- docs/implementation-playbook.md (required if exists) — primary task execution reference
- docs/implementation-plan.md (fallback) — task list when no playbook exists
- docs/onboarding-guide.md (optional) — project context for orientation
- docs/coding-standards.md (required) — code conventions, naming, patterns
- docs/tdd-standards.md (required) — test categories, mocking strategy
- docs/project-structure.md (required) — where files live
- tests/acceptance/ (optional) — TDD test skeletons
- tests/evals/ (optional) — project eval checks for quality gates
- tasks/lessons.md (optional) — previous lessons learned
- .beads/ (conditional) — Beads task tracking if configured

## Expected Outputs
- Completed in-progress work from previous session
- Continued task implementation with passing tests
- Pull requests for each completed task
- Updated task status in playbook/plan or Beads

## Quality Criteria
- (mvp) In-progress work is identified and completed before starting new tasks
- (mvp) Merged PRs are reconciled with task status
- (mvp) Each task follows red-green-refactor TDD cycle
- (mvp) All quality gates pass before PR creation
- (deep) Git state is fully reconciled (stale branches cleaned, rebased on latest main)
- (deep) lessons.md is consulted before resuming work

## Methodology Scaling
- **deep**: Full state reconciliation, rebase on latest main, review onboarding
  guide, consult lessons.md, reconcile all open PRs, detailed PR descriptions.
- **mvp**: Quick git state check, identify in-progress work, finish or pick
  next task, TDD loop, make check, create PR.
- **custom:depth(1-5)**:
  - Depth 1: check current branch and continue in-progress work.
  - Depth 2: add git status assessment and uncommitted change detection.
  - Depth 3: add PR reconciliation and lessons.md review.
  - Depth 4: add rebase, full test suite validation, onboarding review.
  - Depth 5: full state audit with branch cleanup and eval gates.

## Mode Detection
This is a stateless execution command. No document is created or updated.
- Always operates in RESUME MODE.
- If there is no prior work (clean main, no feature branches, no task
  progress), redirect to `/scaffold:single-agent-start` instead.

## Update Mode Specifics
Not applicable — this is a stateless execution command that does not produce
a persistent document.

## Instructions

### State Recovery

Recover your context by checking the current state of work:

1. **Read project context**
   - Read `CLAUDE.md` for project conventions and key commands
   - Read `docs/onboarding-guide.md` if it exists (refresh project context)
   - Read `tasks/lessons.md` for relevant anti-patterns

2. **Git state assessment**
   - `git branch --show-current` — determine if you are on a feature branch (in-progress work) or main
   - `git status` — check for uncommitted changes or staged files
   - `git stash list` — check for stashed work
   - `git log --oneline -5` — review recent commits for context

3. **PR reconciliation**
   - `gh pr list --author="@me"` — check for open PRs
   - For each open PR, check if it has been merged: `gh pr view <number> --json state`
   - If a PR was merged while you were away, reconcile the task status (see below)

4. **Dependency sync**
   - `git fetch origin` — get latest remote state
   - Run the install command from CLAUDE.md Key Commands to ensure dependencies are current

### Beads Recovery

**If Beads is configured** (`.beads/` exists):
- `bd list` — check for tasks with `in_progress` status
- If a PR shows as merged, close the corresponding task: `bd close <id> && bd sync`
- If there is in-progress work, finish it (see "Resume In-Progress Work" below)
- Otherwise, start fresh with `bd ready` to find the next available task
- Continue working until `bd ready` shows no available tasks

**Without Beads:**
- Read `docs/implementation-playbook.md` as the primary task reference.
  Fall back to `docs/implementation-plan.md` when no playbook is present.
- If a PR shows as merged, mark the corresponding task as complete in the plan/playbook
- If there is in-progress work on your current branch, finish it
- Otherwise, pick the next uncompleted task with no unfinished dependencies

### Resume In-Progress Work

If you are on a feature branch with changes:

1. **Assess the state**
   - `git diff --stat` — what files have been changed?
   - `git log --oneline origin/main..HEAD` — what commits exist on this branch?
   - Read the task description to understand what was being worked on

2. **Rebase on latest main**
   - `git fetch origin && git rebase origin/main`
   - Resolve any conflicts, re-run tests

3. **Check test state**
   - Run the project's test suite
   - If tests pass: you may be in the refactor phase or ready for PR
   - If tests fail: determine if these are your in-progress test cases (red phase) or regressions

4. **Continue the TDD loop**
   - Pick up where the previous session left off
   - Follow the same Red-Green-Refactor cycle as in `/scaffold:single-agent-start`

### Continue to Next Task

Once in-progress work is complete (or if there was none):

1. **Quality gates**
   - Run `make check` (or equivalent from CLAUDE.md Key Commands)
   - If `tests/evals/` exists, run `make eval` (or equivalent eval command)

2. **Pre-push local code review (when requested or required)**
   - If the user says to review before committing or pushing, or the project's workflow requires a local multi-model gate before `git push`, run `scaffold run review-code`
   - This reviews the local delivery candidate without requiring a PR
   - Treat auth failures as blockers — do not commit, push, or create a PR until the user re-authenticates
   - Fix any P0/P1/P2 findings before proceeding

3. **Create PR** (if not already created for in-progress work)
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - Follow the PR workflow from `docs/git-workflow.md` or CLAUDE.md

4. **Run code reviews (MANDATORY)**
   - Run the review-pr tool: `scaffold run review-pr` (CLI) or `/scaffold:review-pr` (plugin)
   - This runs **all three** review channels on the PR diff:
     1. **Codex CLI**: `codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null`
     2. **Gemini CLI**: `NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null`
     3. **Superpowers code-reviewer**: dispatch `superpowers:code-reviewer` subagent with BASE_SHA and HEAD_SHA
   - Verify auth before each CLI (`codex login status`, `NO_BROWSER=true gemini -p "respond with ok" -o json`)
   - All three channels must execute (skip only if a tool is genuinely not installed)
   - Fix any P0/P1/P2 findings before proceeding
   - Do NOT move to the next task until all channels have run

5. **Claim next task**
   - Return to main: `git checkout main && git pull origin main`
   - Pick the next task following the same process as `/scaffold:single-agent-start`
   - Continue the TDD execution loop

### Recovery Procedures

**Uncommitted changes on a feature branch:**
- Review the changes: `git diff`
- If the changes look intentional, stage and continue implementation
- If the changes look broken or experimental, stash them: `git stash`

**Stale feature branch (main has diverged significantly):**
- `git fetch origin && git rebase origin/main`
- If conflicts are extensive, consider whether it is easier to start the task fresh
- Re-run full test suite after rebase

**PR was rejected or has requested changes:**
- `gh pr view <number>` — read the review comments
- Address the feedback on the existing branch
- Push updates and re-request review

**Task was completed by another agent (multi-agent overlap):**
- If Beads: `bd sync` will show updated task states
- Without Beads: check the plan/playbook for recently completed tasks
- Skip to the next available task

**Tests fail after pulling latest main:**
- Determine if the failure is from your changes or from recently merged work
- If from merged work: fix or flag to the user before continuing
- If from your changes: debug and fix as part of your current task

### Process Rules

1. **Always recover state first** — Never start new work without checking for in-progress tasks and merged PRs.
2. **Rebase before continuing** — Ensure your branch is up to date with main.
3. **Reconcile task status** — Merged PRs must be reflected in the task tracker.
4. **TDD is not optional** — Continue the red-green-refactor cycle for any in-progress work.
5. **Quality gates before PR** — Never create a PR with failing checks.
6. **Honor pre-push review when requested** — If the user or project workflow asks for pre-push multi-model review, run `scaffold run review-code` after quality gates and before `git push`.
7. **Code review before next task** — After creating a PR, run all three review channels (Codex CLI, Gemini CLI, Superpowers code-reviewer) and fix all P0/P1/P2 findings before moving on.
8. **Follow CLAUDE.md** — It is the authority on project conventions and commands.

---

## After This Step

When this step is complete (all tasks done or session ending), tell the user:

---
**Resume session complete** — In-progress work reconciled, tasks continued.

**Session summary:**
- Recovered state: [in-progress task or "clean start"]
- Tasks completed this session: [list task IDs/titles]
- PRs created: [list PR numbers]
- Remaining tasks: [count or "none"]

**If resuming again later:** Run `/scaffold:single-agent-resume` again.

**If all tasks are done:**
- Review `tasks/lessons.md` and add any patterns learned during implementation.
- Consider running `/scaffold:version-bump` for a release.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

---

## Domain Knowledge

### tdd-execution-loop

*Red-green-refactor execution cycle for AI agents*

# TDD Execution Loop

Expert knowledge for the core TDD execution loop that AI agents follow during implementation. This defines the disciplined red-green-refactor cycle, commit timing, and test-first practices that ensure every change is verified before it ships.

## Summary

### Red-Green-Refactor Cycle

```
  RED         GREEN        REFACTOR
  Write a  →  Write the  →  Clean up
  failing     minimal       without
  test        code to       changing
              pass it       behavior
```

Each cycle produces one small, verified increment of functionality.

### Commit Timing

- **Commit after green** — every passing test is a safe checkpoint
- **Commit after refactor** — clean code locked in before the next feature
- **Never commit red** — a failing test in history breaks bisect and reverts

### Test-First Discipline

- Always write the test before the implementation
- Verify the test actually fails (red) before writing production code
- A test that never failed might not be testing anything meaningful

## Deep Guidance

### Red-Green-Refactor Cycle — Extended

#### Red Phase: Write a Failing Test

Write a test that describes the next small piece of behavior you want to add. Run it and confirm it fails. The failure message should clearly indicate what is missing.

**Key rules:**
- The test must fail for the right reason (missing function, wrong return value — not a syntax error or import failure)
- Write only one test at a time — don't batch multiple behaviors into a single red phase
- The test name should describe the expected behavior: `returns 404 when user not found`, not `test user endpoint`

#### Green Phase: Minimal Implementation

Write the smallest amount of production code that makes the failing test pass. Do not add logic for future tests, handle edge cases you haven't tested yet, or optimize.

**Key rules:**
- If you can make the test pass by returning a hard-coded value, that's valid — the next test will force generalization
- Don't refactor during the green phase — just make it pass
- Run the full relevant test suite (not just the new test) to confirm you haven't broken anything

#### Refactor Phase: Clean Up

With all tests green, improve the code's structure, readability, and design without changing its behavior. The tests are your safety net.

**Common refactors:**
- Extract duplicate code into helper functions
- Rename variables and functions for clarity
- Simplify conditionals
- Move code to better locations (closer to where it's used)

**Key rules:**
- All tests must remain green throughout refactoring
- If a refactor breaks a test, undo and take a smaller step
- Commit after a successful refactor before starting the next red phase

### When to Commit

| Event | Commit? | Why |
|-------|---------|-----|
| Test goes green | Yes | Safe checkpoint with verified behavior |
| Refactor complete, tests still green | Yes | Lock in clean code |
| Test is red (failing) | No | Broken state in history breaks bisect |
| Mid-implementation, nothing passes yet | No | Partial work has no verified value |
| Multiple tests green at once | Yes | But prefer smaller commits |

Ideal commit cadence: every 5-15 minutes during active TDD. If you haven't committed in 30 minutes, you're taking too large a step.

### PR Creation Patterns

- **One PR per task** — a PR should map to a single task, story, or unit of work
- **Descriptive titles** — `feat(auth): add password reset flow` not `auth changes`
- **Test evidence in description** — include which tests were added, what they cover, and that they pass
- **Link to task ID** — reference the task, story, or issue that motivated the work
- **Small PRs** — prefer 50-200 lines changed; split larger work into sequential PRs

### Test-First Discipline — Extended

**Why test-first matters:**
- Forces you to think about the interface before the implementation
- Prevents writing untestable code (if you can't test it first, the design needs work)
- Creates a failing test that proves your test actually exercises the code path
- Produces a test suite where every test has been observed to fail — higher confidence

**Common violations to avoid:**
- Writing implementation first, then adding tests after (tests may not cover the actual behavior)
- Writing a test that passes immediately (it might be testing the wrong thing)
- Skipping the red step "because you know the implementation is correct" (hubris)

### Handling Flaky Tests

Flaky tests — tests that pass sometimes and fail other times — are bugs. Treat them with urgency.

**Investigation steps:**
1. Run the test in isolation 10 times to confirm flakiness
2. Check for common causes: time-dependent logic, race conditions, shared mutable state, network calls, random data
3. Fix the root cause, don't add retries

**Never:**
- Add `retry(3)` to make a flaky test pass — this hides the bug
- Mark as `skip` without filing a tracking issue
- Ignore flaky tests in CI — they erode trust in the entire suite

### Slow Test Suites

When the full test suite takes too long for rapid TDD:

**During development:**
- Run only the focused subset (tests for the module you're changing)
- Use test runner watch mode to re-run on file change
- Tag tests by level (unit, integration, e2e) and run only unit during red-green-refactor

**Before PR creation:**
- Run the full test suite locally
- Confirm CI will run the complete suite
- Don't submit a PR if you haven't verified the full suite passes

**Reducing suite time:**
- Move logic tests from integration/e2e to unit level
- Parallelize test execution
- Use transaction rollback instead of database recreation
- Profile the slowest tests and optimize or split them

### Test Isolation

Each test must be independent — it should pass or fail regardless of what other tests run before it, after it, or alongside it.

**Rules:**
- No shared mutable state between tests (global variables, class-level state, database rows from a previous test)
- Each test sets up its own preconditions and cleans up after itself
- Tests should pass when run individually, in any order, or in parallel
- Use `beforeEach`/`setUp` for common setup, not test-to-test data flow
- Avoid `beforeAll`/`setUpClass` unless the shared resource is truly read-only

**Detecting isolation violations:**
- Run tests in random order — if they fail, they have hidden dependencies
- Run a single test in isolation — if it fails only when run alone, it depends on setup from another test

### When to Stop and Ask

TDD assumes clear requirements. When requirements are unclear, continuing to write tests is wasteful. Stop and ask when:

- **Unclear requirements** — the acceptance criteria are ambiguous or contradictory
- **Architectural ambiguity** — you're unsure which module should own the behavior
- **Conflicting documentation** — the PRD says one thing, the user stories say another
- **Scope creep** — the task is growing beyond what was originally planned
- **Blocked by another task** — you need output from a task that hasn't been completed yet
- **Unfamiliar domain** — you don't understand the business rules well enough to write a meaningful test

Document what you know, what you don't, and what decision you need — then ask.

## See Also

- [testing-strategy](../core/testing-strategy.md) — Test pyramid, coverage strategy, quality gates
- [task-claiming-strategy](./task-claiming-strategy.md) — Task selection and dependency awareness

---

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
