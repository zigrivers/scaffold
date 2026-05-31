---
name: materialize-plan-to-beads
description: Materialize the implementation plan into Beads issues before the build phase
summary: "When Beads is enabled, converts docs/implementation-plan.md into Beads issues — creating, updating, and reconciling tasks/stories/epics and their dependencies idempotently — so the build phase has a populated tracker to claim from."
phase: "finalization"
order: 1440
dependencies: [implementation-playbook]
outputs: []
conditional: "if-needed"
stateless: true
category: pipeline
knowledge-base: [task-tracking]
---

## Purpose
Materialize the frozen implementation plan into Beads (`bd`) issues so the build
phase has a populated tracker to claim work from. Reads
`docs/implementation-plan.md` and creates, updates, and reconciles the
corresponding epics, stories, tasks, and dependency edges in Beads.

## Inputs
- **`docs/implementation-plan.md`** (required) — the frozen plan emitting the
  Plan Output Contract: stable task IDs (`T-001`…), stable container IDs
  (`S-001`/`E-001`, deep only), and per-task / per-container metadata blocks
  (`id`, `title`, `priority`, `wave`, `risk`, `story`/`epic` parent refs,
  `depends_on`, `acceptance_criteria`). This is the design source of truth for
  *what* the tasks are.
- **`docs/implementation-playbook.md`** (optional but expected) — wave ordering
  and per-task context used to enrich issue descriptions and to compute the
  wave-biased default priority.
- **`.beads/`** (required for materialization) — the Beads database initialized
  by the foundation `beads.md` step. Its presence is the signal that this
  project tracks work in Beads; its absence routes to the markdown fallback (see
  Instructions → degradation split).
- **Scaffold state** (`.scaffold/config.yml` / methodology preset) — supplies
  the methodology/depth that governs whether containers, waves, and risk
  metadata are materialized.

## Expected Outputs
- Beads issues for every plan task (and, deep only, every story/epic container),
  joined to the plan by metadata keys `plan_task_id` / `plan_story_id` /
  `plan_epic_id`, with `--external-ref "plan:<id>"` stamped for human
  traceability.
- All plan dependency edges materialized via `bd dep add`, with the
  materializer-owned blocker set recorded per issue in `plan_deps`.
- A reconciled tracker: not-started issues updated to match the plan, started
  (`in_progress`/`closed`) issues preserved, removed-from-plan not-started issues
  retired, and stale duplicates collapsed to one canonical issue per join key.
- A deterministic one-line **summary report** (`materialize: …`).
- On success, a **run-stamped materialization-complete signal** that build
  workers wait on before claiming.
- This step writes **no markdown documents** (`outputs: []`); its product is the
  state of the Beads database plus the printed summary.

## Methodology Scaling
Structure is a function of **methodology/depth only** — read it from scaffold
state, never probe `bd` for type availability. Both `-t story` and `-t epic` are
usable directly on the supported `bd` (≥ v1.0.5); mvp stays flat as a deliberate
*simplicity* choice, not because the type is unavailable.

- **mvp / depth 1–3** → flat `-t task` issues **plus dependencies**. No
  story/epic containers, no `--parent`. (Depth 3 vs 1–2 differs only in upstream
  plan sizing/detail, not in what is materialized.) Skip Pass 0b.
- **depth 4** → tasks parented to **stories** (`-t story`) + `wave` metadata.
  Stories have **no** epic parent (`--parent` omitted — a missing epic ref is
  valid, not a dangling ref). Pass 0b creates stories only.
- **depth 5** → full **epic → story → task** hierarchy + `risk` metadata + full
  traceability; stories carry an epic `--parent`.

**Priority is wave-biased** so `bd ready` surfaces work in playbook order:

1. **Explicit plan priority wins**: `P0`→`-p 0`, `P1`→`-p 1`, `P2`→`-p 2`,
   `P3`→`-p 3`.
2. **Otherwise bias by wave**: Wave 1 → `-p 1`, Wave 2 → `-p 2`, Wave 3+ →
   `-p 3` (clamp at 3). Dependencies still gate readiness; the bias only orders
   *among* ready tasks.
3. **No priority and no waves** (mvp) → default `-p 2`, rely on dependencies.

**Dependencies are always materialized**, at **every** depth (including mvp). The
plan is a DAG at every depth, and without the `bd dep add` edges the scoped
`bd ready --claim` would expose dependent tasks out of order. Depth governs only
**hierarchy** (story/epic parents), **wave**, and **risk** — never *whether*
dependencies exist.

## Mode Detection
This step is **idempotent and re-runnable**: running it again reconciles the
current plan against existing Beads issues rather than duplicating them. There is
no separate "fresh" vs. "update" code path — the same four passes
(duplicate-guard → container upsert → task upsert → dependency reconcile → stale
reconcile) cover both. Detect which case you are in by the join-key fetch:

- **No plan-derived issues exist yet** (`bd list --all --limit 0
  --has-metadata-key plan_task_id --json` returns `[]`) → effectively a fresh
  import: every pass falls through to "create".
- **Plan-derived issues already exist** → reconciliation: each pass looks up by
  join key and creates / updates / retires as needed.

Because the build preflight invokes this step **unconditionally** before every
claim loop, design every pass to be a cheap **lookup-and-reconcile no-op when
already in sync** (a second run over an unchanged plan reports `0 created,
0 updated`).

## Update Mode Specifics
Reconcile plan changes into Beads **one-way (plan → Beads)** without clobbering
started work:

- **Preserve started state.** Never mutate the content fields, execution status,
  claims, or assignees of issues in a **started** status (`in_progress` or
  `closed`). Freely update the content fields
  (title/description/priority/parent/wave/risk) of **not-started**
  (`open`/`blocked`/`deferred`) issues to match the plan.
- **Two narrow metadata-only exceptions** to "never touch started issues" — each
  touches a single metadata tag, is reported, and changes no content field,
  status, claim, or assignee:
  1. **Join-key cleanup (Pass 0a)** — a started *non-canonical duplicate* may have
     its own join key `--unset-metadata`'d to restore the one-key invariant.
  2. **AC-drift bookkeeping (Pass 1)** — an `in_progress` issue whose plan AC
     changed may get `--set-metadata ac_warn_hash=…` so the warning comment posts
     once per distinct change, not every run.
- **Triggers handled:** new task IDs added (created), content-only edits
  (title/AC/priority/parent/deps changed with no ID change → not-started issues
  updated, edges reconciled), dependency add/remove, and tasks/containers removed
  from the plan (retired if not-started, flagged if `in_progress`, left linked if
  `closed`).
- A dependency-blocked task stays stored `open` — blockers affect *computed*
  readiness, not stored status; a stored `blocked`/`deferred` is an explicit
  signal that descriptive-field updates neither set nor clear.

## Instructions

Execute the steps below in order. All `bd` commands use the verified v1.0.5
surface — do **not** invent flags (in particular, there is **no `bd list
--external-ref` filter**; join by metadata keys only).

### Gate on `beads_usable` (version + tooling), then split degradation

Compute a single shared `beads_usable` check. It is true **only** when *all* of:

1. `.beads/` exists.
2. `bd` is on PATH (`command -v bd`).
3. `bd version` parses to **≥ 1.0.5**, using a **macOS/BSD-portable** numeric
   compare (do **not** depend on GNU `sort -V`). Split major/minor/patch and
   compare numerically.
4. `jq` is on PATH (`command -v jq`).

```bash
beads_usable() {
  [ -d .beads ] || return 1
  command -v bd >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1
  # Portable >= 1.0.5 compare — no `sort -V` (absent on macOS/BSD).
  local ver have_major have_minor have_patch
  ver=$(bd version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  [ -n "$ver" ] || return 1
  IFS=. read -r have_major have_minor have_patch <<EOF
$ver
EOF
  # Compare against floor 1.0.5
  if [ "$have_major" -gt 1 ]; then return 0; fi
  if [ "$have_major" -lt 1 ]; then return 1; fi
  if [ "$have_minor" -gt 0 ]; then return 0; fi
  if [ "$have_minor" -lt 0 ]; then return 1; fi
  [ "$have_patch" -ge 5 ]
}
```

> **Never** write `[ -d .beads ] && bd …` as a whole command — it returns exit 1
> when `.beads/` is absent and breaks callers under `set -e`. Always branch on
> the function's return code with an explicit `if`.

**Degradation splits on whether `.beads/` exists** — markdown is safe *only* when
there is no Beads state to diverge from:

- **`.beads/` absent** → genuinely a non-Beads project. Stop materializing and
  let the build drive from the markdown plan/playbook. (Nothing to do here; this
  prompt only runs when Beads is enabled.)
- **`.beads/` present but `bd`/`jq` missing or too old** (`beads_usable` false)
  → **FAIL CLOSED.** Do **not** markdown-fallback — the tracker may already hold
  execution state (claimed/closed tasks) and the markdown loop would re-run
  completed work. Stop and tell the user to install/upgrade `bd` (≥ v1.0.5) and
  `jq`.

Once `beads_usable` is true, resolve **methodology/depth** from scaffold state
(see Methodology Scaling) and parse the plan's task / container / dependency
blocks per the Plan Output Contract. Then run the passes below.

### The Retire convention

Whenever a pass removes an issue from the plan-derived set (Pass 0a duplicate
close, Pass 3 stale close), do it in **this exact order**, against the issue's
**own** join key (`plan_task_id` for a task, `plan_story_id` for a story,
`plan_epic_id` for an epic — resolved from the issue's type, never hardcoded):

1. `bd label add <id> <stale-label>` — `stale:duplicate` or
   `stale:removed-from-plan`. The **label is applied first** and is what marks the
   issue as *retired-by-the-materializer* (vs. closed as completed work).
2. `bd close <id> --reason "…"` — skipped if already `closed`.
3. **then** `bd update <id> --unset-metadata <join-key>`.

The key is unset **last** so a failure at any step is **resumable**: the issue
keeps its join key (still found next run) and carries the `stale:*` label
(recognized as retire-pending, not completed work). Each run re-applies whatever
steps are missing for any join-keyed issue bearing a `stale:*` label. Because the
`stale:*` label distinguishes a retired close from a genuine completion, two later
rules key off it: (a) Pass 0a canonical selection **excludes any `stale:*`-labelled
issue**; and (b) Pass 3 leaves a completed `closed` issue linked **only when it
carries no `stale:*` label**.

### Pass 0a — Duplicate guard (always)

Before any upsert, fetch the plan-derived issues once and group by each join key:

```bash
bd list --all --limit 0 --has-metadata-key plan_task_id  --json   # tasks
bd list --all --limit 0 --has-metadata-key plan_story_id --json   # stories (deep)
bd list --all --limit 0 --has-metadata-key plan_epic_id  --json   # epics (depth 5)
```

For any join key held by **more than one** issue (failed/manual/concurrent prior
import), restore the **exactly-one-issue-per-key invariant**:

1. **Pick the canonical issue.** First **exclude any issue already bearing a
   `stale:*` label** (retire-pending leftovers can never win). Among the rest,
   the ordering is total:
   - if **exactly one** duplicate is `in_progress` → it is canonical (active work
     wins over any `closed` or not-started copy);
   - else if any is `closed` → canonical is the **oldest** `closed` one;
   - else the **oldest not-started** issue (lowest `created_at`, ties by `id`).

   The **only** unorderable case is **two or more `in_progress` duplicates** for
   the same plan ID — there is no safe way to pick which active effort to detach,
   so **FAIL CLOSED** and report. (An `in_progress` + `closed` mix is *not* a
   conflict: `in_progress` wins.)
2. **Not-started non-canonical duplicates** → retire them per the **Retire
   convention** (`stale:duplicate` label → close → unset the issue's own
   `<join-key>`), so they leave the plan-derived set and are never re-detected.
3. **Started non-canonical duplicates** → do **not** close or mutate fields; only
   `bd update <id> --unset-metadata <join-key>` to restore key uniqueness, and
   **report** them for human review.

After Pass 0a, exactly one canonical issue retains each `plan_*_id`, so every
later bulk fetch, map, dep reconcile, stale pass, and the scoped claim loop can
rely on the one-key invariant.

### Pass 0b — Container upsert (deep only), top-down

Skip entirely at mvp / depth 1–3. **Bulk-fetch containers once** (two queries),
build in-memory `plan_epic_id → id` and `plan_story_id → id` maps, then process
**epics first, then stories** so each child can reference its parent's resolved
Beads ID via `--parent`. Containers carry the **same fields as tasks** (title,
wave-biased `-p`, description/AC, and — for stories — `--parent`).

```bash
EPIC_MAP_JSON=$(bd list --all --limit 0 --has-metadata-key plan_epic_id  --json \
  | jq 'map({ (.metadata.plan_epic_id): .id }) | add // {}')
STORY_MAP_JSON=$(bd list --all --limit 0 --has-metadata-key plan_story_id --json \
  | jq 'map({ (.metadata.plan_story_id): .id }) | add // {}')

# Epic E-001 (depth 5): look up in the epic map; create if absent.
ID=$(printf '%s' "$EPIC_MAP_JSON" | jq -r '."E-001" // empty')
[ -z "$ID" ] && ID=$(bd create "<epic title>" -t epic -p <prio> \
  --description "<epic body>" \
  --metadata '{"plan_epic_id":"E-001","wave":"<n>","risk":"<type>"}' \
  --external-ref "plan:E-001" --json | jq -r '.id')

# Story S-001: same lookup-or-create against the story map; wire --parent only
# when an epic ref is present (depth 4 stories have NO epic parent).
ID=$(printf '%s' "$STORY_MAP_JSON" | jq -r '."S-001" // empty')
[ -z "$ID" ] && ID=$(bd create "<story title>" -t story -p <prio> \
  ${EPIC_PARENT_ID:+--parent "$EPIC_PARENT_ID"} \
  --description "<story body>" \
  --metadata '{"plan_story_id":"S-001","wave":"<n>","risk":"<type>"}' \
  --external-ref "plan:S-001" --json | jq -r '.id')
```

Container upsert obeys the **same not-started-vs-started rules as Pass 1**: a
not-started (`open`/`blocked`/`deferred`) epic/story is updated to match the plan
(`bd update <id> --title … -d … -p … --parent … --set-metadata wave=… --set-metadata
risk=…`); a started (`in_progress`/`closed`) container is left untouched.
Reparenting a not-started story uses `bd update <id> --parent <new>`.

### Pass 1 — Task upsert

**Fetch existing plan-derived task issues once**, build an in-memory
`plan_task_id → issue` map (one `bd` process for the whole plan, not one per
task), then for each plan task (parent IDs already resolved by Pass 0b):

```bash
TASK_MAP_JSON=$(bd list --all --limit 0 --has-metadata-key plan_task_id --json \
  | jq 'map({ (.metadata.plan_task_id): . }) | add // {}')
EXISTING=$(printf '%s' "$TASK_MAP_JSON" | jq -r '."T-001" // empty')
```

1. **Create if absent:**
   ```bash
   bd create "<title>" -t task -p <prio> \
     ${PARENT_ID:+--parent "$PARENT_ID"} \
     --metadata '{"plan_task_id":"T-001","wave":"<n>","risk":"<type>"}' \
     --external-ref "plan:T-001" \
     --description "<body incl. acceptance criteria + traceability>"
   ```
2. **If present, branch on stored status** (not-started vs. started):
   - **`open` / `blocked` / `deferred`** → **update fields to match the plan,
     including wave/risk metadata** so nothing drifts:
     ```bash
     bd update <id> --title "<title>" -d "<body>" -p <prio> \
       ${PARENT_ID:+--parent "$PARENT_ID"} \
       --set-metadata wave=<n> --set-metadata risk=<type>
     ```
     These are not-started states; mutating their fields never changes execution
     status or readiness, and never unblocks/disturbs a stored `blocked`/`deferred`
     signal.
   - **`in_progress`** → **do not mutate fields.** If the plan's AC/description
     changed, post a warning **idempotently**: compute a hash of the current plan
     AC text; if it differs from the issue's `ac_warn_hash` metadata, post one
     `bd comment <id> "Plan AC changed since this task was started: …"` then record
     the new hash with the targeted `bd update <id> --set-metadata
     ac_warn_hash=<hash>`. Re-runs with the same AC post nothing.
   - **`closed`** → leave **entirely untouched** (do not recreate, do not edit).

### Pass 2 — Dependency reconcile

Run after all issues exist (forward references resolved). **Read existing edges
from a single bulk fetch**, not per task — `bd list --all --limit 0 --json`
carries an inline `dependencies` array (`depends_on_id`, `type`) on each issue.
Reconcile in-memory against the plan's `depends_on` lists; only the mutating
calls need per-edge invocations.

**Materializer-owned edges are tracked explicitly** in the `plan_deps` metadata
key (a sorted CSV of blocker task IDs, e.g. `"T-003,T-007"`) — *not* inferred
from endpoint types. "Both endpoints are plan-derived" is **not** proof of
ownership: an agent may add an execution blocker during the build, and deleting
it just because it is absent from the markdown plan would corrupt Beads-owned
state.

For each **`open` / `blocked` / `deferred`** dependent (never mutate
`in_progress`/`closed`), reconcile against the plan's `depends_on` list:

- **Add** plan edges not already present: `bd dep add <blocked-id> <blocker-id>`
  (re-adding is a no-op).
- **Remove** an edge **only** when it is **in the prior `plan_deps`** (materializer
  created it) **and absent from the current plan**: `bd dep remove <blocked-id>
  <blocker-id>`. Edges **not** in `plan_deps` (manual/external blockers) are
  preserved untouched; a manual edge that collides with a plan edge is kept and
  noted in the summary, not deleted.
- **Rewrite `plan_deps` authoritatively** at the end of each issue's reconcile:

  > `plan_deps' = (prior plan_deps ∩ current-plan deps) ∪ (edges this run added)`

  Keep still-valid owned edges, add the ones just created, and **explicitly
  exclude any pre-existing edge that was *not* already in `plan_deps`** — even if
  it collides with a current plan dep (that edge stays manual-owned so a later
  plan removal never deletes it). Write with `bd update <id> --set-metadata
  plan_deps=<csv>` (or `bd update <id> --unset-metadata plan_deps` when empty).

A per-issue read, if ever needed, is `bd dep list <id> --direction down --json`
(verified: `down` = what `<id>` depends on, i.e. its blockers; `up` returns
dependents and is wrong here). No manual status reconciliation is needed after
add/remove — readiness is computed from open blockers.

**Detect cycles after applying:** `bd dep cycles` — surface any cycle as an error
(the plan DAG is validated upstream, but a manual edit could reintroduce one).

### Pass 3 — Stale reconcile (tasks/containers removed from the plan)

List every plan-derived issue (the three `--has-metadata-key` queries) and diff
IDs against the current plan:

- ID no longer in the plan and issue **not started** (`open`/`blocked`/
  `deferred`) → **retire it** per the Retire convention
  (`stale:removed-from-plan` label → `bd close <id> --reason "Removed from
  implementation plan (was <id>)"` → unset the issue's own `<join-key>`), so it
  drops out of future queries and can never be misread as "started/dropped".
- Such an issue **`in_progress`** → **do not auto-close.** Report it in the
  summary for human attention (it may be mid-flight work the plan dropped by
  mistake). Leave its join key intact so it stays visible until a human decides.
- Such an issue **`closed` as genuinely-completed work** (no `stale:*` label) →
  **leave it entirely untouched** (do **not** unset its join key). Plan IDs are
  never reused, so a later revert restoring the task must let Pass 1 find this
  issue by `plan_task_id` and recognize it as already `closed` — not recreate an
  `open` issue and force redone work. (A `closed` issue that **does** carry
  `stale:removed-from-plan` is a retire-pending leftover — the Retire convention
  finishes unsetting its key.)

### Summary report (deterministic)

Print exactly one line:

```
materialize: C created, U updated, K unchanged,
             S skipped (in_progress/closed — started, not mutated),
             D deps added, R deps removed,
             X stale closed, W stale flagged for review
```

where each letter is the count accumulated across the passes. A re-run over an
unchanged plan prints `0 created, 0 updated` (proof of idempotency).

### Run-stamped materialization-complete signal

On **success**, set a durable **materialization-complete signal** that build
workers wait on before their first claim. The signal **must be run-specific** —
carry a `run_id` or the current plan hash (e.g. `materialized_at=<run_id>` /
`plan_hash=<sha>` as metadata on the project merge-slot / bootstrap bead, or a
workspace marker file). **Clear/overwrite any prior signal *before* acquiring the
merge-slot lock**, so a stale signal from a previous pipeline run (or a pre-update
plan) can never let workers race ahead of a fresh re-materialization.

In the sequential finalization path there is no concurrency, but still set the
run-stamped signal so the multi-agent build preflight (which gates workers on a
signal matching **this run's** id/hash) is satisfied without re-running the
materializer. The multi-agent orchestrator runs this whole procedure **once per
wave under the merge-slot lock** (acquire via a real acquisition loop, verify
ownership with `bd merge-slot check --json`, run the idempotent materializer, set
the signal, then `bd merge-slot release` via a `trap … EXIT INT TERM`); workers
never materialize — they only wait for the signal, then claim.

## After This Step

The implementation plan is now **materialized into Beads** — every plan task
(and, on deep builds, every story/epic and dependency edge) exists as a `bd`
issue joined to the plan by `plan_task_id` / `plan_story_id` / `plan_epic_id`.
Print the summary line and tell the user:

---
**Plan materialized into Beads.** The tracker is populated and ready for the
build phase.

**Summary:** [paste the `materialize: …` line]

**Next:**
- **Single agent:** run `/scaffold:single-agent-start` to begin the scoped claim
  loop (`bd ready --claim --has-metadata-key plan_task_id`).
- **Multiple agents in parallel:** run `/scaffold:multi-agent-start` — the
  orchestrator re-runs this materializer once under the merge-slot lock before
  fan-out, then workers wait for the completion signal and claim.

**Re-running:** this step is idempotent — after any plan update, re-run
`/scaffold:materialize-plan-to-beads` to reconcile new/changed/removed tasks and
dependencies into Beads without clobbering started work.
---
