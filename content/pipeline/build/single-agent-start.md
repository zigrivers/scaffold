---
name: single-agent-start
description: Start single-agent TDD execution loop
summary: "Claims the next task, writes a failing test, implements until it passes, refactors, runs quality gates, commits, and repeats — following the implementation playbook."
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
- (deep) Before starting each task, agent consults tasks/lessons.md and documents which lesson was applied
- (deep) PR description includes implementation summary, assumptions, and files modified

## Methodology Scaling
- **deep**: Full pre-flight verification, read onboarding guide, consult lessons.md
  before each task, use test skeletons, run evals, detailed PR descriptions with
  implementation notes and assumptions.
- **mvp**: Quick git/dependency check, read playbook or plan, pick next task,
  TDD loop, make check, create PR. Skip onboarding guide review and detailed
  PR annotations.
- **custom:depth(1-5)**:
  - Depth 1: git status check, TDD loop, make check.
  - Depth 2: add dependency check and test suite health verification before starting.
  - Depth 3: add lessons.md review and test skeleton usage.
  - Depth 4: add onboarding guide, eval gates, detailed PR descriptions.
  - Depth 5: full pre-flight suite, all quality gates, cross-reference with upstream docs.

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

The implementation plan is materialized into Beads issues by
`/scaffold:materialize-plan-to-beads` before the build phase. This block is the
**defensive preflight** that guarantees the tracker is populated and current
before any work is claimed — it never claims against an empty or stale tracker.

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
| `.beads/` present but `beads_usable` is false (`bd`/`jq` missing or `bd` < 1.0.5) | **Fail closed.** Stop and tell the user to install/upgrade `bd` (≥ v1.0.5) and `jq`. Do **not** markdown-fall-back — Beads may already hold execution state, and a markdown re-run would re-execute completed work. |
| `beads_usable`, but the plan has **no** stable task IDs **and** Beads holds no plan-derived issues and no non-bootstrap claimed/closed work | Genuinely legacy plan → markdown loop, and emit "re-run planning to assign stable task IDs". Do **not** claim. |
| `beads_usable`, plan has no stable IDs **but** Beads already holds plausible build work (claimed/closed non-bootstrap issues) | **Fail closed** — markdown would bypass existing execution state. Require re-running planning + materialization. |
| `beads_usable`, contract **partially present or malformed** (some IDs present, or plan-derived issues already exist, but the contract doesn't fully parse) | **Fail closed.** Do **not** markdown-fall-back (would bypass existing plan-derived issues and diverge). Require planning to be re-run/fixed. |
| `beads_usable` **and a valid stable-ID contract** | **Always materialize first, then claim** (see Step 3). |

**Step 3 — `beads_usable` + valid contract → materialize, then claim:**

1. **Always invoke the canonical materializer:** `/scaffold:materialize-plan-to-beads`.
   Run it unconditionally — do **not** gate it on a count or ID-set comparison
   (every such gate misses content-only edits, partial imports, or stale deps).
   The materializer is idempotent and a cheap no-op when already in sync; it is
   the single source of the four-pass reconcile logic — this prompt **invokes**
   it, it does not duplicate it. If the materializer returns non-zero (mid-run
   failure), **fail closed** — stop and surface the error; do **not** claim and
   do **not** markdown-fall-back past existing Beads state.
2. **Run the scoped claim loop.** Atomically claim the next ready **plan** task:
   `TASK=$(bd ready --claim --has-metadata-key plan_task_id --json | jq -r '.id')`
   - Scoping to `plan_task_id` keeps the loop from ever claiming the bootstrap
     "initialize Beads" bead or a manually-created issue.
   - This sets `assignee=$BEADS_ACTOR` (or your git user.name) and
     `status=in_progress` in a single round-trip — no race window.
   - If you need a specific task by ID instead, use `bd update <id> --claim`.
3. Build, verify, review, and merge following the work-beads skill's per-bead
   loop — see "Execute the Ship Loop" below. Close only after the merge is
   verified.
4. Repeat the scoped claim (`bd ready --claim --has-metadata-key plan_task_id --json`)
   until it returns no ready task, then run the **completion check**.

**Completion check (empty `bd ready` ≠ done).** An empty scoped-ready result does
**not** mean the build is finished — every remaining task could be blocked. On an
empty result, fetch all plan-derived tasks
(`bd list --all --limit 0 --has-metadata-key plan_task_id --json`) and classify
the remaining non-`closed` tasks:

- **All plan tasks `closed`** → genuinely **done**; exit gracefully.
- Otherwise classify **each** remaining non-`closed` task independently — do
  **not** short-circuit on "any task is `in_progress`". Resolve blocker statuses
  from an **unfiltered** `bd list --all --limit 0 --json` (manual blockers carry
  no `plan_task_id`):
  - **advancing** — the task is itself `in_progress`, **or** at least one of its
    **transitive** blockers (walk the chain; bound the walk and reuse
    `bd dep cycles` as a guard) is `in_progress`.
  - **stalled** — not `in_progress` and **no** transitive blocker is
    `in_progress` (open-but-unready behind inactive blockers, manually `blocked`,
    or `deferred`).
- **All remaining tasks advancing** → exit gracefully.
- **Any task stalled** → **stop and report the stalled subset**, grouped by why
  (open dependency, manual `blocked`, `deferred`), so the user can unblock them.

**Markdown fallback** (only when `.beads/` is **absent**, or for a genuinely
legacy plan per the table — never past existing Beads state):
1. Read `docs/implementation-playbook.md` as the primary task execution reference.
   Fall back to `docs/implementation-plan.md` when no playbook is present.
2. Pick the first uncompleted task that has no unfinished dependencies.
3. Implement using red-green-refactor: write a failing test, make it pass, then
   refactor. Run `make check` (and `make eval` if `tests/evals/` exists) before
   opening a PR (`gh pr create`) and running code review per
   `docs/git-workflow.md` or CLAUDE.md; merge only after review passes.
4. Mark the task complete in the plan/playbook.
5. Repeat in dependency order until all tasks are done.

### Execute the Ship Loop

**Sequential variant:** you work in the primary checkout on `<type>/<desc>`
branches (no worktree, skip `setup-agent-worktree.sh`, skip merge-slot); every
other step of the skill applies unchanged.

From here, follow the **work-beads skill** exactly — it owns the per-bead loop
(claim → worktree → build with draft-PR-on-first-push → verify → review with
the 3-round cap → squash-merge → close → batch report):

- Claude Code: `.claude/skills/work-beads/SKILL.md`
- Other agents: `.agents/skills/work-beads/SKILL.md`

**Claim reentry:** the claim you already performed above satisfies the
skill's Step 2.1 for the FIRST bead — do not claim a second bead; enter the
skill's loop at Step 2.2 for that bead, and use the skill's Step 2.1 only
for subsequent beads after the current one is merged and closed.

Loop until the completion check confirms all plan tasks are closed. Do not
re-derive the loop from memory; open the skill file and follow it. Your claims
stay scoped to materialized plan tasks (`bd ready --claim
--has-metadata-key plan_task_id`) as detected above.

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

1. **One task at a time** — Complete the current task fully before starting the next.
2. **Update status immediately** — Mark tasks complete as soon as review passes.
3. **Consult lessons.md** — Check for relevant anti-patterns before each task.
4. **Follow CLAUDE.md** — It is the authority on project conventions and commands.
5. **Follow the work-beads skill exactly for the ship loop** — Do not re-derive
   claim → build → verify → review → merge → close from memory.

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
