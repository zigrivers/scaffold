---
name: multi-agent-resume
description: Resume multi-agent work after a break
summary: "Verifies the worktree, syncs with main, reconciles completed tasks, and resumes the agent's TDD loop from the previous session."
phase: "build"
order: 1540
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [tdd-execution-loop, task-claiming-strategy, worktree-management]
reads: [coding-standards, tdd, git-workflow]
argument-hint: "<agent-name>"
---

## Purpose
Resume a named agent's implementation work in its worktree after a break.
Recovers session context by verifying the worktree environment, syncing with
main, reconciling task status and open PRs, then continuing the TDD execution
loop from where the agent left off.

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
- Completed in-progress work from previous session
- Continued task implementation with passing tests
- Pull requests for each completed task
- Updated task status in playbook/plan or Beads

## Quality Criteria
- (mvp) Worktree environment is verified before resuming
- (mvp) In-progress work is identified and completed before starting new tasks
- (mvp) Merged PRs are reconciled with task status
- (mvp) Each task follows red-green-refactor TDD cycle
- (deep) Full sync with origin/main before resuming
- (deep) Beads actor identity is verified and task states are reconciled
- (deep) Between-task cleanup ensures no state leakage

## Methodology Scaling
- **deep**: Full worktree verification, Beads actor check, rebase on latest
  main, reconcile all open PRs, review onboarding guide, consult lessons.md,
  eval gates, detailed PR descriptions, between-task cleanup.
- **mvp**: Verify worktree, check branch state, finish in-progress work or
  pick next task, TDD loop, make check, create PR.
- **custom:depth(1-5)**: Depth 1: verify worktree and check current branch, continue in-progress work.
  Depth 2: add git status assessment and Beads identity verification. Depth 3: add
  PR reconciliation, lessons.md review, sync with origin. Depth 4: add
  rebase, eval gates, between-task cleanup. Depth 5: full state audit with
  actor verification and branch cleanup.

## Mode Detection
This is a stateless execution command. No document is created or updated.
- Always operates in RESUME MODE.
- If there is no prior work for this agent (no feature branches, no task
  progress), redirect to `/scaffold:multi-agent-start $ARGUMENTS` instead.

## Update Mode Specifics
Not applicable — this is a stateless execution command that does not produce
a persistent document.

## Instructions

You are **$ARGUMENTS**.

### Worktree Verification

Before doing anything else, confirm the environment:

1. **Worktree confirmation**
   - `git rev-parse --git-dir` — output should contain `/worktrees/` (confirms you are in a worktree)
   - If NOT in a worktree, stop and instruct the user to set one up or navigate to the correct directory

2. **Beads identity** (if `.beads/` exists)
   - `echo $BD_ACTOR` — should show `$ARGUMENTS`
   - If not set, the worktree setup may be incomplete

### State Recovery

Recover your context by checking the current state of work:

1. **Read project context**
   - Read `CLAUDE.md` for project conventions and key commands
   - Read `docs/onboarding-guide.md` if it exists (refresh project context)
   - Read `tasks/lessons.md` for relevant anti-patterns

2. **Git state assessment**
   - `git branch --show-current` — determine if you are on a feature branch (in-progress work) or a workspace branch
   - `git status` — check for uncommitted changes or staged files
   - `git stash list` — check for stashed work
   - `git log --oneline -5` — review recent commits for context

3. **PR reconciliation**
   - `gh pr list --author="@me"` — check for open PRs from this agent
   - For each open PR, check if it has been merged: `gh pr view <number> --json state`
   - If a PR was merged while you were away, reconcile the task status (see below)

4. **Sync with remote**
   - `git fetch origin --prune` — get latest remote state and clean stale references

### Beads Recovery

**If Beads is configured** (`.beads/` exists):
- `bd list --actor $ARGUMENTS` — check for tasks with `in_progress` status owned by this agent
- If a PR shows as merged, close the corresponding task: `bd close <id> && bd sync`
- If there is in-progress work, finish it (see "Resume In-Progress Work" below)
- Otherwise, clean up and start fresh:
  - `git fetch origin --prune && git clean -fd`
  - Run the install command from CLAUDE.md Key Commands
  - `bd ready` to find the next available task
- Continue working until `bd ready` shows no available tasks

**Without Beads:**
- Read `docs/implementation-playbook.md` as the primary task reference.
  Fall back to `docs/implementation-plan.md` when no playbook is present.
- If a PR shows as merged, mark the corresponding task as complete in the plan/playbook
- If there is in-progress work on your current branch, finish it
- Otherwise, clean up and pick the next task:
  - `git fetch origin --prune && git clean -fd`
  - Run the install command from CLAUDE.md Key Commands
  - Pick the next uncompleted task with no unfinished dependencies

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
   - Follow the same Red-Green-Refactor cycle as in `/scaffold:multi-agent-start`

### Continue to Next Task

Once in-progress work is complete (or if there was none):

1. **Quality gates**
   - Run `make check` (or equivalent from CLAUDE.md Key Commands)
   - If `tests/evals/` exists, run `make eval` (or equivalent eval command)

2. **Create PR** (if not already created for in-progress work)
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - Include agent name in PR description for traceability

3. **Run code reviews (MANDATORY)**
   - Run the review-pr tool: `scaffold run review-pr` (CLI) or `/scaffold:review-pr` (plugin)
   - This runs **all three** review channels on the PR diff:
     1. **Codex CLI**: `codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null`
     2. **Gemini CLI**: `NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null`
     3. **Superpowers code-reviewer**: dispatch `superpowers:code-reviewer` subagent with BASE_SHA and HEAD_SHA
   - Verify auth before each CLI (`codex login status`, `NO_BROWSER=true gemini -p "respond with ok" -o json`)
   - All three channels must execute (skip only if a tool is genuinely not installed)
   - Fix any P0/P1 findings before proceeding
   - Do NOT move to the next task until all channels have run

4. **Between-task cleanup**
   - `git fetch origin --prune && git clean -fd`
   - Run the install command from CLAUDE.md Key Commands

4. **Claim next task**
   - Branch from remote: `git fetch origin && git checkout -b <branch-name> origin/main`
   - Pick the next task following the same process as `/scaffold:multi-agent-start`
   - Continue the TDD execution loop

### Recovery Procedures

**Worktree not found or corrupted:**
- Check `git worktree list` from the main repo to see if the worktree exists
- If missing: `scripts/setup-agent-worktree.sh $ARGUMENTS` to recreate
- If corrupted: `git worktree remove <path>` then recreate

**Uncommitted changes on a feature branch:**
- Review the changes: `git diff`
- If the changes look intentional, stage and continue implementation
- If the changes look broken or experimental, stash them: `git stash`

**Stale feature branch (main has diverged significantly):**
- `git fetch origin && git rebase origin/main`
- If conflicts are extensive, consider starting the task fresh from origin/main
- Re-run full test suite after rebase

**PR was rejected or has requested changes:**
- `gh pr view <number>` — read the review comments
- Address the feedback on the existing branch
- Push updates and re-request review

**Task was completed by another agent:**
- If Beads: `bd sync` will show updated task states
- Without Beads: check the plan/playbook for recently completed tasks and open PRs
- Skip to the next available task

**`git checkout main` fails:**
- This is expected in a worktree. Use `git fetch origin && git checkout -b <branch> origin/main` instead.

**Dependency install fails after cleanup:**
- `git clean -fd` may have removed generated files — re-run the full install sequence
- If persistent, check if another agent's merge changed the dependency file

### Process Rules

1. **Verify worktree first** — Never resume work without confirming the worktree environment.
2. **Recover state before new work** — Check for in-progress tasks and merged PRs first.
3. **Branch from remote, not local** — Always use `origin/main` as the branch point.
4. **Clean between tasks** — Run cleanup after each task to prevent state leakage.
5. **TDD is not optional** — Continue the red-green-refactor cycle for any in-progress work.
6. **Quality gates before PR** — Never create a PR with failing checks.
7. **Code review before next task** — After creating a PR, run all three review channels (Codex CLI, Gemini CLI, Superpowers code-reviewer) and fix all P0/P1 findings before moving on.
8. **Follow CLAUDE.md** — It is the authority on project conventions and commands.

---

## After This Step

When this step is complete (all tasks done or session ending), tell the user:

---
**Agent $ARGUMENTS resume session complete.**

**Session summary:**
- Recovered state: [in-progress task or "clean start"]
- Tasks completed this session: [list task IDs/titles]
- PRs created: [list PR numbers]
- Remaining tasks: [count or "none"]

**If resuming again later:** Run `/scaffold:multi-agent-resume $ARGUMENTS` again.

**If all tasks are done:**
- Review `tasks/lessons.md` and add any patterns learned during implementation.
- Consider running `/scaffold:version-bump` for a release.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
