---
name: single-agent-resume
description: Resume single-agent work after a break
summary: "Recovers context from the previous session — reads lessons learned, checks git state, reconciles merged PRs — and continues the TDD loop from where you left off."
phase: "build"
order: 1520
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [tdd-execution-loop, task-claiming-strategy]
reads: [coding-standards, tdd, git-workflow]
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
- **custom:depth(1-5)**: Depth 1: check current branch and continue in-progress work.
  Depth 2: add git status assessment and uncommitted change detection. Depth 3: add
  PR reconciliation and lessons.md review. Depth 4: add rebase, full test
  suite validation, onboarding review. Depth 5: full state audit with branch
  cleanup and eval gates.

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

2. **Create PR** (if not already created for in-progress work)
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - Follow the PR workflow from `docs/git-workflow.md` or CLAUDE.md

3. **Claim next task**
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
6. **Follow CLAUDE.md** — It is the authority on project conventions and commands.

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
