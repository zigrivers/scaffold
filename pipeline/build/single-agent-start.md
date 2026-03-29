---
name: single-agent-start
description: Start single-agent TDD execution loop
phase: "build"
order: 1510
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [tdd-execution-loop, task-claiming-strategy]
reads: [coding-standards, tdd, git-workflow]
---

## Purpose
Start the single-agent TDD execution loop. This is the primary entry point
for implementation work when one agent works through the task list
sequentially. The agent claims the next available task, writes failing tests,
implements until green, creates a PR, and repeats until all tasks are
complete.

## Inputs
- CLAUDE.md (required) — project conventions, key commands, workflow
- docs/implementation-playbook.md (required if exists) — primary task execution reference with wave assignments and per-task context
- docs/implementation-plan.md (fallback) — task list when no playbook exists
- docs/onboarding-guide.md (optional) — project context for orientation
- docs/coding-standards.md (required) — code conventions, naming, patterns
- docs/tdd-standards.md (required) — test categories, mocking strategy, test file locations
- docs/project-structure.md (required) — where files live
- tests/acceptance/ (optional) — TDD test skeletons for red-green-refactor starting points
- tests/evals/ (optional) — project eval checks for quality gates
- tasks/lessons.md (optional) — previous lessons learned to avoid repeating mistakes
- .beads/ (conditional) — Beads task tracking if configured

## Expected Outputs
- Implemented features with passing tests
- Pull requests for each completed task
- Updated task status in playbook/plan or Beads

## Quality Criteria
- (mvp) Pre-flight checks pass before starting any implementation work
- (mvp) Each task follows red-green-refactor TDD cycle
- (mvp) All quality gates pass before PR creation (make check + make eval if available)
- (mvp) Task status is updated after each completion
- (deep) Test skeletons from tests/acceptance/ are used as starting points when available
- (deep) lessons.md is consulted before each task for relevant anti-patterns
- (deep) PR description includes implementation summary, assumptions, and files modified

## Methodology Scaling
- **deep**: Full pre-flight verification, read onboarding guide, consult lessons.md
  before each task, use test skeletons, run evals, detailed PR descriptions with
  implementation notes and assumptions.
- **mvp**: Quick git/dependency check, read playbook or plan, pick next task,
  TDD loop, make check, create PR. Skip onboarding guide review and detailed
  PR annotations.
- **custom:depth(1-5)**: Depth 1-2: minimal pre-flight, TDD loop, make check.
  Depth 3: add lessons.md review and test skeleton usage. Depth 4: add
  onboarding guide, eval gates, detailed PR descriptions. Depth 5: full
  pre-flight suite, all quality gates, cross-reference with upstream docs.

## Mode Detection
This is a stateless execution command. No document is created or updated.
- Always operates in EXECUTE MODE.
- If work is already in progress (feature branch exists, uncommitted changes),
  redirect to `/scaffold:single-agent-resume` instead.

## Update Mode Specifics
Not applicable — this is a stateless execution command that does not produce
a persistent document.

## Instructions

### Pre-Flight Verification

Before writing any code, verify the environment is ready:

1. **Git state check**
   - `git status` — working tree should be clean (no uncommitted changes)
   - `git branch --show-current` — should be on `main` or a fresh branch
   - If on a feature branch with changes, stop and suggest `/scaffold:single-agent-resume` instead

2. **Dependency check**
   - Run the install command from CLAUDE.md Key Commands (e.g., `npm install`, `pip install`, `bundle install`)
   - Confirm dependencies are current

3. **Test suite health**
   - Run the project's check command from CLAUDE.md Key Commands (e.g., `make check`)
   - If tests fail before you start, fix them first or flag to the user

4. **Project orientation**
   - Read `CLAUDE.md` for project conventions and key commands
   - Read `docs/onboarding-guide.md` if it exists (first session orientation)
   - Read `tasks/lessons.md` for relevant anti-patterns and gotchas

### Beads Detection

Check if `.beads/` directory exists.

**If Beads is configured:**
- Run `bd ready` to see available tasks
- Pick the lowest-ID unblocked task
- Implement following the TDD workflow below
- After PR is merged, run `bd close <id> && bd sync`
- Repeat with `bd ready` until no tasks remain

**Without Beads:**
1. Read `docs/implementation-playbook.md` as the primary task execution reference.
   Fall back to `docs/implementation-plan.md` when no playbook is present.
2. Pick the first uncompleted task that has no unfinished dependencies.
3. Implement following the TDD workflow below.
4. Mark the task complete in the plan/playbook.
5. Repeat in dependency order until all tasks are done.

### TDD Execution Loop

For each task:

1. **Claim the task**
   - Create a feature branch: `git checkout -b <type>/<description>` (e.g., `feat/add-auth`)
   - If Beads: branch as `bd-<id>/<desc>`

2. **Red phase — write failing tests**
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
   - Include in the PR description: what was implemented, key decisions, files changed
   - Follow the PR workflow from `docs/git-workflow.md` or CLAUDE.md

7. **Update status**
   - If Beads: task status is managed via `bd` commands
   - Without Beads: mark the task as complete in the plan/playbook

### Recovery Procedures

**Tests fail before starting:**
- Run the test suite and read the output carefully
- If failures are in existing tests (not your changes), fix them first
- If failures are environment-related, run the install/setup commands from CLAUDE.md

**Merge conflicts on PR:**
- `git fetch origin && git rebase origin/main`
- Resolve conflicts, re-run tests, force-push the branch

**Quality gate failures after implementation:**
- Read the failure output — most failures have clear fix instructions
- Fix lint/format issues first (often auto-fixable)
- Fix test failures next
- Re-run the full gate before pushing

**Stuck on a task:**
- Re-read the task description, acceptance criteria, and any linked docs
- Check `tasks/lessons.md` for similar past issues
- If truly blocked, note the blocker and move to the next unblocked task

### Process Rules

1. **TDD is not optional** — Write failing tests before implementation. No exceptions.
2. **One task at a time** — Complete the current task fully before starting the next.
3. **Quality gates before PR** — Never create a PR with failing checks.
4. **Update status immediately** — Mark tasks complete as soon as the PR is created.
5. **Consult lessons.md** — Check for relevant anti-patterns before each task.
6. **Follow CLAUDE.md** — It is the authority on project conventions and commands.

---

## After This Step

When this step is complete (all tasks done or session ending), tell the user:

---
**Execution session complete** — Tasks implemented with passing tests and PRs created.

**Session summary:**
- Tasks completed: [list task IDs/titles]
- PRs created: [list PR numbers]
- Remaining tasks: [count or "none"]

**If resuming later:** Run `/scaffold:single-agent-resume` to pick up where you left off.

**If all tasks are done:**
- Review `tasks/lessons.md` and add any patterns learned during implementation.
- Consider running `/scaffold:version-bump` for a release.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
