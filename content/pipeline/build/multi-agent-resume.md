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
knowledge-base: [tdd-execution-loop, task-claiming-strategy, worktree-management, multi-agent-coordination]
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
- **custom:depth(1-5)**:
  - Depth 1: verify worktree and check current branch, continue in-progress work.
  - Depth 2: add git status assessment and Beads identity verification.
  - Depth 3: add PR reconciliation, lessons.md review, sync with origin.
  - Depth 4: add rebase, eval gates, between-task cleanup.
  - Depth 5: full state audit with actor verification and branch cleanup.

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
   - `echo $BEADS_ACTOR` — should show `$ARGUMENTS`
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

The implementation plan is materialized into Beads issues by
`/scaffold:materialize-plan-to-beads` before the build phase. A resumed build
runs the **same defensive preflight** as the start prompt — it never claims
against an empty or stale tracker. Under multi-agent concurrency,
materialization is **orchestrator-only** and runs **once per wave under a
merge-slot lock**; workers never materialize and must wait for a run-stamped
completion signal before their first claim.

**Step 1 — compute `beads_usable`.** `beads_usable` is true only when **all**
hold: `.beads/` exists, `bd` is on `PATH`, `bd version` parses to **≥ 1.0.5**
(using a macOS/BSD-safe numeric compare — split major/minor/patch and compare
numerically, never rely on GNU `sort -V`), and `jq` is on `PATH`. Never write
`[ -d .beads ] && bd …` as a whole command — it returns exit 1 when `.beads/` is
absent and breaks callers under `set -e`; use an `if`.

**Step 2 — route on the decision table** (this is what prevents the "empty
tracker looks done" bug):

| Condition | Action |
|---|---|
| `.beads/` **absent** | Non-Beads project → drive the loop from the markdown playbook/plan (see "Markdown fallback" below). Do **not** call `bd`. |
| `.beads/` present but `beads_usable` is false (`bd`/`jq` missing or `bd` < 1.0.5) | **Fail closed.** Stop and tell the user to install/upgrade `bd` (≥ v1.0.5) and `jq`. Do **not** markdown-fall-back — Beads may already hold execution state. |
| `beads_usable`, plan has **no** stable IDs **and** Beads holds no plan-derived issues and no non-bootstrap claimed/closed work | Genuinely legacy plan → markdown loop, emit "re-run planning to assign stable task IDs". Do **not** claim. |
| `beads_usable`, plan has no stable IDs **but** Beads already holds plausible build work | **Fail closed** — markdown would bypass existing execution state. |
| `beads_usable`, contract **partially present or malformed** | **Fail closed.** Do **not** markdown-fall-back. Require planning to be re-run/fixed. |
| `beads_usable` **and a valid stable-ID contract** | **Resume your own task; orchestrator materializes once under the lock; workers wait; then claim** (see Step 3). |

**Step 3 — `beads_usable` + valid contract:**

**Two distinct identities.** The merge-slot needs a **per-process unique** holder
(e.g. `agent-$$` or a UUID) so two local agents sharing one `git user.name` don't
both think they hold the slot. The **claim/resume actor must stay stable** per
worktree/session — resolve `BEADS_ACTOR` → `git user.name` → `$USER` (never
empty). Use the unique value **only** for `bd merge-slot acquire/check/release`;
keep the stable `BEADS_ACTOR` for the resume lookup and `bd ready --claim`.

1. **Resume the actor's own in-flight *plan* task first.** Before claiming
   anything new — and using the **stable** claim actor, not the per-process lock
   identity — check for a **plan-derived** task already `in_progress` assigned to
   you, scoped exactly like claiming:
   `bd list --status in_progress --assignee <actor> --has-metadata-key plan_task_id --json`.
   If one exists, continue it (see "Resume In-Progress Work" below). Scoping to
   `plan_task_id` prevents resuming onto an unrelated manual/bootstrap issue
   assigned to the same actor; any such non-plan in-progress work is reported
   separately, not resumed as build work.
2. **Reconcile merged PRs.** If a PR shows as merged, close the corresponding
   task: `bd close <id>`.
3. **Orchestrator-only materialization under the merge-slot lock.** Only the wave
   orchestrator (the first agent resuming the wave) runs the materializer;
   workers skip to step 4. The orchestrator:
   - **Clears/overwrites any stale completion signal before acquiring the lock**,
     so a signal left from a previous pipeline run (or a pre-update plan) can't
     let workers race ahead of a fresh re-materialization. The **completion
     signal must be run-stamped** — carry a `run_id` or the current plan hash
     (e.g. a metadata flag on the project merge-slot/bootstrap bead, or a
     workspace marker recording `run_id` / `materialized_at`).
   - **Acquires the lock with a real acquisition loop, not a status poll** — loop
     on `bd merge-slot acquire` itself and re-verify ownership via
     `bd merge-slot check --json` (a released slot is `holder: null` and never
     auto-promotes a waiter). Guard the non-zero/queued return with `|| true` and
     release via a `trap … EXIT INT TERM`.
   - **Once ownership is confirmed, invokes `/scaffold:materialize-plan-to-beads`**
     (the canonical procedure — do not duplicate the four-pass logic). It is
     idempotent and a cheap no-op when in sync. If it returns non-zero, **fail
     closed** (do not set the signal, do not claim, do not markdown-fall-back).
   - On success, **sets the run-stamped completion signal**, then **releases**
     the slot.
4. **Workers block on the run-stamped completion signal before their first
   claim.** A released slot (`holder: null`) does **not** prove the orchestrator
   ran — blocking on slot release alone is insufficient (a worker could
   acquire/release before the orchestrator started). Workers wait until a signal
   matching **this run's** `run_id`/plan-hash is present, then proceed.
5. **Clean up and run the scoped claim loop** (using the **stable** `BEADS_ACTOR`,
   not the per-process lock identity):
   - `git fetch origin --prune && git clean -fd`
   - Run the install command from CLAUDE.md Key Commands
   - Atomically claim the next ready **plan** task:
     `TASK=$(bd ready --claim --has-metadata-key plan_task_id --json | jq -r '.id')`
     - Scoping to `plan_task_id` keeps the loop from ever claiming the bootstrap
       "initialize Beads" bead or a manually-created issue.
     - This sets `assignee=$BEADS_ACTOR` + `status=in_progress` in a single
       round-trip — no race window between agents.
6. Continue until the scoped claim
   (`bd ready --claim --has-metadata-key plan_task_id --json`) returns no ready
   task, then run the **completion check**.

**Completion check (empty `bd ready` ≠ done).** An empty scoped-ready result does
**not** mean the build is finished. On an empty result, fetch all plan-derived
tasks (`bd list --all --limit 0 --has-metadata-key plan_task_id --json`) and
classify the remaining non-`closed` tasks:

- **All plan tasks `closed`** → genuinely **done**; exit gracefully.
- Otherwise classify **each** remaining non-`closed` task independently — do
  **not** short-circuit on "any task is `in_progress`". Resolve blocker statuses
  from an **unfiltered** `bd list --all --limit 0 --json` (manual blockers carry
  no `plan_task_id`):
  - **advancing** — the task is itself `in_progress`, **or** a **transitive**
    blocker (walk the chain; bound the walk, reuse `bd dep cycles`) is
    `in_progress`.
  - **stalled** — not `in_progress` and no transitive blocker is `in_progress`.
- **All remaining advancing** → exit gracefully (normal multi-agent case). **Any
  stalled** → **stop and report the stalled subset**, grouped by why (open
  dependency, manual `blocked`, `deferred`). Unrelated global `in_progress` work
  that blocks none of the stalled tasks does **not** suppress the report.

**Markdown fallback** (only when `.beads/` is **absent**, or for a genuinely
legacy plan per the table — never past existing Beads state):
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

2. **Pre-push local code review (when requested or required)**
   - If the user says to review before committing or pushing, or the project's workflow requires a local multi-model gate before `git push`, run `scaffold run review-code`
   - This reviews the local delivery candidate without requiring a PR
   - Surface auth failures immediately and retry after recovery
   - If recovery is not possible, document reduced review coverage and continue with the available channels
   - Fix any findings at or above `fix_threshold` before proceeding

3. **Create PR** (if not already created for in-progress work)
   - If Beads is configured, run the PR-readiness checklist first:
     ```bash
     if [ -d .beads ]; then
       bd preflight
     fi
     ```
     Fix any issues `bd preflight` flags before proceeding.
   - **For 3+ parallel agents**, acquire the project's merge slot to serialize merge-time conflicts:
     ```bash
     if [ -d .beads ]; then
       bd merge-slot acquire --wait    # blocks if held; queues you in priority order
     fi
     ```
     There is one merge slot per project; `--wait` blocks until you have it. Skip for single-agent or two-agent runs. See `content/knowledge/execution/multi-agent-coordination.md`.
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - After the PR merges (or if you abandon the work), release the slot:
     ```bash
     if [ -d .beads ]; then
       bd merge-slot release   # holder verified via $BEADS_ACTOR
     fi
     ```
   - Include agent name in PR description for traceability

4. **Run code reviews (MANDATORY)**
   - Run the review-pr tool: `scaffold run review-pr` (CLI) or `/scaffold:review-pr` (plugin)
   - This runs the three MMR CLI channels on the PR diff plus the Superpowers code-reviewer agent as a complementary 4th channel reconciled through `mmr reconcile`:
     1. **Codex CLI**: `codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null`
     2. **Gemini CLI**: `NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null`
     3. **Claude CLI**: `claude -p "REVIEW_PROMPT" --output-format json 2>/dev/null`
     4. **Superpowers code-reviewer** (4th channel): dispatch `superpowers:code-reviewer` subagent with BASE_SHA and HEAD_SHA
   - Verify auth before each CLI (`mmr config test` pre-flights all three at once)
   - All four channels should execute. Missing Codex or Gemini → MMR runs a compensating Claude pass in its place (degraded-pass verdict). Missing Claude CLI → review proceeds without compensation.
   - Fix any findings at or above `fix_threshold` before proceeding
   - Do NOT move to the next task until the review completes

5. **Between-task cleanup**
   - `git fetch origin --prune && git clean -fd`
   - Run the install command from CLAUDE.md Key Commands

6. **Claim next task**
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
- If Beads: A `git pull` (and `bd dolt pull` if a Dolt remote is configured) brings the local DB current; run `bd doctor --fix` if anything looks stale.
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
7. **Honor pre-push review when requested** — If the user or project workflow asks for pre-push multi-model review, run `scaffold run review-code` after quality gates and before `git push`.
8. **Code review before next task** — After creating a PR, run `scaffold run review-pr`: three CLI channels (Codex CLI, Gemini CLI, Claude CLI) via MMR plus the Superpowers code-reviewer agent as a complementary 4th channel. Fix all findings at or above `fix_threshold` before moving on.
9. **Follow CLAUDE.md** — It is the authority on project conventions and commands.

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
