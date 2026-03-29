---
description: "Start multi-agent execution loop in a worktree"
long-description: "Sets up a named agent in an isolated git worktree so multiple agents can implement tasks simultaneously without file conflicts, each following the same TDD loop."
---

## Purpose
Start a named agent in a git worktree for parallel multi-agent execution.
Each agent operates in its own worktree, claims tasks independently, and
creates PRs that are merged back to main. This enables multiple agents to
work on different tasks simultaneously without stepping on each other.

## Inputs
- $ARGUMENTS (required) — the agent name (e.g., "alpha", "beta", "agent-1")
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
- Implemented features with passing tests from this agent's worktree
- Pull requests for each completed task
- Updated task status in playbook/plan or Beads

## Quality Criteria
- (mvp) Agent identity is established and verified (worktree environment confirmed)
- (mvp) Each task follows red-green-refactor TDD cycle
- (mvp) All quality gates pass before PR creation
- (mvp) Task claiming avoids conflicts with other agents
- (deep) Pre-flight verification confirms worktree isolation
- (deep) Between-task cleanup ensures no state leakage across tasks
- (deep) Beads actor identity is set correctly for task ownership tracking

## Methodology Scaling
- **deep**: Full pre-flight verification including worktree check, Beads actor
  identity, onboarding guide review, lessons.md per task, eval gates, detailed
  PR descriptions, between-task cleanup with dependency reinstall.
- **mvp**: Verify worktree, pick next task, TDD loop, make check, create PR.
  Skip onboarding review and between-task reinstalls if not needed.
- **custom:depth(1-5)**: Depth 1: verify worktree environment, TDD loop, make check.
  Depth 2: add dependency check and Beads identity verification. Depth 3: add
  lessons.md review and test skeleton usage. Depth 4: add onboarding guide,
  eval gates, between-task cleanup. Depth 5: full pre-flight suite, all
  quality gates, actor verification.

## Mode Detection
This is a stateless execution command. No document is created or updated.
- Always operates in EXECUTE MODE.
- If this agent already has in-progress work (feature branch with changes),
  redirect to `/scaffold:multi-agent-resume $ARGUMENTS` instead.

## Update Mode Specifics
Not applicable — this is a stateless execution command that does not produce
a persistent document.

## Instructions

You are **$ARGUMENTS**.

### Pre-Flight Verification

Before writing any code, verify the worktree environment:

1. **Worktree confirmation**
   - `git rev-parse --git-dir` — output should contain `/worktrees/` (confirms you are in a worktree, not the main repo)
   - If NOT in a worktree, stop and instruct the user to set one up:
     > Run `scripts/setup-agent-worktree.sh $ARGUMENTS` from the main repo to create a worktree for this agent.

2. **Git state check**
   - `git status` — working tree should be clean
   - `git branch --show-current` — note the current branch
   - If on a feature branch with changes, redirect to `/scaffold:multi-agent-resume $ARGUMENTS`

3. **Beads identity** (if `.beads/` exists)
   - `echo $BD_ACTOR` — should show `$ARGUMENTS`
   - If not set, the worktree setup may be incomplete

4. **Dependency check**
   - Run the install command from CLAUDE.md Key Commands
   - Confirm dependencies are current in this worktree

5. **Test suite health**
   - Run the project's check command from CLAUDE.md Key Commands
   - If tests fail before you start, fix them or flag to the user

6. **Project orientation**
   - Read `CLAUDE.md` for project conventions and key commands
   - Read `docs/onboarding-guide.md` if it exists
   - Read `tasks/lessons.md` for relevant anti-patterns

### Worktree-Specific Rules

These rules are critical for multi-agent operation:

- **Never run `git checkout main`** — it will fail because main is checked out in the main repo
- **Always branch from remote**: `git fetch origin && git checkout -b <branch-name> origin/main`
- **Between tasks, clean up**: `git fetch origin --prune && git clean -fd` then run the install command from CLAUDE.md Key Commands
- **Use unique branch names** — include the agent name or task ID to avoid conflicts with other agents

### Beads Detection

**If Beads is configured** (`.beads/` exists):
- Branch naming: `bd-<id>/<desc>`
- Run `bd ready` to see available tasks
- Pick the lowest-ID unblocked task
- Implement following the TDD workflow below
- After PR is merged: `bd close <id> && bd sync`
- Repeat with `bd ready` until no tasks remain

**Without Beads:**
- Branch naming: `<type>/<desc>` (e.g., `feat/add-auth`)
1. Read `docs/implementation-playbook.md` as the primary task execution reference.
   Fall back to `docs/implementation-plan.md` when no playbook is present.
2. Pick the first uncompleted task that has no unfinished dependencies and is not being
   worked on by another agent (check for open PRs or in-progress markers).
3. Implement following the TDD workflow below.
4. Mark the task complete in the plan/playbook.
5. Repeat in dependency order until all tasks are done.

### TDD Execution Loop

For each task:

1. **Claim the task**
   - Create a feature branch from remote main:
     `git fetch origin && git checkout -b <branch-name> origin/main`
   - If Beads: use `bd-<id>/<desc>` naming

2. **Red phase — write failing tests**
   - Check `docs/story-tests-map.md` (if it exists) to find test skeletons that correspond to this task's user stories
   - Check `tests/acceptance/` for existing test skeletons that correspond to the task
   - If skeletons exist, use them as your starting point
   - Otherwise, write test cases from the task's acceptance criteria
   - Run the test suite — confirm the new tests FAIL (red)

3. **Green phase — implement**
   - Write the minimum code to make the failing tests pass
   - Follow conventions from `docs/coding-standards.md`
   - Follow file placement from `docs/project-structure.md`
   - Run tests after each meaningful change — stop when green

4. **Refactor phase — clean up**
   - Refactor for clarity, DRY, and convention compliance
   - Run the full test suite — confirm everything still passes

5. **Quality gates**
   - Run `make check` (or equivalent from CLAUDE.md Key Commands)
   - If `tests/evals/` exists, run `make eval` (or equivalent eval command)
   - Fix any failures before proceeding

6. **Create PR**
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - Include in the PR description: what was implemented, key decisions, files changed, agent name
   - Follow the PR workflow from `docs/git-workflow.md` or CLAUDE.md

7. **Run code reviews (MANDATORY)**
   - Run `/scaffold:review-pr` with the PR number from step 6
   - This runs **all three** review channels: Codex CLI, Gemini CLI, and Superpowers code-reviewer subagent
   - All three channels must execute (skip only if a tool is genuinely not installed)
   - Fix any P0/P1 findings before proceeding
   - Do NOT move to the next task until the review summary confirms all channels ran

8. **Between-task cleanup**
   - `git fetch origin --prune && git clean -fd`
   - Run the install command from CLAUDE.md Key Commands
   - This ensures a clean state before the next task

### Recovery Procedures

**Worktree not set up:**
- Instruct the user to run: `scripts/setup-agent-worktree.sh $ARGUMENTS`
- Or reference `docs/git-workflow.md` section 7 for manual worktree setup

**`git checkout main` fails:**
- This is expected in a worktree. Use `git fetch origin && git checkout -b <branch> origin/main` instead.

**Merge conflicts on PR:**
- `git fetch origin && git rebase origin/main`
- Resolve conflicts, re-run tests, force-push the branch

**Another agent claimed the same task:**
- If Beads: `bd sync` will reveal the conflict — pick a different task
- Without Beads: check open PRs (`gh pr list`) for overlapping work
- Move to the next available unblocked task

**Dependency install fails after cleanup:**
- `git clean -fd` may have removed generated files — re-run the full install sequence
- If persistent, check if another agent's merge changed the dependency file

**Tests fail after fetching latest origin:**
- Determine if failure is from your changes or recently merged work
- If from merged work: fix or flag before continuing
- If from your changes: debug and fix

### Process Rules

1. **Verify worktree first** — Never start implementation without confirming you are in a worktree.
2. **Branch from remote, not local** — Always use `origin/main` as the branch point.
3. **Clean between tasks** — Run cleanup after each task to prevent state leakage.
4. **TDD is not optional** — Write failing tests before implementation. No exceptions.
5. **Quality gates before PR** — Never create a PR with failing checks.
6. **Code review before next task** — After creating a PR, run `/scaffold:review-pr` and fix all P0/P1 findings before moving on. All three review channels (Codex, Gemini, Superpowers) must execute.
7. **Avoid task conflicts** — Check what other agents are working on before claiming.
8. **Follow CLAUDE.md** — It is the authority on project conventions and commands.

---

## After This Step

When this step is complete (all tasks done or session ending), tell the user:

---
**Agent $ARGUMENTS execution session complete.**

**Session summary:**
- Tasks completed: [list task IDs/titles]
- PRs created: [list PR numbers]
- Remaining tasks: [count or "none"]

**If resuming later:** Run `/scaffold:multi-agent-resume $ARGUMENTS` to pick up where this agent left off.

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

---

### worktree-management

*Git worktree patterns for parallel multi-agent execution*

# Worktree Management

Expert knowledge for managing git worktrees to enable parallel multi-agent execution. Covers setup, branching conventions, inter-task cleanup, and safe teardown procedures.

## Summary

### Setup

Use `scripts/setup-agent-worktree.sh <agent-name>` to create a worktree at `../<project>-<agent-name>/`. Each agent gets its own isolated working directory and workspace branch.

### Branching Conventions

- Each agent operates on a workspace branch (e.g., `agent-1-workspace`)
- Feature branches are created from `origin/main` — never from local `main`
- Never run `git checkout main` inside a worktree — it will fail because `main` is checked out in the primary repo

### Cleanup

After all agents finish, remove worktrees and prune stale references. Delete merged feature branches in batch to keep the repository clean.

## Deep Guidance

### Setup — Extended

**Creating a worktree:**

```bash
# From the main repository
scripts/setup-agent-worktree.sh agent-1

# This creates:
#   ../<project>-agent-1/     (working directory)
#   Branch: agent-1-workspace  (workspace branch)
```

**What the setup script does:**
1. Creates a new worktree directory adjacent to the main repo
2. Creates a workspace branch for the agent
3. Sets up the working directory with a clean state
4. Installs dependencies if a package manager is detected

**Multiple agents:**

```bash
scripts/setup-agent-worktree.sh agent-1
scripts/setup-agent-worktree.sh agent-2
scripts/setup-agent-worktree.sh agent-3
```

Each agent has a completely isolated working directory. They share the same `.git` object store but have separate working trees, index files, and HEAD pointers.

### Workspace Branch Conventions

Each agent gets a persistent workspace branch that serves as its "home base":

- `agent-1-workspace`, `agent-2-workspace`, etc.
- The workspace branch is where the agent returns between tasks
- Feature branches for individual tasks are created from `origin/main`, not from the workspace branch

**Why workspace branches exist:**
- A worktree requires a branch that isn't checked out elsewhere
- The workspace branch prevents conflicts with `main` (which is checked out in the primary repo)
- It provides a stable base for the agent to return to between tasks

### Branching — Extended

**Creating a feature branch for a task:**

```bash
# Inside the agent's worktree
git fetch origin
git checkout -b bd-42/add-user-endpoint origin/main
```

**Critical rules:**
- Always branch from `origin/main` — never from local `main` (it may be stale) and never from the workspace branch
- Branch naming: `bd-<id>/<short-desc>` when using Beads, or `feat/<task-id>-<slug>` otherwise
- One branch per task — never combine multiple tasks on a single branch

**Never run `git checkout main` in a worktree:**
- The `main` branch is checked out in the primary repo
- Git does not allow the same branch to be checked out in multiple worktrees
- This command will fail with an error; if you need main's content, use `origin/main`

### Between Tasks

After completing a task (PR created and CI passing), prepare for the next one:

```bash
# Fetch latest state from remote
git fetch origin --prune

# Switch back to workspace branch
git checkout agent-1-workspace

# Clean up untracked files and directories
git clean -fd

# Reinstall dependencies (important if package files changed on main)
# npm install / pip install -r requirements.txt / etc.
```

**Why this matters:**
- `git fetch --prune` ensures you see newly merged branches and removed remote branches
- `git clean -fd` removes artifacts from the previous task
- Dependency reinstallation catches changes merged by other agents

### Rebase Strategy

Before creating a PR, rebase your feature branch onto the latest `origin/main`:

```bash
git fetch origin
git rebase origin/main
```

**Why rebase instead of merge:**
- Produces a linear history on the feature branch
- Makes the PR diff cleaner (only your changes, no merge commits)
- Squash-merge to main produces a single clean commit

**If rebase conflicts arise:**
1. Read the conflict carefully — understand which agent's changes conflict with yours
2. If the conflict is in files you modified, resolve it preserving both changes where possible
3. If the conflict is in files you didn't modify, investigate — you may have an undetected dependency on another task
4. After resolving, run the full test suite to verify nothing broke
5. If the conflict is too complex, ask for help rather than guessing

### Conflict Resolution

**Common conflict scenarios in multi-agent work:**

| Scenario | Resolution |
|----------|------------|
| Two agents add to the same file (e.g., new exports) | Merge both additions |
| Two agents modify the same function | Deeper analysis needed — may indicate a missing dependency |
| Schema migration conflicts | Renumber the later migration |
| Lock file conflicts | Delete lock file, reinstall, commit new lock file |

### Cleanup — Extended

**Removing a single worktree:**

```bash
# From the main repository (not from inside the worktree)
git worktree remove ../<project>-agent-1
```

**Pruning stale worktree references:**

```bash
git worktree prune
```

Run this after removing worktrees or if a worktree directory was deleted manually.

**Batch cleanup of merged feature branches:**

```bash
git fetch origin --prune
git branch --merged origin/main | grep "bd-" | xargs -r git branch -d
```

This deletes all local branches that have been merged to `origin/main` and match the `bd-` prefix. Safe because `--merged` ensures only fully-merged branches are deleted, and `-d` (not `-D`) refuses to delete unmerged branches.

**Cleanup of workspace branches:**

After all agents are done and their worktrees are removed:

```bash
git branch | grep "workspace" | xargs -r git branch -D
```

Use `-D` here because workspace branches are not merged — they're disposable.

### BD_ACTOR Environment Variable

When using Beads for task tracking, set `BD_ACTOR` per agent for attribution:

```bash
export BD_ACTOR="agent-1"
```

This ensures that task claims, completions, and other Beads operations are attributed to the correct agent. Set it in the agent's shell environment before starting work.

### Listing Active Worktrees

To see all active worktrees and their branches:

```bash
git worktree list
```

Output shows the path, HEAD commit, and branch for each worktree. Use this to verify agent setup and identify stale worktrees.

## See Also

- [git-workflow-patterns](../core/git-workflow-patterns.md) — Branching strategy, commit conventions, PR workflow
- [task-claiming-strategy](./task-claiming-strategy.md) — Task selection and multi-agent coordination
