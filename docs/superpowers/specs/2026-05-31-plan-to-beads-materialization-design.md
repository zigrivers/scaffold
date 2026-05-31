# Plan → Beads Materialization — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorm complete; pending implementation plan)
**Author:** Scaffold maintainers

> **Command-surface note.** All `bd` command claims in this spec were verified
> against **Beads v1.0.5** (the version under test) and the repo's existing
> integration docs (`content/tools/review-pr.md`,
> `docs/audits/beads-integration-audit-2026-05-24.md`). Key verified facts:
> `bd list` has **no** `--external-ref` filter, but **does** support
> `--all`, `--status {open,in_progress,blocked,deferred,closed}`,
> `--json`, `--has-metadata-key`, and `--metadata-field key=value`.
> `bd create` accepts `--external-ref`, `--metadata`, `--deps`. `epic` is a
> built-in type; `story` requires `types.custom`. `bd dep cycles` detects
> dependency cycles. The minimum supported `bd` version for this feature is
> **v1.0.5**; degrade gracefully (skip with a message) below it.

## Problem

When a downstream project enables Beads task tracking, there is **no pipeline
step that materializes the implementation plan into Beads issues**. The result
is a broken hand-off into the build phase:

| Phase | Step | Beads behavior today |
|-------|------|----------------------|
| 2 (foundation) | `beads.md` | `bd init`, hooks, `bd setup claude`, merge-slot — creates the tracker but **zero real tasks** (only a bootstrap "initialize Beads" bead) |
| 12 (planning) | `implementation-plan.md` | Writes `docs/implementation-plan.md` — a markdown task list with dependencies, sizing, acceptance criteria, waves |
| 14 (finalization) | `implementation-playbook.md` | Wraps the plan with ordering/waves/per-task context — **still markdown** |
| 15 (build) | `single-agent-start.md` | "If `.beads/` exists → `bd ready --claim`" |

At build time `bd ready --claim` runs against an **empty** Beads database,
because nothing ever converted the plan into issues. The build prompt's own
logic (`single-agent-start.md:107`) treats an empty result as "you're done —
exit the loop." So a Beads-enabled project either (a) falsely concludes there
is no work, or (b) the agent improvises issues task-by-task as it goes. Both are
wrong; the markdown plan and Beads live in parallel universes that never get
connected.

This was surfaced verbatim by a downstream project at the start of its build
phase: *"Beads currently doesn't contain the implementation-plan tasks, so I'll
need to create Beads issues for them as I start them, unless you already have a
preferred import/migration command."*

There is no such command today. This spec adds one.

## Goals

- Materialize `docs/implementation-plan.md` (enriched by
  `docs/implementation-playbook.md`) into Beads issues **before the build phase
  begins**, but **only when Beads is enabled**.
- Make the operation **idempotent**: re-running after a plan update upserts
  new/changed tasks, reconciles removals, and never clobbers execution state.
- Leave non-Beads projects completely unaffected — the existing markdown build
  loop is untouched.
- Provide both a proactive pipeline step and a defensive build-phase preflight,
  so the gap is closed whether Beads was enabled before or after planning.

## Non-Goals

- **Two-way sync.** Changes flow one direction only: plan → Beads. Editing
  Beads issues never writes back to the markdown plan.
- **Replacing the markdown plan/playbook as the design source of truth.** They
  remain authoritative for *what* the tasks are.
- **A TypeScript CLI subcommand.** Like the rest of the pipeline, this is a
  meta-prompt the agent executes via `bd` commands. No `src/` runtime code is
  required beyond frontmatter registration if needed.
- **Backfilling Scaffold's own repo.** Scaffold does not track its own work in
  Beads (`tasks/lessons.md` explicitly discourages it). This feature is for
  downstream generated projects.

## Prerequisite: Stable Plan Task IDs

The materializer needs a reliable join key to upsert idempotently. Today
`implementation-plan.md` only says to *preserve* existing task IDs in update
mode — it does not require fresh plans to assign IDs or define their format.
That is insufficient. This feature therefore depends on a small, prerequisite
change to the planning step:

- **`content/pipeline/planning/implementation-plan.md`** must require every task
  to carry a **stable, unique task ID** with a defined format (e.g. `T-001`,
  `T-002`, …, monotonic, never reused), assigned when the plan is first written
  and preserved verbatim across update-mode runs.
- The implementation-plan review step should validate that IDs exist, are
  unique, and are stable across updates.

This prerequisite is part of this feature's implementation plan (it ships
before the materializer can rely on the key). Without it, the join key is
undefined and idempotency cannot hold.

## Source-of-Truth Contract

- The **markdown plan/playbook** are the design source of truth — version
  controlled, reviewed, and already supporting an update-mode philosophy.
  They own *what* the tasks are: scope, dependencies, acceptance criteria, and
  the set of tasks that exist.
- **Beads** owns *execution state*: open / in_progress / blocked / deferred /
  closed, plus claims and assignees.
- The materializer is a **one-way reconcile**: plan → Beads. It never reads
  Beads state back into the markdown. Each run performs three passes:
  **upsert** (create/update), **dependency reconcile**, and **stale reconcile**
  (handle tasks/deps removed from the plan) — all while never overwriting an
  issue that has left the `open` state.

This mirrors the update-mode contract already used by `implementation-plan.md`
and `implementation-playbook.md`.

## Architecture

A new **conditional finalization prompt** plus a **defensive build preflight**.

```
Phase 14 (finalization)
  implementation-playbook.md          (order 1430) — writes the playbook
  materialize-plan-to-beads.md   ←    (order 1440, NEW, conditional: "if-needed")
                                       Reads plan + playbook → upserts bd issues
Phase 15 (build)
  single-agent-start.md / multi-agent-start.md (order 1510+)
    Beads Detection block          ←  ADD preflight: "if .beads/ exists but holds
                                       no plan-derived issues and the plan exists →
                                       run materialization first, then claim"
```

Because pipeline steps auto-expose as slash commands, the new step is also
invocable as **`/scaffold:materialize-plan-to-beads`**, which doubles as the
manual re-import command after a plan update.

### Gating

- Frontmatter `conditional: "if-needed"` keeps it out of non-Beads pipelines.
- A runtime guard makes execution a clean no-op when Beads is absent or `bd`
  is not on the PATH:

  ```bash
  if [ -d .beads ] && command -v bd >/dev/null 2>&1; then
    # materialize
  else
    echo "Beads not configured — skipping plan materialization."
  fi
  ```

  Never write `[ -d .beads ] && bd ...` as the whole command — it returns
  exit 1 when `.beads/` is absent and breaks any caller under `set -e` (the same
  trap already documented in `single-agent-start.md:164`).

- `dependencies: [implementation-playbook]` so it runs after the plan is
  finalized.

## The Mapping (methodology-scaled)

Follows scaffold's existing methodology-scaling convention.

| Plan element | mvp (flat) | deep (hierarchical) |
|---|---|---|
| Task | `bd create -t task` | `bd create -t task`, parented to its story |
| User story | — (tasks reference it in body) | `bd create -t story` as parent |
| Epic (large grouping) | — | `bd create -t epic` as grandparent |
| Priority / order | `-p <n>` (wave-biased default) | `-p <n>` (wave-biased default) |
| Dependencies (DAG) | `bd dep add <blocked> <blocker>` | `bd dep add <blocked> <blocker>` |
| Acceptance criteria | issue body | issue body |
| Wave assignment | — | metadata `wave=N` |
| Risk flag | — | metadata `risk=<type>` |
| PRD / story traceability | body note + metadata | parent link + metadata |

**Type notes (verified against `bd create --help`, v1.0.5):**

- `epic` is a **built-in** Beads type — `bug|feature|task|epic|chore|decision`.
  It does **not** require `types.custom`.
- `story` is **not** a built-in CLI type; it requires
  `bd config set types.custom '[...]'`. `foundation/beads.md` enables exactly
  `["story","milestone","spike"]` at deep depth, so `-t story` is available in
  deep projects only. mvp projects must fall back to `-t task` (or `-t feature`)
  and record the story linkage in metadata/body instead of using `-t story`.
- **custom:depth(1-5)** dials between flat and hierarchical: depth 1–2 flat,
  depth 3 adds dependencies, depth 4 adds story parents + wave metadata, depth 5
  adds epic grandparents, risk metadata, and full traceability.

### Priority mapping (wave-biased)

The plan orders tasks, assigns waves (deep), and may flag explicit priority.
Map to Beads `-p`:

1. **Explicit plan priority wins**: `P0`→`-p 0`, `P1`→`-p 1`, `P2`→`-p 2`,
   `P3`→`-p 3`.
2. **Otherwise bias by wave** so `bd ready` surfaces work in the playbook's
   intended order: Wave 1 → `-p 1`, Wave 2 → `-p 2`, Wave 3+ → `-p 3`
   (clamp at 3). Dependencies still gate readiness; the priority bias only
   orders among ready tasks.
3. **No priority and no waves** (mvp) → default `-p 2`, rely on dependencies for
   ordering.

## Idempotency

The join key is **Beads metadata `plan_task_id`** — a natively filterable field
(`bd list --has-metadata-key`, `--metadata-field key=value`). Title prefixes are
**not** used as the join key (a human/agent retitling an issue would sever the
link and cause duplicates). `--external-ref "plan:<task-id>"` is also stamped at
create time, but only for human traceability — `bd list` has no external-ref
filter in v1.0.5, so it is never relied on for lookup.

### Pass 1 — Upsert

For each plan task (stable `<task-id>` from the prerequisite):

1. **Look up** the existing issue (note `--all` so closed issues are visible):
   ```bash
   bd list --all --metadata-field "plan_task_id=<task-id>" --json
   ```
2. **Create** if absent:
   ```bash
   bd create "<title>" -t <type> -p <prio> \
     --metadata '{"plan_task_id":"<task-id>","wave":"<n>","risk":"<type>"}' \
     --external-ref "plan:<task-id>" \
     --description "<body incl. acceptance criteria + traceability>"
   ```
3. **If present, branch on stored status** (the full set is
   `open, in_progress, blocked, deferred, closed`):
   - **`open`** → update title / body / priority / parent to match the plan.
   - **`in_progress`, `blocked`, `deferred`** → **do not mutate fields**
     (execution-managed state). If the plan's description/AC changed since the
     issue was written, **post a warning** so the agent doesn't build against a
     stale spec:
     ```bash
     bd comment <id> "⚠️ Plan/AC changed after work started — re-read docs/implementation-plan.md task <task-id> before continuing."
     ```
   - **`closed`** → leave entirely untouched (work is done).

### Pass 2 — Dependency reconcile

Run **after** all issues exist (two-pass) so a task can depend on a sibling
created in the same run.

- **Add** missing edges: `bd dep add <blocked-id> <blocker-id>` (re-adding an
  existing edge is a no-op).
- **Remove** stale edges: for each plan-derived issue, diff its current Beads
  dependencies (`bd dep list <id> --json`) against the plan's declared deps and
  `bd dep remove` any edge no longer in the plan — **only** when the dependent
  issue is still `open` (never rewire in-progress/closed work).
- **Detect cycles** after applying: `bd dep cycles` — surface any cycle as an
  error. (The plan's own DAG is validated upstream by
  `implementation-plan.md`, but the playbook or a manual edit could reintroduce
  one, so verify here too.)

### Pass 3 — Stale reconcile (tasks removed from the plan)

List every plan-derived issue (`bd list --all --has-metadata-key plan_task_id
--json`) and diff its `plan_task_id` against the set of IDs currently in the
plan:

- A plan-derived issue whose ID is **no longer in the plan** and is still
  `open` → close it with a reason and label it stale:
  ```bash
  bd close <id> --reason "Removed from implementation plan (no task <task-id>)"
  bd label add <id> stale:removed-from-plan
  ```
- If such an issue is `in_progress`/`blocked`/`deferred`/`closed` → **do not
  auto-close**; instead report it in the summary for human attention (it may be
  mid-flight work the plan dropped by mistake).

### Summary report

Every run prints a deterministic summary:

```
materialize: C created, U updated, K unchanged,
             S skipped (in_progress/blocked/deferred/closed),
             D deps added, R deps removed,
             X stale closed, W stale flagged for review
```

## Build Preflight

In both `single-agent-start.md` and `multi-agent-start.md`, extend the **Beads
Detection** block. The count uses `--all` (so an all-closed project is not
misread as empty) and the native metadata-key filter:

```bash
if [ -d .beads ] && command -v bd >/dev/null 2>&1; then
  COUNT=$(bd list --all --has-metadata-key plan_task_id --json 2>/dev/null | jq 'length')
  if [ "${COUNT:-0}" -eq 0 ] && [ -f docs/implementation-plan.md ]; then
    # run /scaffold:materialize-plan-to-beads (or its inline steps) first
    :
  fi
  # then proceed with bd ready --claim as today
fi
```

This guarantees correctness even if Beads was enabled *after* planning, or the
finalization step was skipped. The preflight is itself idempotent (re-import is
a no-op when issues already exist).

### Concurrency (multi-agent)

The **primary** materialization path is the sequential finalization step, which
runs **once** before any build wave fans out — so the preflight is normally a
no-op. The defensive preflight in `multi-agent-start.md` must still be safe
under concurrency, because multiple agents can evaluate `COUNT=0` simultaneously
(a TOCTOU race that would create duplicate issues). Mitigations, both required:

1. **Orchestrator-only:** only the wave orchestrator / first agent runs the
   defensive import; worker agents wait for it to finish before their first
   `bd ready --claim`.
2. **Locked:** wrap the entire import in the existing project merge-slot lock so
   even a mis-sequenced worker serializes:
   ```bash
   bd merge-slot acquire --wait
   #   re-check COUNT, import if still 0
   bd merge-slot release
   ```

`single-agent-start.md` has no concurrency concern and needs only the plain
preflight.

## Files to Touch

- **New:** `content/pipeline/finalization/materialize-plan-to-beads.md`
  — includes the mandatory Mode Detection + Update Mode Specifics blocks,
  methodology scaling, gating guard, three-pass reconcile logic, idempotency
  summary.
- **Edit (prerequisite):** `content/pipeline/planning/implementation-plan.md`
  — require a stable, unique, format-defined task ID per task (assign in fresh
  mode, preserve in update mode).
- **Edit:** `content/pipeline/planning/implementation-plan-review.md` — validate
  task IDs exist, are unique, and are stable.
- **Edit:** `content/pipeline/build/single-agent-start.md` — Beads Detection
  preflight (plain).
- **Edit:** `content/pipeline/build/multi-agent-start.md` — Beads Detection
  preflight (orchestrator-only + merge-slot lock).
- **Edit:** `content/pipeline/foundation/beads.md` — one line noting that the
  plan is materialized into Beads later, so users aren't surprised Beads starts
  empty.
- **Edit (if required):** `src/types/frontmatter.ts` — only if the validator
  needs the new prompt registered beyond its frontmatter. The `finalization`
  phase already exists, so the change is likely just the new file + passing
  `make validate`.
- **Tests:** bats coverage (see Testing Strategy).
- **Docs:** note the new step in the pipeline reference and `CHANGELOG.md`.

## Edge Cases

- **Beads enabled after planning** → build preflight catches it and imports
  before the first claim.
- **Plan updated post-import** → re-run upserts changed tasks, reconciles
  added/removed deps, closes stale-but-open issues, preserves
  in_progress/blocked/deferred/closed state.
- **Task deleted from the plan** → Pass 3 closes it if still `open`; flags it
  for review if it had already entered execution.
- **Dependency deleted from the plan** → Pass 2 removes the stale edge for
  `open` dependents only.
- **AC/description changed while a task is in_progress** → issue fields are not
  mutated, but a `bd comment` warning is posted so the agent re-reads the spec.
- **All plan tasks closed** → `--all` count is non-zero, so the preflight does
  not falsely re-import completed work.
- **Stale bootstrap bead** → the "initialize Beads" bootstrap task from
  `foundation/beads.md` carries no `plan_task_id` metadata, so it is excluded
  from every plan-issue count and never masks an empty import.
- **mvp without custom types** → `-t story` is unavailable; tasks use `-t task`
  and record story linkage in metadata/body.
- **`bd` older than v1.0.5** → degrade gracefully: print a message and skip
  (the build loop still works off the markdown plan).

## Open Questions / Risks

- **Exact `bd dep list` / `bd label` JSON shapes** must be confirmed against the
  installed `bd` during implementation; the three-pass logic assumes
  `bd dep list <id> --json` and `bd label add` exist (present in v1.0.5; verify
  the minimum-version floor before shipping).
- **Metadata value typing.** `wave`/`risk` are stored as metadata strings;
  confirm the dashboard's Beads section reads them consistently if it surfaces
  waves.

## Testing Strategy

- **Frontmatter validation** (bats): the new prompt passes `make validate` with
  the correct `finalization` phase, `order: 1440`, `conditional: "if-needed"`,
  and `dependencies: [implementation-playbook]`.
- **Task-ID prerequisite** (bats): `implementation-plan.md` requires and
  documents a stable task-ID format; the review step validates uniqueness and
  stability.
- **Mapping checks**: given a sample `docs/implementation-plan.md`, the emitted
  `bd` command sequence matches expectations for mvp (flat, `-t task`, no
  story) and deep (hierarchical, `-t story`/`-t epic`, wave-biased priority),
  asserted via a dry-run / command-capture harness.
- **Idempotency**: running the materialize steps twice over the same plan yields
  `C created` then `0 created, 0 updated` — no duplicates (join on
  `plan_task_id`).
- **State preservation**: an issue marked `in_progress` (and one `blocked`, one
  `closed`) is left field-untouched on re-run even when its plan description
  changed; an `in_progress` issue with changed AC receives a `bd comment`
  warning.
- **Stale reconcile**: removing a task from the plan closes the corresponding
  `open` issue with a reason + `stale:removed-from-plan` label; removing it
  while in_progress flags it for review instead of closing.
- **Dependency reconcile**: removing a plan dependency removes the stale Beads
  edge for an `open` dependent; `bd dep cycles` reports no cycle after a valid
  run.
- **`--all` visibility**: a project whose plan tasks are all `closed` is not
  re-imported by the preflight (count via `--has-metadata-key plan_task_id`
  includes closed issues).
- **Concurrency**: two simulated agents hitting the `multi-agent-start.md`
  preflight with `COUNT=0` produce exactly one import (orchestrator-only +
  merge-slot lock), no duplicate issues.
