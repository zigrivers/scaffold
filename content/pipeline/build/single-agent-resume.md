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

The implementation plan is materialized into Beads issues by
`/scaffold:materialize-plan-to-beads` before the build phase. A resumed build
runs the **same defensive preflight** as the start prompt — it never claims
against an empty or stale tracker.

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
| `beads_usable` **and a valid stable-ID contract** | **Resume your own task, materialize, then claim** (see Step 3). |

**Step 3 — `beads_usable` + valid contract:**

1. **Resume the actor's own in-flight *plan* task first.** Before claiming
   anything new — and using the **stable** claim actor (resolve `BEADS_ACTOR` →
   `git user.name` → `$USER`, never empty) — check for a **plan-derived** task
   already `in_progress` assigned to you, scoped exactly like claiming:
   `bd list --status in_progress --assignee <actor> --has-metadata-key plan_task_id --json`.
   If one exists, continue it (see "Resume In-Progress Work" below). Scoping to
   `plan_task_id` prevents resuming onto an unrelated manual/bootstrap issue
   assigned to the same actor; any such non-plan in-progress work is reported
   separately, not resumed as build work.
2. **Reconcile merged PRs.** If a PR shows as merged, close the corresponding
   task: `bd close <id>`.
3. **Always invoke the canonical materializer** before claiming new work:
   `/scaffold:materialize-plan-to-beads`. Run it unconditionally — do **not**
   gate it on a count or ID-set comparison. It is idempotent (a cheap no-op when
   in sync) and is the single source of the four-pass reconcile logic — this
   prompt **invokes** it, it does not duplicate it. If it returns non-zero,
   **fail closed** — stop, surface the error, do **not** claim and do **not**
   markdown-fall-back past existing Beads state.
4. **Run the scoped claim loop.** Atomically claim the next ready **plan** task:
   `TASK=$(bd ready --claim --has-metadata-key plan_task_id --json | jq -r '.id')`
   - Scoping to `plan_task_id` keeps the loop from ever claiming the bootstrap
     "initialize Beads" bead or a manually-created issue.
   - This sets `assignee=$BEADS_ACTOR` + `status=in_progress` in a single
     round-trip — no race window.
5. Continue until the scoped claim
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
- **All remaining advancing** → exit gracefully. **Any stalled** → **stop and
  report the stalled subset**, grouped by why (open dependency, manual `blocked`,
  `deferred`).

**Markdown fallback** (only when `.beads/` is **absent**, or for a genuinely
legacy plan per the table — never past existing Beads state):
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

4. **Continue the build**
   - Pick up where the previous session left off, following the work-beads
     skill's Step 2.3 (Build) TDD discipline
   - Then proceed to "Execute the Ship Loop" below for verify → review → merge

### Execute the Ship Loop

**Sequential variant:** you work in the primary checkout on `<type>/<desc>`
branches (no worktree, skip `setup-agent-worktree.sh`, skip merge-slot); every
other step of the skill applies unchanged.

From here, follow the **work-beads skill** exactly — it owns the per-bead loop
(claim → worktree → build with draft-PR-on-first-push → verify → review with
the 3-round cap → squash-merge → close → batch report):

- Claude Code: `.claude/skills/work-beads/SKILL.md`
- Other agents: `.agents/skills/work-beads/SKILL.md`

Loop until the completion check confirms all plan tasks are closed. Do not
re-derive the loop from memory; open the skill file and follow it. Your claims
stay scoped to materialized plan tasks (`bd ready --claim
--has-metadata-key plan_task_id`) as detected above.

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
- If Beads: A `git pull` (and `bd dolt pull` if a Dolt remote is configured) brings the local DB current; run `bd doctor --fix` if anything looks stale.
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
4. **Follow CLAUDE.md** — It is the authority on project conventions and commands.
5. **Follow the work-beads skill exactly for the ship loop** — Do not re-derive
   claim → build → verify → review → merge → close from memory.

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
