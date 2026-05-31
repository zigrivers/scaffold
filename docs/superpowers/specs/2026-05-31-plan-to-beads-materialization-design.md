# Plan → Beads Materialization — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorm complete; pending implementation plan)
**Author:** Scaffold maintainers

> **Command-surface note.** Every `bd` command and flag in this spec was verified
> against the installed **Beads v1.0.5** CLI (`--help` output) and the repo's
> existing integration docs (`content/tools/review-pr.md`,
> `docs/audits/beads-integration-audit-2026-05-24.md`). Verified facts used below:
>
> - `bd list` has **no** `--external-ref` filter. It **does** support `--all`
>   (include closed), `-n/--limit int` (**default 50; `0` = unlimited**),
>   `-s/--status {open,in_progress,blocked,deferred,closed}`, `--json`,
>   `--has-metadata-key`, `--metadata-field key=value`.
> - `bd create` accepts `-t/--type`, `-p/--priority`, `--metadata`,
>   `--external-ref`, `--description`, `--parent <id>`, `--deps`.
> - `bd update <id>` accepts `--title`, `-d/--description`, `-p/--priority`,
>   `-s/--status`, `--parent <id>` (`--parent ""` removes parent), `--claim`.
> - `epic` is a **built-in** type (`bug|feature|task|epic|chore|decision`);
>   `story` requires `bd config set types.custom`.
> - `bd dep add <blocked> <blocker>` / `bd dep remove`; `bd dep list <id> --json`
>   (`--direction down|up`); `bd dep cycles` detects cycles.
> - `bd close <id> --reason "..."`; `bd comment <id> "..."` (list via
>   `bd comments <id>`); `bd label add <id> <label>`.
> - **Readiness is computed, not a stored `blocked` status** (verified
>   empirically on v1.0.5): adding a dependency leaves the dependent at
>   status `open`; `bd ready` simply *excludes* issues that have an open blocker,
>   and removing the last blocker makes the issue ready again automatically — no
>   manual status flip needed. A stored `blocked`/`deferred` status is therefore
>   an explicit, deliberate signal, never an automatic by-product of deps.
> - `bd ready` accepts `--claim`, `--has-metadata-key`, `--metadata-field`,
>   `-l/--label`, `-a/--assignee` (so the claim loop can be scoped to
>   plan-derived issues).
> - `bd merge-slot {acquire,check,release}`. **Caveat:** `acquire --wait` only
>   *adds the caller to the waiters queue* if the slot is held — it does **not**
>   guarantee the caller holds the slot on return. Ownership must be re-verified
>   via `bd merge-slot check` before proceeding.
> - `bd version` prints e.g. `bd version 1.0.5 (Homebrew)` — parseable for a
>   version gate.
>
> The **minimum supported `bd` version is v1.0.5**. Below it, the feature
> degrades by handing the build phase back to the markdown plan (see
> "Version gating & graceful degradation").

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

## Prerequisite: the Plan Output Contract

The materializer parses `docs/implementation-plan.md` and needs a **defined,
machine-readable structure** to read from — and a stable join key to upsert
idempotently. Today `implementation-plan.md` leaves both underspecified. This
feature therefore depends on a prerequisite change to the planning step that
ships **before** the materializer can rely on it.

`content/pipeline/planning/implementation-plan.md` (and its review step) must
require every plan to emit the following contract:

1. **Stable task IDs.** Every task carries a unique, format-defined ID
   (`T-001`, `T-002`, … monotonic, never reused), assigned in fresh mode and
   preserved verbatim across update-mode runs.
2. **Stable container IDs (deep only).** Every story carries `S-001`… and every
   epic `E-001`…, same stability rules. These become the `plan_story_id` /
   `plan_epic_id` join keys so re-runs don't duplicate parents.
3. **Per-task fields, in a parseable block:**
   - `id`, `title`
   - `priority` (optional; `P0`–`P3`)
   - `wave` (deep; integer)
   - `risk` (deep; short type string)
   - `story` / `epic` parent IDs (deep)
   - `depends_on` — list of task IDs (the DAG edges)
   - `acceptance_criteria` — a delimited block copied verbatim into the issue
     body
4. **A canonical serialization.** The exact markdown shape (e.g. a per-task
   heading plus a fenced `yaml`/key-value metadata block) is defined in the
   `implementation-plan.md` edit so the materializer has unambiguous parsing
   rules. The implementation-plan **review** step validates that every task has
   an ID, IDs are unique and stable, and the contract fields parse.

Without this contract the join key is undefined and the materializer has no
parsing rules; both are prerequisites, tracked as the first tasks of this
feature's implementation plan.

## Source-of-Truth Contract

- The **markdown plan/playbook** are the design source of truth — version
  controlled, reviewed, already supporting an update-mode philosophy. They own
  *what* the tasks are: scope, dependencies, acceptance criteria, and the set of
  tasks/stories/epics that exist.
- **Beads** owns *execution state*: open / in_progress / blocked / deferred /
  closed, plus claims and assignees.
- The materializer is a **one-way reconcile**: plan → Beads. Each run performs
  ordered passes — **container upsert → task upsert → dependency reconcile →
  stale reconcile**. It freely updates issues that have **not started**
  (`open`/`blocked`/`deferred` — `blocked` is just a task with unmet
  dependencies), and never mutates issues that have **started**
  (`in_progress`/`closed`).

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
    Beads Detection block          ←  ADD preflight: "if Beads usable and plan
                                       has IDs but no plan-derived issues exist →
                                       materialize first, then claim"
```

Because pipeline steps auto-expose as slash commands, the new step is also
invocable as **`/scaffold:materialize-plan-to-beads`**, which doubles as the
manual re-import command after a plan update.

### Enablement & gating

- Frontmatter `conditional: "if-needed"` keeps it out of non-Beads pipelines.
- **Methodology presets must enable it.** Pipeline steps are enumerated in
  `content/methodology/*.yml`; the new step is added to the relevant presets/
  overlays, conditionally enabled for Beads-capable configurations, so it
  actually appears in the assembled pipeline (validated by an assembly test —
  see Testing Strategy).
- `dependencies: [implementation-playbook]` so it runs after the plan is
  finalized.

### Version gating & graceful degradation

Both the materializer and the build prompts gate on a single shared
**`beads_usable`** check. It must return false (→ markdown fallback) unless
**all** of the following hold, so the build never attempts `bd` against a
tracker it cannot correctly drive:

1. `.beads/` exists.
2. `bd` is on the PATH (`command -v bd`) — `command -v bd` alone is insufficient
   because an old `bd` would run and fail on unsupported flags, hence (3).
3. `bd version` parses to **≥ 1.0.5**, using a **portable** numeric compare that
   does **not** depend on GNU `sort -V` (Scaffold runs on macOS/BSD where `-V`
   may be absent) — split major/minor/patch and compare numerically, or use a
   repo-provided helper.
4. `jq` is on the PATH (every count/lookup pipes through `jq`; without it the
   preflight would fail rather than degrade).

The exact, tested shell for `beads_usable` is authored in the implementation
prompt and its bats tests — this spec fixes the **contract** (the four
conditions and the macOS-portable compare), not a copy-pasteable snippet.
Never write `[ -d .beads ] && bd ...` as a whole command — it returns exit 1
when `.beads/` is absent and breaks callers under `set -e` (the trap documented
at `single-agent-start.md:164`).

**When `bd` is missing, too old, or `.beads/` is absent:** the materializer
prints a clear message and skips. Critically, the **build prompts must then
treat Beads as absent** and drive the loop from the markdown plan/playbook —
they must NOT fall through to `bd ready --claim` against an empty/unsupported
tracker (that would reproduce the exact false-done bug this spec fixes). The
Beads Detection block is therefore gated on `beads_usable`, not on `[ -d .beads ]`.

## The Mapping (methodology-scaled)

### Depth detection

The prompt determines structure from the project, not assumption:

- **Methodology/depth** comes from scaffold state (`.scaffold/config.yml` /
  methodology preset) the same way other prompts read it.
- **Whether `-t story` is usable** is detected at runtime:
  `bd config get types.custom` — if it includes `story`, use `-t story`;
  otherwise fall back to `-t task` and record story linkage in metadata/body.
  (`epic` is built-in and always available.)

| Plan element | mvp (flat) | deep (hierarchical) |
|---|---|---|
| Task | `bd create -t task` | `bd create -t task --parent <story-id>` |
| Story | — (linkage in metadata/body) | `bd create -t story --parent <epic-id>` (if `story` in types.custom; else `-t task`) |
| Epic | — | `bd create -t epic` |
| Priority / order | `-p <n>` (wave-biased default) | `-p <n>` (wave-biased default) |
| Dependencies (DAG) | `bd dep add <blocked> <blocker>` | `bd dep add <blocked> <blocker>` |
| Acceptance criteria | issue body | issue body |
| Wave / risk | — | metadata `wave=N`, `risk=<type>` |
| Traceability | metadata `plan_task_id` (+ body note) | metadata `plan_task_id`/`plan_story_id`/`plan_epic_id` + `--parent` links |

- **custom:depth(1-5)** dials between flat and hierarchical: depth 1–2 flat,
  depth 3 adds dependencies, depth 4 adds story parents + wave metadata, depth 5
  adds epic grandparents, risk metadata, and full traceability.

### Priority mapping (wave-biased)

1. **Explicit plan priority wins**: `P0`→`-p 0` … `P3`→`-p 3`.
2. **Otherwise bias by wave** so `bd ready` surfaces work in playbook order:
   Wave 1 → `-p 1`, Wave 2 → `-p 2`, Wave 3+ → `-p 3` (clamp at 3).
   Dependencies still gate readiness; the bias only orders among ready tasks.
3. **No priority and no waves** (mvp) → default `-p 2`, rely on dependencies.

## Idempotency & Reconcile Algorithm

Join keys are **Beads metadata** — natively filterable
(`--has-metadata-key`, `--metadata-field key=value`): `plan_task_id` for tasks,
`plan_story_id` for stories, `plan_epic_id` for epics. Title prefixes are **not**
used as join keys (retitling would sever the link → duplicates).
`--external-ref "plan:<id>"` is stamped at create for human traceability only
(`bd list` has no external-ref filter in v1.0.5).

**All full-set queries use `--all --limit 0`** so neither closed issues nor
result-set pagination (default 50) hides records.

### Pass 0 — Container upsert (deep only), top-down

Process **epics first, then stories**, capturing each created/looked-up Beads ID
so children can reference it via `--parent`:

```bash
# Epic E-001
ID=$(bd list --all --limit 0 --metadata-field "plan_epic_id=E-001" --json | jq -r '.[0].id // empty')
[ -z "$ID" ] && ID=$(bd create "<epic title>" -t epic \
  --metadata '{"plan_epic_id":"E-001"}' --external-ref "plan:E-001" --json | jq -r '.id')
# Story S-001 (parent = resolved epic ID), same lookup-or-create with plan_story_id
```

Story/epic upsert follows the same open-vs-non-open rules as tasks (below);
reparenting an `open` container uses `bd update <id> --parent <new>`.

### Pass 1 — Task upsert

For each plan task (`<task-id>`), parent IDs already resolved by Pass 0:

1. **Look up:** `bd list --all --limit 0 --metadata-field "plan_task_id=<task-id>" --json`
2. **Create if absent:**
   ```bash
   bd create "<title>" -t <type> -p <prio> \
     --parent "<resolved-story-or-epic-id>" \
     --metadata '{"plan_task_id":"<task-id>","wave":"<n>","risk":"<type>"}' \
     --external-ref "plan:<task-id>" \
     --description "<body incl. acceptance criteria + traceability>"
   ```
3. **If present, branch on stored status.** The key distinction is
   **not-yet-started vs. started**, not "open vs. everything else":
   - **`open`, `blocked`, `deferred`** → **update fields to match the plan**
     (`bd update <id> --title … -d … -p … --parent …`). These are all
     *not-started* states, so mutating their fields (title/body/priority/parent)
     is safe — it never changes execution status or readiness. Note (verified):
     dependency-blocked tasks stay `open`, **not** `blocked`; a stored
     `blocked`/`deferred` status is an explicit human/agent signal, and updating
     its descriptive fields neither unblocks it nor disturbs that signal.
   - **`in_progress`** → **do not mutate fields** (work is underway). If the
     plan's AC/description changed, post a warning — **idempotently**: store a
     hash of the last-warned plan text in metadata `ac_warn_hash` (set with the
     verified targeted flag `bd update <id> --set-metadata ac_warn_hash=<hash>`,
     **not** `--metadata`, which replaces the whole object) and post the
     `bd comment` only when the hash differs, so re-runs don't spam comments.
   - **`closed`** → leave entirely untouched.

### Pass 2 — Dependency reconcile

Run after all issues exist (forward references resolved).

- **Add** missing edges, but only when the dependent issue is **`open`,
  `blocked`, or `deferred`** (never add edges to `in_progress` or `closed`
  work, which could disrupt execution invariants):
  `bd dep add <blocked-id> <blocker-id>` (re-adding is a no-op).
- **Remove** stale edges (in the plan no longer) for dependents in
  **`open`, `blocked`, or `deferred`** state; only `in_progress`/`closed` are
  exempt: `bd dep remove <blocked-id> <blocker-id>`. Compare current edges via
  `bd dep list <id> --json --direction down`.
- **No manual status reconciliation is needed** after add/remove. Readiness is
  computed from open blockers (verified): removing the last blocker makes a task
  ready again on its own; adding a blocker excludes it from `bd ready` while
  leaving its stored status `open`.
- **Detect cycles** after applying: `bd dep cycles` — surface any cycle as an
  error (the plan DAG is validated upstream, but a manual edit could reintroduce
  one).

### Pass 3 — Stale reconcile (tasks/containers removed from the plan)

List every plan-derived issue
(`bd list --all --limit 0 --has-metadata-key plan_task_id --json`, likewise for
`plan_story_id`/`plan_epic_id`) and diff IDs against the current plan:

- ID no longer in the plan and issue **not started** (`open`/`blocked`/
  `deferred`) → close + label:
  ```bash
  bd close <id> --reason "Removed from implementation plan (no <id-kind> <id>)"
  bd label add <id> stale:removed-from-plan
  ```
- Such an issue **started** (`in_progress`/`closed`) → **do not auto-close**;
  report it in the summary for human attention (it may be mid-flight work the
  plan dropped by mistake).

### Summary report

```
materialize: C created, U updated, K unchanged,
             S skipped (in_progress/closed — started, not mutated),
             D deps added, R deps removed,
             X stale closed, W stale flagged for review
```

## Build Preflight

Extend the **Beads Detection** block in both build prompts. The decisive
**control-flow rule** (it is what prevents reintroducing the false-done bug):

> **The claim loop is reached only when a confirmed, positive count of
> `plan_task_id` issues exists, and it claims only plan-derived issues:**
> `bd ready --claim --has-metadata-key plan_task_id --json`. Scoping by
> `plan_task_id` is required so the loop never claims the bootstrap "initialize
> Beads" bead or any manually-created issue — only materialized plan tasks.
> In every other branch the prompt drives the loop from the markdown
> playbook/plan instead — it must never fall through to a claim against an empty
> or unpopulated tracker.

Decision table for the Beads Detection block:

| Condition | Action |
|---|---|
| `beads_usable` false (no `.beads/`, no/old `bd`, no `jq`) | Markdown playbook loop. Do **not** call `bd`. |
| Usable; `plan_task_id` count > 0 | Scoped claim loop: `bd ready --claim --has-metadata-key plan_task_id --json`. |
| Usable; count = 0; plan exists **with** stable task IDs | Materialize (locked — see Concurrency), re-count; if now > 0 → claim loop, else markdown loop. |
| Usable; count = 0; plan exists **without** stable task IDs | Markdown loop + emit "re-run planning to assign task IDs". Do **not** claim. |
| Usable; count = 0; materialize command returns non-zero | Markdown loop + surface the error. Do **not** claim. |

The count is taken with `bd list --all --limit 0 --has-metadata-key
plan_task_id --json | jq 'length'`, with `jq`/`bd` failures defaulting the count
to a sentinel that routes to the markdown loop (never to a blind claim). The
preflight is idempotent — re-import is a no-op once issues exist. The exact,
tested shell lives in the implementation prompt; this spec fixes the routing
rule above.

### Concurrency (multi-agent)

The **primary** materialization path is the sequential finalization step, which
runs **once** before any build wave fans out — so the preflight is normally a
no-op. The defensive preflight in `multi-agent-start.md` must still be safe under
concurrency: multiple agents can read `count = 0` simultaneously (TOCTOU) and
create duplicates. The implementation must satisfy **all** of these requirements
(verified against `bd merge-slot` v1.0.5 semantics — `acquire --wait` only
*queues* the caller and returns non-zero while queued; release leaves
`holder: null` rather than auto-promoting the next waiter):

1. **Orchestrator-only** — only the wave orchestrator / first agent runs the
   defensive import; workers wait for it before their first `bd ready --claim`.
2. **Real acquisition loop, not a status poll** — loop on
   `bd merge-slot acquire` itself (re-attempt until it succeeds and reports the
   caller as holder via `bd merge-slot check --json`); a loop that only *checks*
   status deadlocks, because a released slot is `holder: null` and never
   promotes a waiter.
3. **`set -e`-safe** — the queued/held `acquire` returns non-zero, so guard it
   (`|| true`) and release via a `trap … EXIT INT TERM`.
4. **Per-process unique identity** — set a unique holder
   (e.g. `BEADS_ACTOR="agent-$$"` or a UUID) **before** acquiring; otherwise two
   local agents sharing one `git config user.name` both see `holder == <name>`
   and each assume they hold the slot. The identity fallback must also match
   `bd`'s own actor resolution (`BEADS_ACTOR` → `git user.name` → `$USER`) so the
   ownership check can't compare against an empty string.
5. **Re-check inside the lock** — re-count `plan_task_id` after acquiring and
   import only if still 0, then release.

`single-agent-start.md` has no concurrency concern and uses the plain preflight.
The exact locking shell is authored and bats-tested in the implementation
prompt.

## Files to Touch

- **New:** `content/pipeline/finalization/materialize-plan-to-beads.md`
  — Mode Detection + Update Mode Specifics blocks, methodology scaling, depth
  detection, version guard, four-pass reconcile, idempotency summary.
- **Edit (prerequisite):** `content/pipeline/planning/implementation-plan.md`
  — define and require the Plan Output Contract (stable task/story/epic IDs,
  per-task field block, canonical serialization).
- **Edit:** `content/pipeline/planning/implementation-plan-review.md` — validate
  ID presence/uniqueness/stability and that the contract parses.
- **Edit:** `content/pipeline/build/single-agent-start.md` — `beads_usable`-gated
  Beads Detection + plain preflight + markdown fallback when Beads unusable;
  **change the existing `bd ready --claim` to the scoped
  `bd ready --claim --has-metadata-key plan_task_id --json`** so only plan tasks
  are claimed.
- **Edit:** `content/pipeline/build/multi-agent-start.md` — same (incl. scoped
  claim), plus orchestrator-only + ownership-verified merge-slot lock.
- **Edit:** `content/pipeline/foundation/beads.md` — one line noting the plan is
  materialized into Beads later, so users aren't surprised Beads starts empty.
- **Edit:** `content/methodology/*.yml` presets/overlays — enable the new step
  for Beads-capable configurations.
- **Edit (if required):** `src/types/frontmatter.ts` — only if the validator
  needs the new prompt registered beyond its frontmatter (the `finalization`
  phase already exists).
- **Tests:** bats coverage (see Testing Strategy).
- **Docs:** note the new step in the pipeline reference and `CHANGELOG.md`.

## Edge Cases

- **Beads enabled after planning** → preflight materializes before first claim.
- **Plan updated post-import** → upserts not-started tasks
  (`open`/`blocked`/`deferred`), reconciles added/removed deps, closes
  stale-but-not-started issues, preserves **started** (`in_progress`/`closed`)
  state.
- **Task/container removed from plan** → Pass 3 closes if not started
  (`open`/`blocked`/`deferred`); flags for review if started.
- **Dependency removed from plan** → Pass 2 removes the edge for
  open/blocked/deferred dependents (so blocked tasks can be unblocked).
- **AC/description changed while in_progress** → fields untouched; a single
  `bd comment` warning posted per distinct change (`ac_warn_hash` guards spam).
- **All plan tasks closed** → `--all --limit 0` count is non-zero, so the
  preflight does not falsely re-import completed work.
- **More than 50 plan tasks** → `--limit 0` ensures stale/preflight passes see
  the full set (default page size is 50).
- **Plan missing task IDs** (pre-prerequisite plan or hand-edited/corrupted) →
  the materializer emits a clear error pointing to re-running the planning phase;
  the preflight also gates on ID presence and falls back to the markdown loop
  rather than importing with no join key.
- **Stale bootstrap bead** → the "initialize Beads" bootstrap task carries no
  `plan_task_id`, so it is excluded from every count and never masks an empty
  import.
- **mvp without custom types** → `-t story` unavailable (detected via
  `bd config get types.custom`); tasks use `-t task` with story linkage in
  metadata/body.
- **`bd` missing/older than v1.0.5** → materializer skips with a message **and**
  build prompts drive from the markdown plan (no `bd ready --claim` on an
  empty/unsupported tracker).
- **`jq` missing** → `beads_usable` returns false, so the build prompt drives
  from the markdown plan rather than attempting (and failing) a `bd`+`jq`
  pipeline; the materialize prompt notes `jq` as a dependency.

## Verification Checklist (confirm during implementation)

Confirm the exact invocation/JSON shape of **every** subcommand the final
prompts use, against the project's installed `bd`:

- `bd list --all --limit 0 --has-metadata-key … --metadata-field …=… --json`
  (filtering + JSON `.metadata` shape)
- `bd create … --parent --metadata --external-ref --description --json`
  (returned `.id`)
- `bd update <id> --title -d -p --parent --set-metadata key=value` — use the
  **targeted** `--set-metadata` (verified present in v1.0.5) for single-key
  writes like `ac_warn_hash`; `--metadata` **replaces** the whole object and
  must not be used for partial updates
- `bd ready --claim --has-metadata-key plan_task_id --json` (scoped claim —
  verified to accept the filter and exclude non-plan issues on v1.0.5)
- `bd dep add` / `bd dep remove` / `bd dep list <id> --json` / `bd dep cycles`
- `bd close <id> --reason`, `bd comment <id>` / `bd comments <id>`,
  `bd label add <id> <label>`
- `bd merge-slot acquire` / `bd merge-slot check --json` (holder field) /
  `bd merge-slot release`, and that the trap-release + acquisition-loop pattern
  matches the safe usage documented at `single-agent-start.md:164`
- `bd version` string parsing for the `>= 1.0.5` gate, using a **macOS/BSD-safe**
  numeric compare (no GNU `sort -V` dependency)
- `bd config get types.custom` output shape for `story` detection

## Testing Strategy

- **Frontmatter validation** (bats): new prompt passes `make validate` with
  `finalization` phase, `order: 1440`, `conditional: "if-needed"`,
  `dependencies: [implementation-playbook]`.
- **Pipeline assembly** (bats): with a Beads-capable methodology preset, the
  assembled pipeline includes `materialize-plan-to-beads` positioned after
  `implementation-playbook`; with Beads disabled, it does not appear.
- **Plan Output Contract** (bats): `implementation-plan.md` requires/defines the
  contract; the review step rejects a plan with missing/duplicate/unstable IDs
  and accepts a conformant one.
- **Mapping checks**: a sample plan yields the expected `bd` command sequence for
  mvp (flat, `-t task`, no story, default `-p 2`) and deep (epic→story→task
  order, `--parent` wiring, wave-biased priority), via a dry-run/command-capture
  harness.
- **Idempotency**: running twice over the same plan yields `C created` then
  `0 created, 0 updated` — no duplicate tasks **or** containers (`plan_*_id`
  joins).
- **State preservation**: `in_progress` and `closed` issues are field-untouched
  on re-run even when plan text changed; a `blocked` issue (not started) **is**
  updated to match the plan; an `in_progress` issue with changed AC gets exactly
  **one** `bd comment` per change (`ac_warn_hash` via `--set-metadata`), not one
  per run.
- **Stale reconcile**: removing a task closes the `open` issue with reason +
  `stale:removed-from-plan`; removing it while in_progress flags for review.
- **Dependency reconcile**: removing a plan dep removes the edge for an `open`
  **and** a `blocked` dependent (unblocking it); deps are not added to
  `in_progress`/`closed` issues; `bd dep cycles` reports no cycle after a valid
  run.
- **Scale**: a plan with >50 tasks is fully reconciled (`--limit 0`), with a
  test asserting no truncation at the default page size.
- **`--all` visibility**: an all-`closed` plan is not re-imported by the preflight.
- **Claim scoping**: with a bootstrap bead (no `plan_task_id`) plus materialized
  plan tasks present, the build loop's `bd ready --claim --has-metadata-key
  plan_task_id` never claims the bootstrap bead or a manually-created issue.
- **Concurrency**: two simulated agents hitting the `multi-agent-start.md`
  preflight with `COUNT=0` produce exactly one import (orchestrator-only +
  ownership-verified lock), no duplicates.
- **Degradation**: with `bd` absent/older than v1.0.5, the build prompt drives
  from the markdown playbook and never calls `bd ready --claim`.
