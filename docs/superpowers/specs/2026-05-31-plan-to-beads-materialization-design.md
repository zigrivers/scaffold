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
> - `epic` **and** `story` are usable as `-t` types directly on v1.0.5 — verified
>   empirically: `bd create -t story` (and `-t epic`) succeed and store
>   `issue_type` accordingly **without** `types.custom` set. (The `bd create
>   --help` parenthetical lists only `bug|feature|task|epic|chore|decision` and
>   is stale; an older v1.0.4 audit claimed `story` needed `types.custom` — both
>   are superseded by the v1.0.5 runtime behavior.) No runtime type-availability
>   probe or `-t task` fallback is needed.
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
> The **minimum supported `bd` version is v1.0.5**. If `.beads/` is absent the
> build simply uses the markdown plan; but if `.beads/` exists while `bd`/`jq`
> are missing or too old, the build **fails closed** (it must not re-run
> possibly-completed work via markdown) — see "Version gating & graceful
> degradation".

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
4. **Per-container fields (deep only), in the same parseable form** — because
   Pass 0b creates/updates epics and stories with the same `bd create/update
   --parent -p --description --set-metadata` surface as tasks, each epic/story
   block must carry: `id`, `title`, `priority` (optional), `wave`/`risk` (if
   assigned), and `description`/AC (the container body). A story's `epic` parent
   is **optional** — epics appear only at depth 5, so a depth-4 plan has stories
   with **no** epic parent. Pass 0b wires `--parent` only when an epic ref is
   present; a missing epic ref on a story is valid, not a dangling ref. Same
   stability and canonical-serialization rules as tasks.
5. **A canonical serialization.** The exact markdown shape (e.g. a per-item
   heading plus a fenced `yaml`/key-value metadata block) is defined in the
   `implementation-plan.md` edit so the materializer has unambiguous parsing
   rules for tasks **and** containers.
6. **Referential integrity.** Every `story`/`epic` parent reference (on a task,
   and the `epic` parent on a story) **and every `depends_on` entry** must
   resolve to a declared ID — no dangling refs in either the hierarchy or the
   dependency graph (a dangling `depends_on` would make Pass 2 fail after partial
   writes or silently skip an edge, letting tasks be claimed out of order). The
   implementation-plan **review** step validates: every task has an ID;
   task/story/epic IDs are unique and stable; all parent refs **and all
   `depends_on` refs** resolve; the dependency graph is acyclic; and the contract
   fields parse for both tasks and containers.

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
  stale reconcile**. It freely updates the **content fields**
  (title/description/priority/parent/wave/risk) of issues in a **not-started**
  stored status (`open`/`blocked`/`deferred`), and **never touches the content
  fields or execution status** of issues in a **started** status
  (`in_progress`/`closed`). There are two **narrow, explicit metadata-only
  exceptions** (content fields, status, claims, and assignees are still never
  touched on started issues): **(a) join-key cleanup** — Pass 0a may
  `--unset-metadata <join-key>` on a started *non-canonical duplicate* (one-key
  invariant). (Pass 3 does **not** unset keys on `closed` removed-from-plan
  issues — they stay linked for revert-safety.) **(b) AC-drift bookkeeping** —
  Pass 1 may `--set-metadata
  ac_warn_hash=…` on an `in_progress` issue whose plan AC changed, so the warning
  comment posts once per distinct change, not every run. Each touches **only** a
  single metadata tag and is reported. (Per verified semantics, a
  dependency-blocked task stays stored `open` — dependency blockers affect
  *computed readiness*, not stored status; a stored `blocked`/`deferred` is an
  explicit signal.)

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
  single/multi-agent-start.md + single/multi-agent-resume.md (order 1510+)
    Beads Detection block          ←  ADD preflight: "if beads_usable and a valid
                                       stable-ID contract → ALWAYS invoke
                                       /scaffold:materialize-plan-to-beads, then
                                       run the scoped claim loop + completion
                                       check (else markdown / fail-closed per the
                                       Build Preflight decision table)"
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
**`beads_usable`** check. It must return false (→ markdown fallback **or**
fail-closed, depending on whether `.beads/` is present — see the degradation
split below) unless **all** of the following hold, so the build never attempts
`bd` against a tracker it cannot correctly drive:

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

**Degradation splits on whether `.beads/` exists** — markdown only when there is
no Beads state to diverge from:

- **`.beads/` absent** → genuinely a non-Beads project → drive the loop from the
  markdown plan/playbook. Safe: there is no tracker state to contradict.
- **`.beads/` present but `bd`/`jq` missing or too old** → **fail closed**, do
  **not** markdown-fallback. The tracker may already hold execution state
  (claimed/closed tasks); running the markdown loop would re-execute completed
  work and diverge Beads from reality. The prompt stops and tells the user to
  install/upgrade `bd` (≥ v1.0.5) and `jq`.

In neither case may the prompt fall through to `bd ready --claim` against an
empty/unsupported tracker (that would reproduce the false-done bug). The Beads
Detection block keys off both `beads_usable` **and** the presence of `.beads/`,
not `[ -d .beads ]` alone.

## The Mapping (methodology-scaled)

### Depth detection

Structure is a function of **methodology/depth only** — there is no runtime
type-availability probe:

- **Methodology/depth** comes from scaffold state (`.scaffold/config.yml` /
  methodology preset) the same way other prompts read it.
- **Both `-t story` and `-t epic` are usable directly** on the supported `bd`
  (≥ v1.0.5, verified) — no `bd config get types.custom` check or `-t task`
  fallback. Deep builds the epic/story/task hierarchy; mvp stays flat (`-t task`
  with story linkage in metadata/body) as a deliberate *simplicity* choice, not
  because the type is unavailable.

The table's two columns are the **flat** and **full-hierarchy** endpoints; the
**per-depth rules below the table are authoritative** for exactly what each depth
emits (the columns are not "use one or the other at every depth"):

| Plan element | flat | full hierarchy |
|---|---|---|
| Task | `bd create -t task` | `bd create -t task --parent <story-id>` |
| Story | — (linkage in metadata/body) | `bd create -t story [--parent <epic-id>]` (`story` usable directly on v1.0.5; epic parent only when an epic exists) |
| Epic | — | `bd create -t epic -p <n>` (title/desc/wave/risk like tasks) |
| Priority / order | `-p <n>` (wave-biased default) | `-p <n>` (wave-biased default) |
| Dependencies (DAG) | `bd dep add <blocked> <blocker>` | `bd dep add <blocked> <blocker>` |
| Acceptance criteria | issue body | issue body |
| Wave / risk | — | metadata `wave=N`, `risk=<type>` |
| Traceability | metadata `plan_task_id` (+ body note) | metadata `plan_task_id`/`plan_story_id`/`plan_epic_id` + `--parent` links |

**Per-depth behavior (authoritative):**

- **mvp / depth 1–3** → flat `-t task` issues **plus dependencies**; no
  story/epic containers, no `--parent`. (Depth 3 vs 1–2 differs only in plan
  sizing/detail upstream, not in what is materialized.)
- **depth 4** → tasks parented to **stories** (`-t story`) + wave metadata;
  stories have **no** epic parent (`--parent` omitted). Pass 0b creates stories
  only.
- **depth 5** → full `epic → story → task` hierarchy + risk metadata + full
  traceability; stories carry an epic `--parent`.

- **Dependencies are always materialized** whenever Beads is enabled, at **every**
  depth (including mvp). The plan is a DAG at every depth
  (`implementation-plan.md` requires a valid DAG even at mvp), and without the
  `bd dep add` edges the scoped `bd ready --claim` would expose dependent tasks
  out of order. Depth governs only **hierarchy** (story/epic parents), **wave**,
  and **risk** — never whether dependencies exist.

### Priority mapping (wave-biased)

1. **Explicit plan priority wins**: `P0`→`-p 0` … `P3`→`-p 3`.
2. **Otherwise bias by wave** so `bd ready` surfaces work in playbook order:
   Wave 1 → `-p 1`, Wave 2 → `-p 2`, Wave 3+ → `-p 3` (clamp at 3).
   Dependencies still gate readiness; the bias only orders among ready tasks.
3. **No priority and no waves** (mvp) → default `-p 2`, rely on dependencies.

## Idempotency & Reconcile Algorithm

Join keys are **Beads metadata** — natively filterable
(`--has-metadata-key`, `--metadata-field key=value`): `plan_task_id` for tasks,
`plan_story_id` for stories, `plan_epic_id` for epics. A companion key
`plan_deps` records the blocker set the materializer owns per issue (see Pass 2). Title prefixes are **not**
used as join keys (retitling would sever the link → duplicates).
`--external-ref "plan:<id>"` is stamped at create for human traceability only
(`bd list` has no external-ref filter in v1.0.5).

**All full-set queries use `--all --limit 0`** so neither closed issues nor
result-set pagination (default 50) hides records.

**Retire convention** (used by Pass 0a duplicate close and Pass 3 stale close).
Whenever a pass removes an issue from the plan-derived set, it does so in this
order, against the issue's **own** join key — `<join-key>` is `plan_task_id` for
a task, `plan_story_id` for a story, `plan_epic_id` for an epic (resolved from
the issue's type, never hardcoded):

1. `bd label add <id> <stale-label>` (e.g. `stale:duplicate` /
   `stale:removed-from-plan`) — the label is applied **first** and is what marks
   the issue as *retired-by-the-materializer* (vs. closed as completed work).
2. `bd close <id> --reason "…"` (skipped if already `closed`).
3. **then** `bd update <id> --unset-metadata <join-key>`.

The key is unset **last** so a failure at any step is resumable: the issue keeps
its join key (so it's still found next run) and carries the stale label (so it's
recognized as retire-pending, not as completed work). **Retirement is therefore
idempotent and resumable** — each run re-applies whatever steps are missing
(close, then unset) for any issue bearing a `stale:*` label that still has a
join key, until both are done. Because the **`stale:*` label distinguishes a
retired close from a genuine completion**, two later rules key off it: (a)
duplicate canonical selection (Pass 0a) **excludes any `stale:*`-labelled issue**
— a partially-retired closed duplicate can never win over the real canonical;
and (b) Pass 3's "leave a completed `closed` issue untouched for revert-safety"
applies **only to closed issues *without* a `stale:*` label** — a
`stale:removed-from-plan` closed issue is still retire-pending and gets its key
unset.

### Pass 0a — Duplicate guard (always)

Before any upsert, fetch the plan-derived issues once
(`bd list --all --limit 0 --has-metadata-key plan_task_id --json`, plus the
`plan_story_id`/`plan_epic_id` queries) and group by each `plan_*_id`. For any
key held by more than one issue (failed/manual/concurrent prior import), restore
the **exactly-one-issue-per-key invariant** that every later bulk fetch, map,
dep reconcile, stale pass, and the scoped claim loop depend on:

1. **Pick the canonical issue** for the key, preferring **active** work so it is
   never detached from the plan-derived set. First **exclude any issue already
   bearing a `stale:*` label** — those are retire-pending leftovers and must
   never be chosen as canonical. Among the rest, the ordering is total:
   - if **exactly one** duplicate is `in_progress` → it is canonical (active work
     wins over any `closed` or not-started copy);
   - else if any is `closed` → canonical is the oldest `closed` one;
   - else the oldest not-started issue (lowest `created_at`, ties by `id`).

   The **only** unorderable case is **two or more `in_progress` duplicates** for
   the same plan ID (e.g. two agents independently claimed copies) — there is no
   safe way to pick which active effort to detach, so **fail closed** and report.
   An `in_progress` + `closed` mix is *not* a conflict: `in_progress` wins.
2. **Not-started non-canonical duplicates** → retire them per the **Retire
   convention** (close → `stale:duplicate` label → unset the issue's own
   `<join-key>`), so they leave the plan-derived set and are never re-detected.
3. **Started non-canonical duplicates** → do not close or mutate fields; only
   **unset the `<join-key>`** (`bd update <id> --unset-metadata <join-key>`) to
   restore key uniqueness, and **report** them for human review.

This guarantees a single canonical issue retains each `plan_*_id` after Pass 0a,
so the claim loop can never surface a duplicate of an already-started item.

### Pass 0b — Container upsert (deep only), top-down

**Bulk-fetch containers once** (like Pass 1 — avoid a `bd list` per container):
two queries, `bd list --all --limit 0 --has-metadata-key plan_epic_id --json`
and `… plan_story_id …`, build in-memory `plan_epic_id → id` and
`plan_story_id → id` maps. Then process **epics first, then stories**, so each
child can reference its parent's resolved Beads ID via `--parent`:

```bash
# Epic E-001: look up in the in-memory epic map; create if absent.
# Containers carry the SAME fields as tasks — title, wave-biased -p, description/AC,
# and (for stories) --parent — per the Mapping table and the per-container contract.
ID=$(printf '%s' "$EPIC_MAP_JSON" | jq -r '."E-001" // empty')
[ -z "$ID" ] && ID=$(bd create "<epic title>" -t epic -p <prio> \
  --description "<epic body>" \
  --metadata '{"plan_epic_id":"E-001","wave":"<n>","risk":"<type>"}' \
  --external-ref "plan:E-001" --json | jq -r '.id')
# Story S-001: same lookup-or-create against the story map, with --parent <epic-id>
```

Container upsert obeys the **same not-started-vs-started rules as tasks** (Pass
1): a not-started (`open`/`blocked`/`deferred`) epic/story is updated to match
the plan — `bd update <id> --title … -d … -p … --parent … --set-metadata
wave=… risk=…`; a started (`in_progress`/`closed`) container is left untouched
(no field changes). Reparenting a not-started story uses
`bd update <id> --parent <new>`.

### Pass 1 — Task upsert

**Fetch the existing plan-derived issues once**, not per task — a single
`bd list --all --limit 0 --has-metadata-key plan_task_id --json` builds an
in-memory `plan_task_id → issue` map (via `jq`), avoiding one `bd` process per
task for large plans. Then, for each plan task (`<task-id>`, parent IDs already
resolved by Pass 0), look it up in that map:

1. **Create if absent:**
   ```bash
   bd create "<title>" -t <type> -p <prio> \
     --parent "<resolved-story-or-epic-id>" \
     --metadata '{"plan_task_id":"<task-id>","wave":"<n>","risk":"<type>"}' \
     --external-ref "plan:<task-id>" \
     --description "<body incl. acceptance criteria + traceability>"
   ```
2. **If present, branch on stored status.** The key distinction is
   **not-yet-started vs. started**, not "open vs. everything else":
   - **`open`, `blocked`, `deferred`** → **update fields to match the plan**,
     **including wave/risk metadata** so nothing drifts:
     ```bash
     bd update <id> --title "<title>" -d "<body>" -p <prio> --parent "<parent-id>" \
       --set-metadata wave=<n> --set-metadata risk=<type>
     ```
     These are all *not-started* states, so mutating their fields
     (title/body/priority/parent/wave/risk) is safe — it never changes execution
     status or readiness. Note (verified): dependency-blocked tasks stay `open`,
     **not** `blocked`; a stored `blocked`/`deferred` status is an explicit
     human/agent signal, and updating its descriptive fields neither unblocks it
     nor disturbs that signal.
   - **`in_progress`** → **do not mutate fields** (work is underway). If the
     plan's AC/description changed, post a warning — **idempotently**: store a
     hash of the last-warned plan text in metadata `ac_warn_hash` (set with the
     targeted `bd update <id> --set-metadata ac_warn_hash=<hash>`) and post the
     `bd comment` only when the hash differs, so re-runs don't spam comments.
   - **`closed`** → leave entirely untouched.

### Pass 2 — Dependency reconcile

Run after all issues exist (forward references resolved). **Read existing edges
from the single bulk fetch, not per task:** `bd list --all --limit 0 --json`
includes a `dependencies` array inline on each issue (verified on v1.0.5 —
records carry `depends_on_id` and `type`), plus `dependency_count`. Reconcile
in-memory against the plan's `depends_on` lists; only the mutating
`bd dep add`/`bd dep remove` calls need per-edge invocations (an unavoidable CLI
cost, scoped to actual changes — not one read per task).

**Materializer-owned edges are tracked explicitly**, not inferred from endpoint
types. Each dependent issue stores the set of blocker task IDs the materializer
applied in a metadata key `plan_deps` (a sorted list, e.g. `"T-003,T-007"`).
"Both endpoints are plan-derived" is *not* sufficient proof of ownership — an
agent could add an execution blocker between two plan tasks during the build,
and deleting it just because it's absent from the markdown plan would corrupt
Beads-owned execution state and make work claimable too early. So:

For each **`open`/`blocked`/`deferred`** dependent (never mutate
`in_progress`/`closed`), reconcile against the plan's `depends_on` list:

- **Add** plan edges not already present: `bd dep add <blocked-id> <blocker-id>`
  (re-adding is a no-op).
- **Remove** an edge only when it is **in the prior `plan_deps`** (materializer
  created it) **and** is **absent from the current plan** `depends_on`:
  `bd dep remove <blocked-id> <blocker-id>`. Edges **not** in `plan_deps`
  (manual/external blockers) are preserved untouched; a manual edge colliding
  with a plan edge is kept and noted in the summary, not deleted.
- **Rewrite `plan_deps` authoritatively at the end** of each issue's reconcile.
  Its new value is defined precisely as:

  > `plan_deps' = (prior plan_deps ∩ current-plan deps) ∪ (edges this run added)`

  i.e. keep the still-valid owned edges, add the ones the materializer just
  created, and **explicitly exclude any pre-existing edge that was *not* already
  in `plan_deps`** — even when it collides with a current plan dep. That edge was
  a manual/external blocker that happens to match the plan; it must stay
  manual-owned so a later plan removal never deletes it. Write with
  `bd update <id> --set-metadata plan_deps=<csv>` (or `--unset-metadata
  plan_deps` when empty). This keeps `plan_deps` reflecting exactly the
  materializer-owned edges, never the historical union and never absorbing manual
  edges.

The dependent's current edges come from the bulk fetch's inline `dependencies`
array (`depends_on_id`, `type`); a per-issue read, if needed, is
`bd dep list <id> --direction down --json` — **verified on v1.0.5**:
`--direction down` returns *what `<id>` depends on* (its blockers/upstream),
exactly the edge set to reconcile; `up` returns *dependents* and is wrong here.
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
  `deferred`) → **retire it** per the Retire convention (close with reason
  `"Removed from implementation plan (was <id>)"` → `stale:removed-from-plan`
  label → unset the issue's own `<join-key>`), so it drops out of future queries
  and can never be misread as "started/dropped" later.
- Such an issue **`in_progress`** → **do not auto-close**; report it in the
  summary for human attention (it may be mid-flight work the plan dropped by
  mistake). Leave its join key intact so it stays visible until a human decides.
- Such an issue **`closed` as genuinely-completed work** (no `stale:*` label) →
  **leave it entirely untouched** (do **not** unset its join key). Plan IDs are
  never reused, so if the removal is later reverted (e.g. `git revert` restores
  the task), Pass 1 must still find this issue by its `plan_task_id` and
  recognize it as already `closed` — not recreate a fresh `open` issue and force
  the agent to redo completed work. Keeping the key means completed-and-removed
  items are re-fetched on later runs (bounded by total historical tasks —
  accepted for revert-safety); they are excluded from the "dropped work" report.
  (A `closed` issue that **does** carry `stale:removed-from-plan` is instead a
  retire-pending leftover — the Retire convention finishes unsetting its key.)

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

> **When `beads_usable` and a valid stable-ID contract are present, the
> materializer runs first (unconditionally, via the canonical command), and only
> then does the scoped claim loop run:** `bd ready --claim --has-metadata-key
> plan_task_id --json` — scoping keeps it from ever claiming the bootstrap bead
> or a manual issue. Markdown fallback is used **only when `.beads/` is absent**
> (a non-Beads project) or for a genuinely legacy plan (usable Beads, no IDs,
> no plan-derived issues). Every other case — `.beads/` present but `bd`/`jq`
> unusable, a partial/malformed contract, or a mid-run materialize failure —
> **fails closed**; it must never fall through to a claim against an empty,
> partially-materialized, or unsupported tracker, nor markdown-fall-back past
> existing Beads state.

**The materializer is the correctness mechanism, and the preflight always runs
it — there is no skip/fast-path.** Earlier drafts tried to gate materialization
on a set comparison of task IDs, but every such gate has a hole: a count misses
partial imports; a one-way subset misses stale tasks; an ID-set equality misses
**content** edits (title/AC/priority/parent/dependencies changed without adding
or removing any task ID), which would leave Beads with stale descriptions or —
worse — missing/obsolete dependency edges that let tasks be claimed out of
order. Rather than chase a correct gate (or maintain per-task content hashes),
the design **always invokes the idempotent materializer before the scoped claim
loop.** The materializer is built to be a cheap no-op when already in sync
(every pass is a lookup-and-reconcile), so running it unconditionally is both
correct and acceptable. Decision table:

| Condition | Action |
|---|---|
| `.beads/` **absent** | Non-Beads project → markdown playbook loop. Do **not** call `bd`. |
| `.beads/` present but `bd`/`jq` missing or too old (`beads_usable` false) | **Fail closed** — tell the user to install/upgrade `bd` (≥ v1.0.5) + `jq`. Do **not** markdown-fallback (Beads may hold state). |
| Usable; plan has **no** stable IDs **and** no plan-derived issues exist in Beads | Genuinely legacy plan → markdown loop + emit "re-run planning to assign task IDs". Do **not** claim. |
| Usable; contract **partially present or malformed** (some IDs present, or plan-derived issues already exist, but the contract doesn't fully parse) | **Fail closed.** Do **not** markdown-fallback (would bypass existing plan-derived issues and diverge). Require planning to be re-run/fixed. |
| Usable; valid stable-ID contract | **Always materialize** via the canonical command (see Invocation) → scoped claim loop `bd ready --claim --has-metadata-key plan_task_id --json` → completion check. |
| Usable; materialize returns non-zero | **Fail closed.** Stop and surface the error; do **not** claim **and do not** silently markdown-fallback. |

**Markdown fallback is only safe for a genuinely legacy plan** — no stable IDs
*and* no existing plan-derived Beads issues. A *partial/malformed* contract on a
usable tracker (any IDs present, or any plan-derived issues already in Beads)
**fails closed** rather than falling back, because markdown execution would
bypass the existing Beads issues and let the two diverge. And once materialization
*starts*, a mid-run failure also fails closed (earlier passes may already have
written issues).

### Invocation of the materializer from build prompts

There is **one** canonical materializer procedure — the finalization prompt
`materialize-plan-to-beads.md`, exposed as the slash command
`/scaffold:materialize-plan-to-beads`. The build prompts do **not** duplicate the
four-pass logic; their Beads Detection block **invokes
`/scaffold:materialize-plan-to-beads`** (the same way build prompts already
reference `/scaffold:single-agent-resume`, `/scaffold:review-pr`, etc.). This
keeps a single source of truth: the finalization step and the defensive build
preflight run identical reconcile logic, and a fix to the procedure updates both.

**Completion check (empty `bd ready` ≠ done).** The scoped claim loop ends when
`bd ready --claim --has-metadata-key plan_task_id` returns nothing — but an empty
*ready* set does **not** mean the build is finished. Because the design preserves
manual blockers and stored `blocked`/`deferred` states, an empty ready set can
mean *every remaining task is blocked*, not *all done*. On an empty ready result,
the prompt queries all plan-derived tasks (`bd list --all --limit 0
--has-metadata-key plan_task_id --json`) and classifies the remaining non-closed
tasks:

- **All `closed`** → genuinely **done**.
- **Some `in_progress`** (and the rest blocked behind them) → **active execution
  by another agent**, not a deadlock. This is the normal multi-agent case: the
  worker **exits gracefully** (its own work is done; others are still running) —
  it must **not** report a failure or halt the build.
- **No plan-derived task `in_progress`, but some non-closed remain**
  (`open`-but-unready / `blocked` / `deferred`) → before declaring a stall, check
  whether the **actual blockers of those remaining tasks** are active. A plan
  task can be blocked by a **manually-created** task (no `plan_task_id`) that
  another agent is working. Walk the **transitive** blocker chains of the
  remaining tasks (not just immediate blockers — a plan task may be blocked by a
  manual task that is itself blocked by an `in_progress` task), resolving each
  blocker's **status** from an **unfiltered** fetch (`bd list --all --limit 0
  --json`) since manual blockers carry no `plan_task_id`. If **any** transitive
  blocker is `in_progress` → exit gracefully (the chain is advancing). Only when
  **no transitive blocker of any remaining task is `in_progress`** is it a **true
  stall**: the
  prompt **stops and reports** the remaining tasks grouped by why they aren't
  ready (open dependency — plan or manual, manual `blocked`, `deferred`) so the
  user can unblock them. (Unrelated global `in_progress` work that doesn't block
  any remaining task does **not** suppress the stall report.)

For multi-agent, "always materialize" still means **once per wave** — the
orchestrator runs it under the lock before fan-out (see Concurrency); workers do
not re-run it, they just claim. The set definitions below are used **inside the
materializer** for its reconcile logic and for the summary report, not as a
skip gate:

- `PLAN_IDS` = stable task IDs in the current `docs/implementation-plan.md`.
- `MAT_IDS` = `plan_task_id` of plan-derived Beads issues **of any status**
  (uses `--all`).
- `READY_IDS` = `plan_task_id` of **not-started** (`open`/`blocked`/`deferred`)
  plan-derived issues.

**Duplicate guard.** Because a bare set check collapses duplicates, the
materializer's first step (**Pass 0a**, defined in the reconcile algorithm
below) restores the one-issue-per-join-key invariant before any other logic
runs — a failed/manual/concurrent prior import can otherwise leave two issues
with the same `plan_*_id` and let `bd ready --claim` claim duplicate work. The
single authoritative definition of duplicate resolution lives in Pass 0a; this
section does not restate it (to avoid drift). The preflight simply relies on
Pass 0a having run as part of "always materialize."

The sets are built with `jq`. Markdown fallback on a `jq`/`bd` failure is
allowed **only when `.beads/` is absent**. If `.beads/` exists, **any** `jq`/`bd`
failure — whether while building `beads_usable` / the ID sets or after the
materializer has started writing — must **fail closed** (per the control-flow
rule and decision table): the prompt cannot prove the tracker is legacy, so
markdown-falling-back would risk bypassing existing Beads state and
re-executing completed work. The exact, tested shell lives in the implementation
prompt; this spec fixes the routing rule above.

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
4. **Two distinct identities — lock holder vs. claim actor.** The merge-slot
   needs a *per-process unique* holder (e.g. a UUID or `agent-$$`) so two local
   agents sharing one `git config user.name` don't both think they hold the slot.
   But the **task-claim/resume actor must be stable per worktree/session** —
   otherwise a restarted/resumed agent gets a new identity and can't find its own
   prior `in_progress` task (work stranded). So: use the unique value **only**
   for `bd merge-slot acquire/check/release`, and keep the **stable**
   `BEADS_ACTOR` (persisted per worktree/session, resolving `BEADS_ACTOR` →
   `git user.name` → `$USER`, never empty) for `bd ready --claim` and the resume
   lookup. If `BEADS_ACTOR` must be overridden for the lock, scope that override
   to the lock commands and restore the stable actor before claiming.
5. **Workers wait on a persistent completion signal, not just slot release.** A
   released slot (`holder: null`) does not prove the orchestrator ran — a worker
   could acquire/release before the orchestrator even started. The orchestrator
   sets a durable **materialization-complete signal** on success (e.g. a metadata
   flag on the project merge-slot/bootstrap bead such as `materialized_at`, or a
   workspace marker file); workers **block until that signal is present** before
   their first claim. The lock serializes the *write*; the signal gates the
   *readers*.
6. **Run the materializer inside the lock** — once ownership is confirmed, run
   the (idempotent) materializer, set the completion signal, then release. The
   lock exists so the
   orchestrator's single run can't race a worker; workers never materialize.

`single-agent-start.md` has no concurrency concern and uses the plain preflight.
The exact locking shell is authored and bats-tested in the implementation
prompt.

## Files to Touch

- **New:** `content/pipeline/finalization/materialize-plan-to-beads.md`
  — Mode Detection + Update Mode Specifics blocks, methodology scaling, depth
  detection, version guard, four-pass reconcile, idempotency summary.
- **Edit (prerequisite):** `content/pipeline/planning/implementation-plan.md`
  — define and require the Plan Output Contract (stable task/story/epic IDs,
  per-task **and per-container** field blocks, referential integrity of parent
  refs, canonical serialization).
- **Edit:** `content/pipeline/planning/implementation-plan-review.md` — validate
  the full contract: task **and** container (story/epic) ID presence, uniqueness,
  and stability; that all `story`/`epic` parent refs **and all `depends_on`
  refs** resolve (no dangling refs); that the **dependency graph is acyclic**;
  and that the per-task and per-container field blocks parse.
- **Edit:** `content/pipeline/build/single-agent-start.md` — `beads_usable`-gated
  Beads Detection that **invokes `/scaffold:materialize-plan-to-beads`** (the
  canonical procedure, not a copy) per the decision table, then the **scoped**
  `bd ready --claim --has-metadata-key plan_task_id --json` claim loop with the
  empty-ready **completion check**; markdown fallback only for a genuinely legacy
  plan, fail-closed otherwise.
- **Edit:** `content/pipeline/build/multi-agent-start.md` — same, plus
  orchestrator-only + ownership-verified merge-slot lock around the invocation.
- **Edit:** `content/pipeline/build/single-agent-resume.md` and
  `content/pipeline/build/multi-agent-resume.md` — **the resume prompts run the
  same Beads loop and must get the identical treatment** (`beads_usable` gate,
  invoke `/scaffold:materialize-plan-to-beads`, scoped claim, completion check,
  fail-closed). Two resume-specific additions:
  - **Resume the actor's own in-flight *plan* task first.** Before claiming
    anything new, a resuming agent must check for a **plan-derived** task already
    `in_progress` assigned to it — scoped exactly like claiming:
    `bd list --status in_progress --assignee <actor> --has-metadata-key
    plan_task_id --json` — and continue that one. Scoping to `plan_task_id`
    prevents resuming onto an unrelated manual/bootstrap issue assigned to the
    same actor; any such non-plan in-progress work is ignored here (reported
    separately, not resumed as build work).
  - **Workers wait for the completion signal.** In `multi-agent-resume.md`, a
    worker must not claim until the orchestrator's **materialization-complete
    signal** is present (Concurrency requirement 5) — blocking on slot release
    alone is insufficient (a worker could acquire/release before the orchestrator
    started), so no one claims against a transient/partially-materialized tracker.
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
- **Task/container removed from plan** → Pass 3 closes + unsets the key if not
  started (`open`/`blocked`/`deferred`); flags for review if `in_progress`;
  leaves a `closed` issue untouched (key kept for revert-safety).
- **Dependency removed from plan** → Pass 2 removes the edge for
  open/blocked/deferred dependents (so blocked tasks can be unblocked).
- **AC/description changed while in_progress** → fields untouched; a single
  `bd comment` warning posted per distinct change (`ac_warn_hash` guards spam).
- **All plan tasks closed** → the materializer runs (always) but is a no-op:
  each task is found by `plan_task_id` (`--all`) in `closed` state and left
  untouched — never recreated. The scoped claim loop then finds nothing ready and
  the build correctly concludes it is done.
- **Partial/failed prior import, or plan update adding task IDs** → the
  always-run materializer creates the missing tasks before the claim loop, so no
  unmaterialized work is silently skipped.
- **Content-only plan edit** (title/AC/priority/parent/deps changed, no task ID
  added or removed) → because materialization always runs, Pass 1 updates the
  not-started issues' fields and Pass 2 reconciles the dependency edges; nothing
  is skipped (an ID-set gate would have missed this).
- **Task removed from the plan but still `open` in Beads** → Pass 3 unsets its
  join key and closes it **before** the claim loop runs, so the build never
  claims a dropped task; the unset also keeps it out of future runs.
- **More than 50 plan tasks** → `--limit 0` ensures stale/preflight passes see
  the full set (default page size is 50).
- **Plan missing task IDs** → if it's a genuinely legacy plan (no IDs **and** no
  plan-derived issues in Beads) the prompt emits "re-run planning" and uses the
  markdown loop; if any IDs or plan-derived issues are present (partial/corrupted
  contract) it **fails closed** rather than importing with no join key.
- **Stale bootstrap bead** → the "initialize Beads" bootstrap task carries no
  `plan_task_id`, so it is excluded from every count and never masks an empty
  import.
- **mvp** → flat `-t task` issues with story linkage in metadata/body. This is a
  deliberate simplicity choice; `-t story` is available on v1.0.5 but
  intentionally unused at mvp depth.
- **`.beads/` present but `bd`/`jq` missing or older than v1.0.5** → **fail
  closed** with an install/upgrade message; do **not** markdown-fall-back past
  possibly-existing Beads state, and never `bd ready --claim` an unsupported
  tracker. (`.beads/` absent is the only no-Beads → markdown path.)

## Verification Checklist (confirm during implementation)

Confirm the exact invocation/JSON shape of **every** subcommand the final
prompts use, against the project's installed `bd`:

- `bd list --all --limit 0 --has-metadata-key … --metadata-field …=… --json`
  (filtering + JSON `.metadata` shape)
- `bd create … --parent --metadata --external-ref --description --json`
  (returned `.id`)
- `bd update <id> --title -d -p --parent --set-metadata key=value` — prefer the
  **targeted** `--set-metadata` for single-key writes like `ac_warn_hash`/
  `plan_deps` (clearest intent). Note (verified on v1.0.5): `--metadata '{…}'`
  does a **shallow key merge**, not a full replace — existing keys survive — so
  it is also safe, but `--set-metadata`/`--unset-metadata` are the precise tools
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
- that `bd create -t story` / `-t epic` succeed without `types.custom` (verified
  on v1.0.5; re-confirm against the project's installed `bd` floor)

## Testing Strategy

- **Frontmatter validation** (bats): new prompt passes `make validate` with
  `finalization` phase, `order: 1440`, `conditional: "if-needed"`,
  `dependencies: [implementation-playbook]`.
- **Pipeline assembly** (bats): with a Beads-capable methodology preset, the
  assembled pipeline includes `materialize-plan-to-beads` positioned after
  `implementation-playbook`; with Beads disabled, it does not appear.
- **Plan Output Contract** (bats): `implementation-plan.md` requires/defines the
  contract; the review step rejects a plan with missing/duplicate/unstable IDs
  (task **or** container), a **dangling** story/epic parent ref, **or a dangling
  `depends_on` ref**, and accepts a conformant one with parseable task and
  container blocks.
- **Completion check (3-way)**: empty `bd ready` with all tasks `closed` → done;
  with some task `in_progress` (others blocked behind it) → graceful exit, **no**
  failure (multi-agent active execution); with **no** `in_progress` but
  `blocked`/`deferred`/unready tasks remaining → **true stall reported**, not
  success.
- **Malformed-plan fail-closed**: a usable tracker with existing plan-derived
  issues but a partially-parseable contract fails closed (does not markdown-
  fallback); a genuinely legacy plan (no IDs, no plan-derived issues) does fall
  back to markdown.
- **Canonical prefers active**: duplicates of one key with an `in_progress` and a
  `closed` member → the `in_progress` one is canonical (or, if statuses are
  unorderable, the guard fails closed) — active work is never detached.
- **Resume parity**: `single-agent-resume.md` / `multi-agent-resume.md` apply the
  same scoped claim + completion check + materialize-invocation as the start
  prompts (a resumed build neither claims non-plan beads nor false-completes).
- **Mapping checks**: a sample plan yields the expected `bd` command sequence for
  mvp (flat, `-t task`, no story, default `-p 2`) and deep (epic→story→task
  order, `--parent` wiring, wave-biased priority), via a dry-run/command-capture
  harness. **mvp/depth-1–2 must still emit `bd dep add` edges** — assert
  dependencies are materialized even at the flattest depth.
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
- **Manual-blocker preservation**: a human/agent-added blocker between two
  plan-derived tasks (not in the plan, not in `plan_deps`) survives a materializer
  run — only edges recorded in `plan_deps` and absent from the current plan are
  removed.
- **Remove-then-manual-readd**: remove a dep from the plan (materializer removes
  the edge and rewrites `plan_deps`); then manually re-add the same blocker; a
  subsequent materializer run must **not** delete it (it is no longer in
  `plan_deps`).
- **Manual-edge collides with later plan edge**: a manual blocker exists (not in
  `plan_deps`); the plan is then edited to add that same edge; later the plan
  removes it — the manual edge must **survive** (it was never absorbed into
  `plan_deps` per the `plan_deps'` formula).
- **Duplicate-key uniqueness**: seed three issues with one `plan_task_id`
  (one `in_progress`, two `open`); after Pass 0a exactly one issue (the
  `in_progress` canonical) retains the key, the two `open` ones are closed +
  `stale:duplicate`, and no further run re-detects a duplicate.
- **Fail-closed on materialize error**: if a pass errors after some issues were
  written, the build stops with the error surfaced — it does **not** drop to the
  markdown loop or enter the claim loop.
- **Scale**: a plan with >50 tasks is fully reconciled (`--limit 0`), with a
  test asserting no truncation at the default page size.
- **`--all` visibility**: an all-`closed` plan is a materializer no-op (closed
  tasks found, untouched, not recreated) and the build correctly ends.
- **Drift / partial import**: a plan with a task ID absent from Beads is created
  by the always-run materializer; the build does not enter the claim loop with
  that task missing.
- **Content-only edit**: changing a task's title/AC/priority/deps without
  changing IDs still syncs to Beads (Pass 1 + Pass 2 run because materialization
  is unconditional) — assert the issue body and dep edges update.
- **Stale-claim prevention + cleanup**: a task removed from the plan but left
  `open` is closed by Pass 3 **and its `plan_task_id` is unset**; assert it is
  not claimed, and that a second run does not re-detect or re-report it.
- **Duplicate `plan_task_id`**: two `open` issues sharing a `plan_task_id` are
  caught by Pass 0a — the discarded one has its key unset, is closed, and
  labelled `stale:duplicate`; assert the claim loop yields the task once and a
  second run finds no duplicate (the unset key prevents re-detection).
- **Claim scoping**: with a bootstrap bead (no `plan_task_id`) plus materialized
  plan tasks present, the build loop's `bd ready --claim --has-metadata-key
  plan_task_id` never claims the bootstrap bead or a manually-created issue.
- **Concurrency**: two simulated agents hitting the `multi-agent-start.md`
  preflight against an unmaterialized plan produce exactly one import
  (orchestrator-only + ownership-verified lock), no duplicate issues.
- **Degradation split**: with `.beads/` absent the build uses the markdown
  playbook (never calls `bd`); with `.beads/` **present** but `bd`/`jq`
  missing/too old the build **fails closed** (no markdown fallback, no
  `bd ready --claim`).
- **Revert-safety**: a `closed` task removed from the plan keeps its
  `plan_task_id`; after the removal is reverted, the materializer recognizes it
  as `closed` and does **not** recreate an `open` issue (no redone work).
- **Manual-blocker active execution**: a plan task blocked by a manually-created
  task that is `in_progress` (no `plan_task_id`) → empty `bd ready` triggers a
  graceful exit (global `in_progress` work exists), **not** a true-stall report.
- **Resume own task**: a resuming agent with an existing `in_progress` task
  assigned to it continues that task before claiming a new one.
