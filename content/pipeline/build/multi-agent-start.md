---
name: multi-agent-start
description: Start multi-agent execution loop in a worktree
summary: "Sets up a named agent in an isolated git worktree so multiple agents can implement tasks simultaneously without file conflicts, each following the same TDD loop."
phase: "build"
order: 1530
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
- **custom:depth(1-5)**:
  - Depth 1: verify worktree environment, TDD loop, make check.
  - Depth 2: add dependency check and Beads identity verification.
  - Depth 3: add lessons.md review and test skeleton usage.
  - Depth 4: add onboarding guide, eval gates, between-task cleanup.
  - Depth 5: full pre-flight suite, all quality gates, actor verification.

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

**Validate your agent name before running any command.** Your agent name is
`$ARGUMENTS`. It MUST match `^[A-Za-z0-9_-]+$` (letters, digits, underscore,
hyphen). If it contains spaces, quotes, or any shell metacharacter, STOP
immediately and report the invalid name — do not run any command that includes
it.

### Pre-Flight Verification

Before writing any code, verify the worktree environment:

1. **Worktree confirmation**
   - `git rev-parse --git-dir` — output should contain `/worktrees/` (confirms you are in a worktree, not the main repo)
   - If NOT in a worktree, stop and instruct the user to set one up:
     > Run `scripts/setup-agent-worktree.sh "$ARGUMENTS"` from the main repo to create a worktree for this agent.

2. **Git state check**
   - `git status` — working tree should be clean
   - `git branch --show-current` — note the current branch
   - If on a feature branch with changes, redirect to `/scaffold:multi-agent-resume $ARGUMENTS`

3. **Beads identity** (if `.beads/` exists)
   - `echo $BEADS_ACTOR` — should show `$ARGUMENTS`
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

The implementation plan is materialized into Beads issues by
`/scaffold:materialize-plan-to-beads` before the build phase. This block is the
**defensive preflight** that guarantees the tracker is populated and current
before any agent claims work — it never claims against an empty or stale tracker.
Under multi-agent concurrency, materialization is **orchestrator-only** and runs
**once per wave under a merge-slot lock**; workers never materialize and must
wait for a run-stamped completion signal before their first claim.

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
| `beads_usable`, but the plan has **no** stable task IDs **and** Beads holds no plan-derived issues and no non-bootstrap claimed/closed work | Genuinely legacy plan → markdown loop, and emit "re-run planning to assign stable task IDs". Do **not** claim. |
| `beads_usable`, plan has no stable IDs **but** Beads already holds plausible build work (claimed/closed non-bootstrap issues) | **Fail closed** — markdown would bypass existing execution state. Require re-running planning + materialization. |
| `beads_usable`, contract **partially present or malformed** | **Fail closed.** Do **not** markdown-fall-back (would bypass existing plan-derived issues and diverge). Require planning to be re-run/fixed. |
| `beads_usable` **and a valid stable-ID contract** | **Orchestrator materializes once under the lock, then everyone claims** (see Step 3). |

**Step 3 — `beads_usable` + valid contract → orchestrator materializes, workers wait, then claim:**

Branch naming: `bd-<id>/<desc>`. Verify `$BEADS_ACTOR` is set per agent (echo it;
bail if empty).

**Two distinct identities.** The merge-slot needs a **per-process unique** holder
(e.g. `agent-$$` or a UUID) so two local agents sharing one `git user.name` don't
both think they hold the slot. The **claim/resume actor must stay stable** per
worktree/session — resolve `BEADS_ACTOR` → `git user.name` → `$USER` (never
empty). Use the unique value **only** for `bd merge-slot acquire/check/release`;
keep the stable `BEADS_ACTOR` for `bd ready --claim`. If you must override
`BEADS_ACTOR` for the lock, scope that override to the lock commands and restore
the stable actor before claiming.

1. **Orchestrator-only materialization under the merge-slot lock.** Only the wave
   orchestrator (the first agent) runs the materializer; workers skip to step 2.
   The orchestrator:
   - **Clears/overwrites any stale completion signal before acquiring the lock**,
     so a signal left from a previous pipeline run (or a pre-update plan) can't
     let workers race ahead of a fresh re-materialization. The **completion
     signal must be run-stamped** — carry a `run_id` or the current plan hash
     (e.g. a metadata flag on the project merge-slot/bootstrap bead, or a
     workspace marker file recording `run_id` / `materialized_at`).
   - **Acquires the lock with a real acquisition loop, not a status poll** — loop
     on `bd merge-slot acquire` itself and re-verify ownership via
     `bd merge-slot check --json` (a released slot is `holder: null` and never
     auto-promotes a waiter, so a check-only loop deadlocks). Guard the
     non-zero/queued return with `|| true` and release via a
     `trap … EXIT INT TERM`.
   - **Once ownership is confirmed, invokes `/scaffold:materialize-plan-to-beads`**
     (the canonical procedure — do not duplicate the four-pass logic). It is
     idempotent and a cheap no-op when already in sync. If it returns non-zero,
     **fail closed** (do not set the signal, do not claim, do not markdown-fall-back).
   - On success, **sets the run-stamped completion signal**, then **releases**
     the slot.
2. **Workers block on the run-stamped completion signal before their first
   claim.** A released slot (`holder: null`) does **not** prove the orchestrator
   ran — a worker could acquire/release before the orchestrator even started. So
   workers wait until a signal matching **this run's** `run_id`/plan-hash is
   present, then proceed. The lock serializes the *write*; the run-stamped signal
   gates the *readers*.
3. **Run the scoped claim loop** (using the **stable** `BEADS_ACTOR`, not the
   per-process lock identity). Atomically claim the next ready **plan** task:
   `TASK=$(bd ready --claim --has-metadata-key plan_task_id --json | jq -r '.id')`
   - Scoping to `plan_task_id` keeps the loop from ever claiming the bootstrap
     "initialize Beads" bead or a manually-created issue.
   - This sets `assignee=$BEADS_ACTOR` and `status=in_progress` in a single
     round-trip — eliminates the race window where two agents both see the same
     "ready" task.
4. Implement following the TDD workflow below.
5. After the PR is merged: `bd close <id>`.
6. Repeat the scoped claim (`bd ready --claim --has-metadata-key plan_task_id --json`)
   until it returns no ready task, then run the **completion check**.

**Completion check (empty `bd ready` ≠ done).** An empty scoped-ready result does
**not** mean the build is finished. On an empty result, fetch all plan-derived
tasks (`bd list --all --limit 0 --has-metadata-key plan_task_id --json`) and
classify the remaining non-`closed` tasks:

- **All plan tasks `closed`** → genuinely **done**; exit gracefully.
- Otherwise classify **each** remaining non-`closed` task independently — do
  **not** short-circuit on "any task is `in_progress`". Resolve blocker statuses
  from an **unfiltered** `bd list --all --limit 0 --json` (manual blockers carry
  no `plan_task_id`):
  - **advancing** — the task is itself `in_progress`, **or** at least one of its
    **transitive** blockers (walk the chain; bound the walk, reuse
    `bd dep cycles`) is `in_progress`.
  - **stalled** — not `in_progress` and **no** transitive blocker is
    `in_progress`.
- **All remaining tasks advancing** → exit gracefully (normal multi-agent case;
  other agents are still working).
- **Any task stalled** → **stop and report the stalled subset**, grouped by why
  (open dependency, manual `blocked`, `deferred`). Unrelated global `in_progress`
  work that blocks none of the stalled tasks does **not** suppress the report.

**Markdown fallback** (only when `.beads/` is **absent**, or for a genuinely
legacy plan per the table — never past existing Beads state):
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

6. **Pre-push local code review (when requested or required)**
   - If the user says to review before committing or pushing, or the project's workflow requires a local multi-model gate before `git push`, run `scaffold run review-code`
   - This reviews the local delivery candidate without requiring a PR
   - Surface auth failures immediately and retry after recovery
   - If recovery is not possible, document reduced review coverage and continue with the available channels
   - Fix any findings at or above `fix_threshold` before proceeding

7. **Create PR**
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
   - Include in the PR description: what was implemented, key decisions, files changed, agent name
   - Follow the PR workflow from `docs/git-workflow.md` or CLAUDE.md

8. **Run code reviews (MANDATORY)**
   - Run the review-pr tool: `scaffold run review-pr` (CLI) or `/scaffold:review-pr` (plugin)
   - This runs the three MMR CLI channels on the PR diff plus the Superpowers code-reviewer agent as a complementary 4th channel reconciled through `mmr reconcile`:
     1. **Codex CLI**: `codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null`
     2. **Antigravity CLI**: `printf '%s' "REVIEW_PROMPT" | agy --print --sandbox --dangerously-skip-permissions --print-timeout 300s 2>/dev/null`
     3. **Claude CLI**: `claude -p "REVIEW_PROMPT" --output-format json 2>/dev/null`
     4. **Superpowers code-reviewer** (4th channel): dispatch `superpowers:code-reviewer` subagent with BASE_SHA and HEAD_SHA
   - Verify auth before each CLI (`mmr config test` pre-flights all three at once)
   - All four channels should execute. Missing Codex or Antigravity → MMR runs a compensating Claude pass in its place (degraded-pass verdict). Missing Claude CLI → review proceeds without compensation.
   - Fix any findings at or above `fix_threshold` before proceeding
   - Do NOT move to the next task until the review completes

9. **Between-task cleanup**
   - `git fetch origin --prune && git clean -fd`
   - Run the install command from CLAUDE.md Key Commands
   - This ensures a clean state before the next task

### Recovery Procedures

**Worktree not set up:**
- Instruct the user to run: `scripts/setup-agent-worktree.sh "$ARGUMENTS"`
- Or reference `docs/git-workflow.md` section 7 for manual worktree setup

**`git checkout main` fails:**
- This is expected in a worktree. Use `git fetch origin && git checkout -b <branch> origin/main` instead.

**Merge conflicts on PR:**
- `git fetch origin && git rebase origin/main`
- Resolve conflicts, re-run tests, force-push the branch

**Another agent claimed the same task:**
- If Beads: A `git pull` (and `bd dolt pull` if a Dolt remote is configured) brings the local DB current; run `bd doctor --fix` if anything looks stale.
- Without Beads: check open PRs (`gh pr list`) for overlapping work
- Move to the next available unblocked task

**A downstream task is blocked on a specific async condition (PR merge, workflow run, timer, human decision):**
- If Beads: create a gate that blocks the downstream task. The gate has an auto-generated ID. For a PR-merge blocker: `bd gate create --type=gh:pr --blocks <task-id> --await-id=<pr-number> --reason "..."`. For a human-resolved blocker: `bd gate create --blocks <task-id> --reason "..."` (defaults to `--type=human`). Capture the gate ID via `--json | jq -r '.id'` if you need to resolve manually later.
- The gated task disappears from `bd ready` until the gate resolves. `gh:pr` / `gh:run` / `timer` gates auto-resolve via watchers; `human` gates resolve via `bd gate resolve <gate-id>`.
- If multiple downstream tasks share one underlying blocker, create one gate per blocked task pointing at the same `--await-id`. For dependency-style blocking ("this task can't start until that task finishes"), use `bd dep add --blocks` instead.
- See `content/knowledge/execution/multi-agent-coordination.md` for the full pattern.

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
6. **Honor pre-push review when requested** — If the user or project workflow asks for pre-push multi-model review, run `scaffold run review-code` after quality gates and before `git push`.
7. **Code review before next task** — After creating a PR, run `scaffold run review-pr`: three CLI channels (Codex CLI, Antigravity CLI, Claude CLI) via MMR plus the Superpowers code-reviewer agent as a complementary 4th channel. Fix all findings at or above `fix_threshold` before moving on.
8. **Avoid task conflicts** — Check what other agents are working on before claiming.
9. **Follow CLAUDE.md** — It is the authority on project conventions and commands.

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
