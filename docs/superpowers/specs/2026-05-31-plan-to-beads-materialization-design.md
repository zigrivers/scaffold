# Plan → Beads Materialization — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorm complete; pending implementation plan)
**Author:** Scaffold maintainers

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
  new/changed tasks without clobbering execution state.
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

## Source-of-Truth Contract

- The **markdown plan/playbook** are the design source of truth — version
  controlled, reviewed, and already supporting an update-mode philosophy.
  They own *what* the tasks are: scope, dependencies, acceptance criteria.
- **Beads** owns *execution state*: claimed / in-progress / closed.
- The materializer is a **one-way upsert**: plan → Beads. It never reads Beads
  state back into the markdown, and it never overwrites an issue that is
  in-progress or closed.

This mirrors the update-mode contract already used by `implementation-plan.md`
and `implementation-playbook.md`.

## Architecture

A new **conditional finalization prompt** plus a **defensive build preflight**.

```
Phase 14 (finalization)
  implementation-playbook.md          (order 1430) — writes the playbook
  materialize-plan-to-beads.md   ←    (order 1440, NEW, conditional: "if-needed")
                                       Reads plan + playbook → emits / upserts bd issues
Phase 15 (build)
  single-agent-start.md / multi-agent-start.md (order 1510+)
    Beads Detection block          ←  ADD preflight: "if .beads/ exists but holds
                                       no plan tasks and docs/implementation-plan.md
                                       exists → run materialization first, then claim"
```

Because pipeline steps auto-expose as slash commands, the new step is also
invocable as **`/scaffold:materialize-plan-to-beads`**, which doubles as the
manual re-import command after a plan update.

### Gating

- Frontmatter `conditional: "if-needed"` keeps it out of non-Beads pipelines.
- A runtime guard makes execution a clean no-op when Beads is absent:

  ```bash
  if [ -d .beads ] && command -v bd >/dev/null 2>&1; then
    # materialize
  else
    echo "Beads not configured — skipping plan materialization."
  fi
  ```

  Note: never write `[ -d .beads ] && bd ...` as the whole command — it returns
  exit 1 when `.beads/` is absent and breaks any caller under `set -e` (the same
  trap already documented in `single-agent-start.md:164`).

- `dependencies: [implementation-playbook]` so it runs after the plan is
  finalized.

## The Mapping (methodology-scaled)

Follows scaffold's existing methodology-scaling convention.

| Plan element | mvp (flat) | deep (hierarchical) |
|---|---|---|
| Task | `bd create -t task` | `bd create -t task`, parented to its story |
| User story | — (tasks reference it in body) | `bd create -t story` (`-t epic` for large groupings) as parent |
| Priority / order | `-p <n>` | `-p <n>` |
| Dependencies (DAG) | `bd dep add <child> <parent>` | `bd dep add <child> <parent>` |
| Acceptance criteria | issue body | issue body |
| Wave assignment | — | label / metadata `wave:N` |
| Risk flag | — | label `risk:<type>` |
| PRD / story traceability | body note | parent link + metadata |

- **deep** uses the custom types (`story`, `epic`) that `beads.md` already
  enables at deep depth via `bd config set types.custom`.
- **mvp** stays on built-in types (`bug|feature|task|epic|chore|decision`) —
  consistent with `beads.md` deliberately leaving custom types off at mvp.
- **custom:depth(1-5)** dials between the two: depth 1–2 flat, depth 3 adds
  dependencies, depth 4 adds story parents + waves, depth 5 adds risk flags and
  full traceability metadata.

### Priority mapping

The plan orders tasks and may flag priority. Map to Beads `-p`:

- Plan priority `P0`/critical-path → `-p 0`
- `P1`/high → `-p 1`
- `P2`/normal (default) → `-p 2`
- `P3`/low → `-p 3`

When the plan provides only ordering (no explicit priority), default every task
to `-p 2` and rely on dependencies for execution order.

## Idempotency

Each plan task carries a stable ID preserved across the plan's update-mode
(`implementation-plan.md` "Update Mode Specifics" preserves existing task IDs).
The materializer uses that ID as the join key:

1. **Stamp** the plan-task-ID into the Beads issue. Mechanism:
   `bd create ... --external-ref "plan:<task-id>"` (preferred — `external-ref`
   is already used by the MMR→Beads bridge for `mmr-<job-id>`). If the installed
   `bd` lacks `--external-ref`, fall back to a metadata key
   (`bd update <id> --metadata plan_task_id=<task-id>`) or a stable title prefix
   `[<task-id>]`.
2. **On every run**, look up existing issues by that key (`bd list
   --external-ref "plan:<task-id>"` or the metadata/title equivalent):
   - **missing** → create
   - **present, scope/description changed** → update title / body / deps /
     priority
   - **present, status `in_progress` or `closed`** → leave untouched
     (one-way contract: never clobber execution state)
3. **Report** a summary line:
   `materialize: N created, M updated, K unchanged, J skipped (in-progress/closed)`.

Dependencies are applied **after** all issues exist (two-pass), so a task can
declare a dependency on a sibling created in the same run. Re-applying an
existing dependency is a no-op.

## Build Preflight

In both `single-agent-start.md` and `multi-agent-start.md`, extend the **Beads
Detection** block:

```
If .beads/ exists:
  - Count plan-derived issues:
      COUNT=$(bd list --external-ref-prefix "plan:" --json 2>/dev/null | jq 'length')
      (fallback: bd list --json | jq '[.[] | select(.title | startswith("["))] | length')
  - If COUNT is 0 AND docs/implementation-plan.md exists:
      run /scaffold:materialize-plan-to-beads (or its inline steps) first.
  - Then proceed with bd ready --claim as today.
```

This guarantees correctness even if Beads was enabled *after* planning, or the
finalization step was skipped. The preflight is itself idempotent (re-import is
a no-op when issues already exist).

## Files to Touch

- **New:** `content/pipeline/finalization/materialize-plan-to-beads.md`
  — includes the mandatory Mode Detection + Update Mode Specifics blocks,
  methodology scaling, gating guard, two-pass create+dep logic, idempotency
  summary.
- **Edit:** `content/pipeline/build/single-agent-start.md` — Beads Detection
  preflight.
- **Edit:** `content/pipeline/build/multi-agent-start.md` — Beads Detection
  preflight (import runs once before the wave starts claiming).
- **Edit:** `content/pipeline/foundation/beads.md` — one line noting that the
  plan is materialized into Beads later, so users aren't surprised Beads starts
  empty.
- **Edit (if required):** `src/types/frontmatter.ts` — only if the validator
  needs the new prompt registered beyond its frontmatter. The `finalization`
  phase already exists, so the change is likely just the new file + passing
  `make validate`.
- **Tests:** bats coverage for the new prompt's frontmatter and the validate
  gate; assert the file declares `conditional: "if-needed"`,
  `dependencies: [implementation-playbook]`, and a `finalization` phase.
- **Docs:** note the new step in the pipeline reference and `CHANGELOG.md`.

## Edge Cases

- **Beads enabled after planning** → build preflight catches it and imports
  before the first claim.
- **Plan updated post-import** → re-run upserts changed tasks, preserves
  in-progress/closed.
- **Multi-agent** → the importer runs once (finalization step or single
  preflight) before agents start claiming; it is not run per-agent. The build
  preflight must be safe under concurrency — only the orchestrator/first agent
  imports, or the import completes before the wave fans out.
- **No plan yet / Beads disabled** → the step no-ops cleanly and prints why.
- **Stale bootstrap bead** → the "initialize Beads" bootstrap task created by
  `foundation/beads.md` is not plan-derived (no `plan:` external-ref) and is
  excluded from the plan-issue count, so it never masks an empty import.
- **`bd` version without `--external-ref`** → fall back to metadata key or
  title prefix as described in Idempotency; document the minimum `bd` version
  that supports the preferred path.

## Open Questions / Risks

- **Concurrency in multi-agent build preflight.** Need to ensure two agents
  don't both trigger materialization simultaneously. Mitigation: run the import
  in the finalization step (the normal path) so the preflight is almost always a
  no-op; for the defensive case, gate the preflight import behind the
  orchestrator only, or rely on the merge-slot / a simple lock. To be finalized
  in the implementation plan.
- **`bd list` filter flags.** The exact flags (`--external-ref`,
  `--external-ref-prefix`) must be verified against the installed `bd` version
  during implementation; the spec lists fallbacks for each.
- **Wave/label representation.** Whether waves and risk flags use Beads labels
  vs. metadata depends on what the installed `bd` supports; pick one during
  implementation and keep it consistent with the dashboard's Beads section.

## Testing Strategy

- **Frontmatter validation** (bats): new prompt passes `make validate` with the
  correct phase, order, conditional, and dependencies.
- **Mapping unit checks**: given a sample `docs/implementation-plan.md`, the
  emitted `bd create` command sequence matches expectations for mvp and deep
  (assert via a dry-run / command-capture harness consistent with how other
  prompt behaviors are tested).
- **Idempotency**: running the materialize steps twice over the same plan yields
  `N created` then `N unchanged` (0 created, 0 updated) — no duplicates.
- **State preservation**: an issue marked in-progress is left untouched on
  re-run even if its plan description changed.
- **Preflight**: with an empty Beads DB plus an existing plan, the build start
  prompt triggers import before claiming.
