---
status: decisions-locked
owner: zigrivers
created: 2026-05-26
parent-spec: docs/superpowers/specs/2026-05-24-knowledge-freshness-design.md
related-plan: docs/superpowers/plans/2026-05-26-knowledge-freshness-gap-detection.md
---

# Knowledge-Freshness Gap Detection — Design Spec (Phase 3)

This is the Phase-3-specific design pass that the parent plan
([`docs/superpowers/plans/2026-05-24-knowledge-freshness.md`](../plans/2026-05-24-knowledge-freshness.md))
flagged as a prerequisite: a focused design for the gap-detection arm of the
knowledge-freshness system. Phases 0–2 already shipped the refresh arm (audit
loop, cron, CI gates, 32-entry backfill). Phase 3 adds the complementary
ability to surface topics the knowledge base *does not yet cover* but
downstream agents need.

This spec is scoped only to gap detection. The parent design
([`2026-05-24-knowledge-freshness-design.md`](2026-05-24-knowledge-freshness-design.md))
covers the refresh arm, the source-authority allowlist, the SemVer scheme,
and Phase 5 roadmap items. All Phase 3 decisions are resolved here; the
companion plan executes from this spec.

## Findings & Corrections (Phase 3 grounding)

The parent design's §B.1 and the parent plan's Tasks 15–18 sketched gap
detection at a roadmap level. Resolving them required correcting and
extending several details from the parent framing:

- **The `observe event` CLI is fully data-driven, not hardcoded.** The
  parent plan said the CLI "maps `--step`/`--reason` to `step`/`reason`" and
  implied the new payload fields needed to fit that mapping. The actual
  implementation at `src/cli/commands/observe.ts:399–408` accepts arbitrary
  `--<key>=<value>` flags via yargs `.strict(false)`, snakes hyphens to
  underscores via `snakeKey()`, and filters against `EVENT_PAYLOAD_KEYS[type]`
  at `src/cli/commands/observe.ts:62–72`. Adding `knowledge_gap_signal` is
  three localized edits: the discriminated-union arm in
  `src/observability/engine/types.ts`, the payload-keys entry in
  `src/observability/engine/event-schemas.ts:3–12`, and a validation case in
  the same file's switch (`event-schemas.ts:114–175`). The CLI itself
  requires zero changes. The user's framing of a CLI flag-mapping conflict
  was mistaken — there is no conflict to reconcile.
- **All 89 pipeline steps reference `knowledge-base:`.** A live
  `grep -rl "^knowledge-base:" content/pipeline --include='*.md'` returns 89
  of 89 files. The parent design's framing of "every pipeline meta-prompt
  that references `knowledge-base:`" therefore means every pipeline step,
  not a subset. This makes the assembly-time injection (Section 3) the only
  practical mechanism — copy-pasting a tail into 89 files would create
  permanent drift risk.
- **Lens scope is not a property on the lens — it's a hardcoded set in the
  audit API.** The existing 8-lens framework defines two `Set` literals in
  `src/observability/engine/api.ts:67–77`:
  `SCOPE_DOC_LENSES = new Set(['H-cross-doc'])` and a parallel
  `SCOPE_CODE_LENSES`. `pickEnabledIds()` picks one or both based on the
  `--scope` flag. Lens registration itself is via a `LensManifest` entry in
  `LENS_REGISTRY` (`src/observability/engine/checks/registry.ts:25`) plus a
  function entry in `LENS_IMPLEMENTATIONS` (registry.ts:48) or in
  `makeLensImplementations()` (registry.ts:61) when the lens needs project
  context. Lens I reads the ledger (cross-cutting; neither docs nor code).
  We add it to `SCOPE_DOC_LENSES` (documentation gap detection is the
  closer semantic neighbor) so it runs under `--scope=docs` and under
  `--scope=all` (which unions both sets). This is *not* a "one-line" edit —
  it touches the registry array, the implementations map, and the doc-scope
  set.
- **`Evidence` discriminated union has a JSON-stringify fallback.** Renderers
  consume `Evidence` via type guards in `renderEvidence()`-style functions
  (`src/observability/renderers/markdown.ts`). Today only `doc_disagreement`
  has a custom format; every other variant falls through to a generic
  `JSON.stringify(ev, null, 2)` block. Adding a new `knowledge_gap` variant
  is safe (it'll render as JSON), but for nice formatting in markdown/
  terminal/dashboard/mmr-findings, an explicit pretty-render case should be
  added per renderer. This is polish, not blocking.
- **The base event already carries `worktree_id`, `branch`, `task_id`,
  `actor_label`, `ts`.** Anything redundant with those fields stays out of
  the payload. `step_name` is *not* redundant — pipeline steps are a
  separate abstraction from Beads `task_id` and from git `branch`, so it
  remains in the payload as an optional field.
- **`worktree_id` is not the right project-distinctness axis.** A power
  user running Scaffold against three downstream apps from one worktree
  shows as one project. The system needs a payload-level `project_id`
  computed from the downstream project's identity (git remote URL or
  realpath of cwd). This is the diversity-gate axis for "≥2 distinct
  projects".
- **lessons.md is not a ledger writer.** The parent design framed the
  lessons.md scanner as a third signal source. The right shape is an
  in-process function called by Lens I at audit time, not a CLI or cron
  that writes events. This avoids dedup bugs between scanner runs and
  agent-emitted events, keeps the ledger clean, and means the scanner
  always reflects the current lessons.md (not an old snapshot).
- **`Evidence` discriminated union needs a new variant.** The lens emits
  `Finding` objects whose `evidence` field is a typed union
  (`src/observability/engine/types.ts:92–98`). Phase 3 adds a
  `knowledge_gap` variant carrying topic, signal_count, distinct_projects,
  example_excerpts. Renderers can match on it without breaking the existing
  six variants.

## Problem Statement

Scaffold's knowledge base has 266 entries across 19 categories (live count
2026-05-26 via `find content/knowledge -name '*.md' | wc -l` minus the 2
README files excluded by the loader; ~32 entries backfilled with freshness
metadata in Phases 0–2; the rest still load with default
`volatility: 'evolving'` and empty sources). The refresh arm (Phases 0–2)
tells us when existing entries lag
external reality. It does **not** tell us when downstream agents reach for
guidance that *isn't there at all*.

Symptoms of an undetected gap: a downstream pipeline agent generates a
weaker tech-stack doc because Scaffold has no entry for, say, "agent
evaluation harnesses"; the agent silently improvises or omits the topic;
nobody learns. The lesson lands (maybe) in `tasks/lessons.md` weeks later,
buried in prose. The knowledge base never updates because nobody noticed
the absence was a problem.

Phase 3 adds two complementary signal sources and an aggregator that turns
them into actionable P2/P1 findings:

1. **Agent-search signals** — pipeline agents emit a structured event when
   they search the injected knowledge base for a topic and find nothing.
2. **Lessons-file scanner** — Lens I reads `tasks/lessons.md` inline and
   extracts explicit-marker and heuristic-phrase mentions, treating them as
   a secondary signal source that corroborates real agent-search signals.

The aggregator clusters signals by normalized topic slug and surfaces
P2/P1 findings when the cluster crosses thresholds (≥3 signals × ≥2
projects → P2; ≥5 signals × ≥3 projects → P1).

## Goals & Non-Goals

**Goals**
- Surface knowledge-base topics that downstream agents need but cannot find,
  with enough confidence (multi-project diversity) to avoid manufactured
  gaps from a single noisy user.
- Reuse existing infrastructure: the ledger, the `observe event` CLI, the
  audit-lens framework. Add no parallel system.
- Keep the agent-side prompt cost reasonable (≤200 tokens per pipeline
  step) and make emission optional but easy.
- Provide a path for `tasks/lessons.md` (the only signal source currently
  producing real data) to feed the same aggregator.

**Non-goals (Phase 3)**
- LLM-graded topic clustering. Phase 3 uses strict slug-with-light-
  normalization matching; fuzzy/stemmed/LLM clustering is a Phase 5
  consideration if the strict approach proves too brittle.
- Backfilling old pipeline runs' signals. Phase 3 starts measurement from
  the moment T2 lands.
- Auto-creating draft PRs for new knowledge entries. Lens I surfaces
  findings; humans (or a Phase 5 frontier scan) decide what to write.
- Real-time gap detection during a pipeline run. Signals flow into the
  ledger; the lens fires on the same cadence as other audit runs.
- Modifying the pipeline-step content files. The assembly-time injection
  handles the tail without touching the 89 step `.md` files.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Downstream pipeline run (any project using Scaffold)                   │
│                                                                         │
│  1. scaffold knowledge build <step>                                     │
│     │                                                                   │
│     ▼                                                                   │
│  2. knowledge-loader assembles `## Knowledge Base` + appends            │
│     gap-signal tail (assembly-time injection; SCAFFOLD_GAP_SIGNAL_QUIET │
│     suppresses)                                                         │
│     │                                                                   │
│     ▼                                                                   │
│  3. Agent reads prompt, searches knowledge base, finds gap              │
│     │                                                                   │
│     ▼                                                                   │
│  4. Agent runs:                                                         │
│       scaffold observe event knowledge_gap_signal \                     │
│         --branch=<…> --topic=<slug> --source=agent_search \             │
│         --project-id=<sha256> --step-name=<…> --agent-excerpt=<…>       │
│     │                                                                   │
│     ▼                                                                   │
│  5. Event lands in worktree's `.scaffold/observability/ledger.jsonl`    │
│     (validated against EVENT_PAYLOAD_KEYS['knowledge_gap_signal'])      │
└─────────────────────────────────────────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  scaffold observe audit (any cadence)                                   │
│                                                                         │
│  6. Lens I (`I-knowledge-gaps`) reads:                                  │
│       - all knowledge_gap_signal events in 90-day window (from ledger)  │
│       - tasks/lessons.md (inline scanner → synthetic signals)           │
│     │                                                                   │
│     ▼                                                                   │
│  7. Normalize topics → bucket by slug → compute signal_count and        │
│     distinct_project_count                                              │
│     │                                                                   │
│     ▼                                                                   │
│  8. Emit Finding{lens_id: 'I-knowledge-gaps'} for buckets crossing:     │
│       P2: signal_count ≥ 3 AND distinct_projects ≥ 2                    │
│       P1: signal_count ≥ 5 AND distinct_projects ≥ 3                    │
│     │                                                                   │
│     ▼                                                                   │
│  9. Findings flow through existing audit renderers (markdown, terminal, │
│     dashboard fragment, MMR doc-conformance channel)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Section 1 — Event Type & Payload

### 1.1 Type definitions

**`src/observability/engine/types.ts`** — extend the `EventType` union and
add the payload + discriminant arm:

```typescript
export type EventType =
  | 'task_claimed'
  | 'task_completed'
  | 'decision_recorded'
  | 'blocker_hit'
  | 'blocker_resolved'
  | 'pr_opened'
  | 'progress_heartbeat'
  | 'finding_acknowledged'
  | 'knowledge_gap_signal'      // NEW

export interface KnowledgeGapSignalPayload {
  topic: string                                  // required, kebab-case slug, ≤80 chars
  source: 'agent_search' | 'lessons' | 'manual'  // required
  project_id: string                             // required, 64-char sha256 hex
  step_name?: string                             // optional, pipeline step slug
  agent_excerpt?: string                         // optional, ≤200 chars
}

export type Event =
  | (BaseEvent & { type: 'task_claimed';        payload: TaskClaimedPayload })
  | // … existing arms …
  | (BaseEvent & { type: 'knowledge_gap_signal'; payload: KnowledgeGapSignalPayload })
```

`task_id` is allowed `null` on this event — gap signals surface outside of
any specific Beads task. The existing `BaseEvent.task_id: string | null`
shape covers this.

### 1.2 Payload-key map

**`src/observability/engine/event-schemas.ts:3–12`** — add the entry:

```typescript
export const EVENT_PAYLOAD_KEYS: Record<EventType, string[]> = {
  // … existing entries …
  knowledge_gap_signal: ['topic', 'source', 'project_id', 'step_name', 'agent_excerpt'],
}
```

### 1.3 Validation case

**`src/observability/engine/event-schemas.ts:114–175`** — add a case to the
`switch (type)`:

```typescript
case 'knowledge_gap_signal':
  reqStr('knowledge_gap_signal.payload.topic', filteredPayload.topic, errors, 80)
  if (typeof filteredPayload.topic === 'string' &&
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(filteredPayload.topic)) {
    errors.push('knowledge_gap_signal.payload.topic must be kebab-case slug (lowercase, hyphen-separated)')
  }
  if (!VALID_GAP_SOURCES.includes(filteredPayload.source as never)) {
    errors.push('knowledge_gap_signal.payload.source must be agent_search | lessons | manual')
  }
  if (typeof filteredPayload.project_id !== 'string') {
    errors.push('knowledge_gap_signal.payload.project_id required')
  } else if (filteredPayload.project_id !== 'lessons' &&
             !/^[a-f0-9]{64}$/.test(filteredPayload.project_id)) {
    errors.push('knowledge_gap_signal.payload.project_id must be a 64-char sha256 hex string (or the literal "lessons" for synthetic signals from the lessons.md scanner)')
  }
  optStr('knowledge_gap_signal.payload.step_name', filteredPayload.step_name, errors)
  optStr('knowledge_gap_signal.payload.agent_excerpt', filteredPayload.agent_excerpt, errors, 200)
  break
```

with `const VALID_GAP_SOURCES = ['agent_search', 'lessons', 'manual'] as const`
defined alongside the existing `VALID_OUTCOMES` / `VALID_BLOCKER_KINDS`.

### 1.4 CLI invocation form

No CLI code changes. The existing flag-flow in `observe.ts:399–408` already
accepts `--topic`, `--source`, `--project-id`, `--step-name`,
`--agent-excerpt` via `.strict(false)` and snakes hyphens automatically.
Required CLI form:

```bash
scaffold observe event knowledge_gap_signal \
  --branch="<branch>" \
  --topic="<kebab-case-slug>" \
  --source=agent_search \
  --project-id="<sha256-hex>" \
  --step-name="<step-slug>" \
  --agent-excerpt="<≤200-char-quote>"
```

`--branch` is required by the base event. `--task-id` is optional and
typically absent for gap signals (an agent emits one outside the context of
a specific Beads task).

### 1.5 Project-ID computation contract

`project_id` is `sha256(git remote get-url origin)` when the project has a
git origin, falling back to `sha256(pwd -P)` otherwise. The pipeline
tail-instruction must use a **portable** computation that works on macOS
(no `sha256sum` in default installs), Linux (no `shasum -a 256` in
minimal containers), and CI shells without `pipefail`.

The canonical form computes the candidate first and hashes it in a single
discrete step, so a failed origin lookup falls through to `pwd -P` rather
than silently hashing empty input:

```bash
PROJECT_KEY=$(git remote get-url origin 2>/dev/null || pwd -P)
PROJECT_ID=$(printf '%s' "$PROJECT_KEY" | \
  { command -v shasum >/dev/null 2>&1 && shasum -a 256 || sha256sum; } | \
  awk '{print $1}')
```

The `shasum -a 256` first / `sha256sum` second order works because macOS
ships `shasum` by default and most Linux distros ship both (some minimal
containers ship only `sha256sum`). The `awk '{print $1}'` strips the
trailing `  -` token both binaries emit. A failed-to-resolve `PROJECT_KEY`
is impossible — `pwd -P` always succeeds inside any shell.

**Why not `sha256sum | head -c 64` (the form in an earlier draft):**

1. `sha256sum` isn't on default macOS. The first branch of the spec's
   earlier `||` chain therefore failed silently.
2. Without `set -o pipefail` (which a downstream agent's shell won't have),
   `failing-cmd | sha256sum | head -c 64` reports the *last* stage's exit
   code — `head` exits 0 even on empty input — so the whole pipeline looked
   "successful" while emitting an empty `project_id`.
3. The validator would reject the empty string, the event would fail to
   write, and the gap signal would silently disappear.

Synthetic `project_id = "lessons"` is reserved for the lessons.md scanner
(Section 4) and is accepted by the validator as a special case.

### 1.6 Tests

- Validator accepts a fully-populated event.
- Validator accepts an event with only `topic`, `source`, `project_id`
  (omitting both optional fields).
- Validator rejects an invalid `source` enum.
- Validator rejects a non-kebab-case `topic` (`"Agent Eval Harnesses"`).
- Validator rejects a `project_id` that is neither 64-char hex nor
  the literal `"lessons"`.
- Validator rejects an `agent_excerpt` over 200 chars.
- Integration test: invoking `handleEvent` through the CLI flow produces a
  validated event in the ledger.

## Section 2 — Lens I (`I-knowledge-gaps`) Aggregator

### 2.1 Location and registration (concrete file/line targets)

The lens is a sibling to A–H at
**`src/observability/engine/checks/lens-i-knowledge-gaps.ts`** (note the
path uses the existing `engine/checks/` sibling — verified via
`ls src/observability/engine/checks/` and the existing
`lens-h-cross-doc.ts` neighbor).

The lens exports a `LensFn` matching the signature defined at
`src/observability/engine/checks/registry.ts:11` (current shape:
`(graph, ledger, context) => Finding[] | Promise<Finding[]>`). Lens I
ignores the `graph` argument (DocGraph is irrelevant for ledger-driven
lenses; lens H demonstrates the `_graph` underscore-discard pattern). It
reads ledger events for `type === 'knowledge_gap_signal'` and merges in
the lessons-scanner output before bucketing.

Registration touches three named locations:

1. **`LENS_REGISTRY`** in `src/observability/engine/checks/registry.ts:25`
   — append a `LensManifest` entry: `{ id: 'I-knowledge-gaps', name:
   'Knowledge Gaps', requiredAdapters: [], ... }` (ledger is implicit via
   `runAudit`).
2. **`makeLensImplementations()`** in the same file at registry.ts:61 —
   add the entry `'I-knowledge-gaps': lensIKnowledgeGaps(projectRoot)`.
   Use `makeLensImplementations` (not the simpler `LENS_IMPLEMENTATIONS`
   map) because the lens needs `projectRoot` for the lessons.md path.
3. **`SCOPE_DOC_LENSES`** in `src/observability/engine/api.ts:67` —
   change from `new Set(['H-cross-doc'])` to
   `new Set(['H-cross-doc', 'I-knowledge-gaps'])`. The audit runner's
   `pickEnabledIds()` at api.ts:72 will then include Lens I under
   `--scope=docs` and under `--scope=all` (which unions both scope sets).

### 2.2 Inputs

- **Ledger events.** Read via the existing engine API (same path lens H
  uses) — all events of `type: 'knowledge_gap_signal'` with `ts` within the
  trailing 90 days from the lens invocation. This is *fixed*, not driven by
  `--since-hours`. Reason: `--since-hours` is an activity-view knob; gap
  accumulation needs a longer, deliberate horizon.
- **Lessons scanner output.** A direct in-process call to the lessons.md
  scanner (Section 4), returning synthetic `KnowledgeGapSignalPayload[]`.
  Merged with ledger signals before aggregation.

### 2.3 Topic normalization

```typescript
export function normalizeTopic(raw: string): string {
  return raw.toLowerCase()
    .replace(/['']/g, '')      // strip apostrophes (smart and dumb) before slugging
    .replace(/[_\s]+/g, '-')   // collapse underscores/whitespace to hyphens
    .replace(/-{2,}/g, '-')    // collapse repeated hyphens (e.g. "foo--bar" → "foo-bar")
    .replace(/^[-.]+|[-.]+$/g, '')  // trim leading/trailing hyphens and dots
}
```

Applied to every signal before bucketing. `"Agent-Eval-Harnesses"`,
`"agent_eval_harnesses"`, `"agent eval harnesses"`, `"agent's eval
harnesses"`, and `"agent--eval--harnesses"` all collapse to
`"agent-eval-harnesses"`. Other punctuation inside the slug (`!`, `?`,
parens) is left intact — agents are instructed via the tail to use
kebab-case slugs without such characters in the first place. Phase 3
intentionally stops here; fuzzy or stemmed matching is a Phase 5 lever if
empirical false-negative rates require it.

### 2.4 Aggregation

```typescript
type Bucket = {
  topic: string                          // normalized slug
  signals: KnowledgeGapSignalPayload[]   // every signal in this bucket
  distinct_projects: Set<string>         // unique project_id values
  first_seen: string                     // earliest ts
  last_seen: string                      // latest ts
  example_excerpts: string[]             // up to 3 distinct excerpts
}
```

Build buckets in one pass over the merged signal list. `first_seen` /
`last_seen` come from the ledger event `ts` for primary signals; for
lessons-scanner synthetics, both are set to the current audit timestamp
(see §4.6 for rationale — synthetic signals are exempt from window
expiry and reflect the live file contents).

### 2.5 Finding rules

| Condition | Severity | Confidence | Title pattern |
|---|---|---|---|
| `signal_count ≥ 3` AND `distinct_project_count ≥ 2` | P2 | `medium` | `Knowledge base lacks coverage for "<topic>" — <N> signals across <M> projects` |
| `signal_count ≥ 5` AND `distinct_project_count ≥ 3` | P1 | `high` | (same wording with the higher counts) |
| Below P2 threshold | not surfaced | — | — |

P1 takes precedence over P2 (one finding per topic, the highest applicable
severity).

### 2.6 Evidence variant + renderer impact

Add to `src/observability/engine/types.ts:92–98`:

```typescript
export type Evidence =
  | { kind: 'missing_node'; … }
  | // … existing variants …
  | { kind: 'knowledge_gap'
      topic: string
      signal_count: number
      distinct_projects: string[]   // up to 5 project_ids; truncate if more
      first_seen: string
      last_seen: string
      example_excerpts: string[]    // up to 3 distinct excerpts
    }
```

**Renderer impact (non-blocking polish).** The discriminated union has a
JSON-stringify fallback in every renderer
(`src/observability/renderers/markdown.ts` `renderEvidence()`,
`terminal.ts`, `dashboard.ts`, `mmr-findings.ts`), so a new variant
renders as JSON-shaped evidence by default — functional, but ugly.
Phase 3 ships **explicit pretty-render cases** in the markdown and
terminal renderers (the two surfaces most operators actually read) and
defers dashboard + mmr-findings polish to Phase 4 unless empirical
review shows the JSON fallback is unacceptable.

Pretty-render shape (markdown, suggested):

```markdown
*Topic:* `<normalized-topic>`
*Signals:* <signal_count> across <distinct_projects.length> projects
*Window:* <first_seen> → <last_seen>
*Example excerpts:*
- "<excerpt 1>"
- "<excerpt 2>"
```

### 2.7 Fix hint

Each finding carries a fix hint pointing to the knowledge-base directory:

```typescript
fix_hint: {
  kind: 'edit_doc',
  target: `content/knowledge/<category>/<topic>.md`,   // placeholder; category unknown at lens time
  prompt: `Propose a new knowledge entry for "<topic>". Evidence: <N> signals from <M> projects over <window>. Excerpts: …`
}
```

The lens cannot know which category the entry belongs in (`core/` vs
`web-app/` vs `multi-service/`) — the human reviewer picks. The `target`
field uses the category placeholder `<category>` literally so the renderer
displays it as guidance, not as a clickable path.

### 2.8 Degradation (aligned with `deriveVerdict`)

The current `deriveVerdict()` in `src/observability/engine/api.ts:79–83`
returns `degraded-pass` whenever `skipped_lenses > 0`. To avoid bumping
every empty-ledger audit to `degraded-pass`, the lens distinguishes
*empty* from *unreadable*:

- **Ledger empty (no `knowledge_gap_signal` events in window).** Lens
  returns `[]` — no findings, no `lens_skipped` emission. Verdict stays
  `pass`. This is the expected steady state for a healthy knowledge base.
- **Ledger genuinely unreadable** (I/O error, malformed JSONL the
  synthesizer can't recover from). Lens emits a `lens_skipped` evidence
  finding with `reason: 'adapter_unavailable'` and the verdict
  consequently becomes `degraded-pass` (per `deriveVerdict`). This is
  correct: the lens cannot run, so the operator should know.
- **lessons.md missing.** Scanner returns `[]`; lens proceeds with only
  ledger signals. Not a degradation — missing-lessons is the default
  state for projects that don't use `bd`.
- **No buckets cross the threshold.** Lens returns `[]`. Not a
  degradation; this is the healthy steady state.

### 2.9 Tests

- Returns no findings on empty ledger.
- Surfaces P2 when 3 signals from 2 projects target the same normalized topic.
- Surfaces P1 when 5 signals from 3 projects target the same normalized topic.
- Does NOT surface when 5 signals from 1 project hit the same topic
  (diversity gate).
- Different surface-spellings of the same topic collapse via
  `normalizeTopic`.
- Lessons-scanner output corroborates ledger signals correctly (2 ledger
  signals from 2 projects + 1 lessons mention = `signal_count=3,
  distinct_projects={p1, p2, lessons}=3` → P2 fires).
- Window enforcement: signals older than 90 days are excluded.

## Section 3 — Assembly-Time Tail Injection

### 3.1 Mechanism — two emission paths to update

The codebase has **two separate paths** that emit knowledge content,
verified via `grep -rn "Knowledge Base\|Domain Knowledge"`:

1. **Runtime assembly** — `src/core/assembly/engine.ts:101` calls
   `this.buildKnowledgeBaseSection(options.knowledgeEntries)` to build the
   `## Knowledge Base` section for `scaffold run <step>` and related
   commands. This is the runtime-prompt path.
2. **Generated Claude commands** — `src/core/adapters/claude-code.ts:84`
   has a `buildKnowledgeSection()` helper that emits a `## Domain
   Knowledge` section (note the different heading text) when the adapter
   generates `.claude/commands/*.md` files for downstream projects. This
   is the generated-command path used by `scaffold init` output.

Both paths must invoke the tail-renderer or downstream agents using one
path will be silently un-instrumented. The earlier draft pointed at
`src/core/assembly/knowledge-loader.ts`, which only *loads* entries — it
does not emit either section.

The tail-renderer lives in a single shared helper:

```typescript
// src/core/assembly/gap-signal-tail.ts  (new file, importable by both
// engine.ts and claude-code.ts)
export function renderGapSignalTail(opts: { stepName: string }): string {
  if (process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] === '1') return ''
  return GAP_SIGNAL_TAIL_TEMPLATE.replace(/\{\{step_name\}\}/g, opts.stepName)
}
```

Call sites:

```typescript
// in src/core/assembly/engine.ts, inside buildKnowledgeBaseSection()
// at the end of the function, before return:
if (knowledgeEntries.length > 0) {
  body += '\n\n' + renderGapSignalTail({ stepName: step.name })
}
return body
```

```typescript
// in src/core/adapters/claude-code.ts, inside buildKnowledgeSection()
// before the final return:
const tail = knowledgeEntries.length > 0
  ? '\n\n' + renderGapSignalTail({ stepName: input.slug })
  : ''
return `\n\n---\n\n## Domain Knowledge\n\n${parts.join('\n\n---\n\n')}${tail}`
```

Returning an empty string when `SCAFFOLD_GAP_SIGNAL_QUIET=1` keeps the
call-site idempotent — concatenating `'\n\n' + ''` produces a harmless
double newline that the markdown render trims. (Alternative: have the
caller guard the env var. Centralizing in the helper means we only need
to update one place if we later add suppression conditions.)

Trigger conditions for both call sites are identical:

1. The step has at least one knowledge-base entry in frontmatter (true
   for all 89 current pipeline steps — verified via
   `grep -rl "^knowledge-base:" content/pipeline --include='*.md'`).
2. The environment variable `SCAFFOLD_GAP_SIGNAL_QUIET` is not set to `1`.

### 3.2 Tail content (canonical)

```markdown
### When this knowledge base lacks what you need

If you search this section for a topic and find nothing — and you'd want
guidance to confidently proceed — emit a gap signal so the topic shows up
in the knowledge-base freshness audit:

```bash
PROJECT_KEY=$(git remote get-url origin 2>/dev/null || pwd -P)
PROJECT_ID=$(printf '%s' "$PROJECT_KEY" \
  | { command -v shasum >/dev/null 2>&1 && shasum -a 256 || sha256sum; } \
  | awk '{print $1}')
scaffold observe event knowledge_gap_signal \
  --branch="$(git rev-parse --abbrev-ref HEAD)" \
  --topic="<kebab-case-slug-of-missing-topic>" \
  --source=agent_search \
  --project-id="$PROJECT_ID" \
  --step-name="{{step_name}}" \
  --agent-excerpt="<≤200 chars of what you were looking for>"
```

Use a kebab-case slug like `agent-eval-harnesses`, not a full sentence.
Skip emission if you find adequate guidance (this is not for incomplete
coverage of a topic that IS present — it's for topics that aren't covered
at all).
```

The template is stored as a single multiline string constant in
`knowledge-loader.ts`. `{{step_name}}` is the only placeholder; the
assembler substitutes it once at render time.

### 3.3 Token cost

Tail is ~120 tokens. All 89 pipeline steps reference `knowledge-base:`, so
a full pipeline run incurs roughly 89 × 120 = ~10.7K added tokens. Relative
to assembled prompt sizes (hundreds of K), this is <5% overhead and well
within budget for the observability value.

### 3.4 Tests

- Tail is appended when the env var is unset and the step has knowledge
  entries.
- Tail is NOT appended when `SCAFFOLD_GAP_SIGNAL_QUIET=1`.
- Tail is NOT appended when the step has zero knowledge entries (defensive;
  no current step is in this state).
- `{{step_name}}` is substituted correctly.
- Snapshot test for one real pipeline step's assembled output, checked into
  `__snapshots__/` so reviewers see the actual end-to-end form.

## Section 4 — lessons.md Scanner

### 4.1 Location and shape

**`src/observability/checks/lens-i-lessons-scanner.ts`** — pure function:

```typescript
export function scanLessonsForGaps(absPath: string): KnowledgeGapSignalPayload[]
```

Called by Lens I at audit time. Does not write to the ledger or any other
side-effect state.

### 4.2 Input resolution

`absPath` is `<projectRoot>/tasks/lessons.md` where `projectRoot` is
resolved by `findProjectRoot(process.cwd())` in the lens invocation. If the
file doesn't exist or is empty, return `[]`. No errors thrown; missing file
is the default expected state.

### 4.3 Topic extraction (fence-aware line scanner + two-pass parser)

The scanner reads the file once line-by-line, tracking fenced-code-block
state via a simple toggle. Lines inside a fence are skipped for both
passes — preventing topic extraction from shell snippets, code examples,
and lesson-fix patches that commonly contain quoted phrases.

```typescript
// fence tracking
let insideFence = false
for (const line of lines) {
  if (/^```/.test(line.trim())) {
    insideFence = !insideFence
    continue
  }
  if (insideFence) continue
  // run Pass 1 + Pass 2 on `line` here
}
```

The fence regex is intentionally lenient — `^\`\`\`` matches both
language-tagged opens (` ```bash `) and bare closes (` ``` `). Mixed
4-backtick fences are not supported (lessons.md doesn't use them in
practice).

**Pass 1 — explicit markers** (high precision):

```regex
<!--\s*gap-topic:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->
```

The capture is taken verbatim. These are inserted by `bd` (when its
`--gap-topic` flag is used) or manually by humans curating lessons.md.

**Pass 2 — heuristic phrase patterns** (medium precision):

```javascript
const HEURISTIC_PATTERNS = [
  /(?:would have helped to have|missing) (?:a )?(?:guide|knowledge entry|entry) (?:on|for|about) ["`']?(.+?)["`'.]/i,
  /no (?:knowledge|kb) entry for ["`']?(.+?)["`'.]/i,
  /missing knowledge:\s*["`']?(.+?)["`'.]/i,
]
```

Captures are normalized through `normalizeTopic()` before being emitted as
synthetic signals. The non-greedy `(.+?)` capture stops at the next quote
or terminal `.`, which is intentional for sentence-shaped phrases — if
false-positive rates from runaway captures emerge in practice, Phase 4
can tighten the terminating set. The regex set is deliberately small (3
patterns) to minimize false positives; broader regexes are deferred to
Phase 4.

### 4.4 Output shape

For each extracted mention:

```typescript
{
  topic: normalizedTopic,
  source: 'lessons',
  project_id: 'lessons',           // synthetic; reserved literal
  step_name: undefined,
  agent_excerpt: matchedLine.slice(0, 200),
}
```

Multiple mentions of the same topic in lessons.md produce multiple signals.
The aggregator handles bucketing — the scanner does not pre-dedup.

### 4.5 Diversity-gate semantics

Because every lessons signal carries `project_id = 'lessons'`, lessons
mentions alone can never satisfy `distinct_project_count ≥ 2`. They count
as one "project" for the gate. This is deliberate: lessons.md corroborates
real signals, it doesn't manufacture gaps on its own.

Example:
- 2 agent_search signals from different real `project_id`s + 1 lessons
  mention → `distinct_projects = {p1, p2, 'lessons'} = 3` → P2 threshold
  met (≥2).
- 0 agent_search signals + 3 lessons mentions of the same topic →
  `distinct_projects = {'lessons'} = 1` → P2 threshold not met.

### 4.6 Synthetic signals are exempt from the 90-day window

The 90-day ledger window applies only to ledger-stored events. Lessons
synthetic signals are produced in-memory at audit time and reflect the
*current* state of `tasks/lessons.md` — they have no meaningful "age."
If lessons.md hasn't been touched in 6 months but still contains a topic
mention, that mention is still a live signal until the file is edited to
remove it.

Lens I applies window filtering **before** merging lessons-scanner
output:

```typescript
const ledgerSignals = ledgerEvents
  .filter(e => e.type === 'knowledge_gap_signal' && e.ts >= ninetyDaysAgo)
  .map(e => e.payload as KnowledgeGapSignalPayload)
const lessonsSignals = scanLessonsForGaps(lessonsPath)
const allSignals = [...ledgerSignals, ...lessonsSignals]
```

`first_seen` / `last_seen` on lessons-derived bucket members are set to
the current audit timestamp (not the lessons.md mtime) so they don't
falsely age out of any downstream window logic.

### 4.7 Tests

- Returns `[]` when file doesn't exist.
- Returns `[]` when file is empty.
- Extracts explicit `<!-- gap-topic: foo-bar -->` markers verbatim.
- Extracts each heuristic regex correctly against fixture lines.
- Multiple mentions of the same topic produce multiple signals.
- Handles UTF-8, Windows CRLF, unicode in non-slug positions without
  crashing.
- Does NOT extract topic mentions inside fenced code blocks (the
  fence-aware line scanner of §4.3 skips lines between ```` ``` ````
  fences). Fixture must include a fenced shell example containing a
  phrase that would match Pass 2 to prove the skip works.
- Toggling out of a fence and back in mid-file works (multiple fenced
  blocks in one lessons.md).

## Section 5 — Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Tail-injection token cost balloons | Currently 89 × ~120 = ~10.7K added tokens per full pipeline run. Bounded; if this grows, condense the tail. |
| Agents don't emit signals reliably | The tail includes a literal shell invocation, not just prose guidance — reduces reconstruction error. Phase 3 acceptance gate requires demonstrating signals fire from a real agent run. |
| Strict normalization misses near-duplicates | The tail tells the agent to use kebab-case slugs. If empirical false-negative rates are high, Phase 4 can add stemmed matching. Strict-first is reversible. |
| lessons.md is empty (true for many projects) | Lessons scanner returns `[]` gracefully. The system works with agent-search signals alone. |
| Single noisy power user manufactures gaps | The diversity gate (≥2 distinct `project_id`s) prevents this by design. |
| Ledger fills up with low-value signals | Each signal is small (~200 bytes); 90-day window bounds growth. The harvester rotates archives automatically. |
| `project_id` computation is non-portable | The canonical command in §1.5 uses `shasum -a 256` with `sha256sum` fallback (covers macOS and Linux), computes `PROJECT_KEY` separately before hashing (no `pipefail` dependency for fallback chain), and stays inside any subdirectory of a git repo. Documented in operations.md. Earlier draft used `sha256sum | head -c 64` which silently produced empty `project_id` on macOS — that bug is fixed in §1.5. |
| `SCAFFOLD_GAP_SIGNAL_QUIET` accidentally set in CI | Test fixtures and CI explicitly opt out; the variable name is verbose enough to avoid collision; documented. |
| Topic-slug regex blocks valid Unicode topics | Slug regex is intentionally ASCII-kebab. Topics in other scripts get romanized at the agent level (the agent picks the slug). |

## Section 6 — Cost Model

| Activity | Frequency | Per-run cost |
|---|---|---|
| Tail injection | Every pipeline run × every step | ~10.7K tokens added per full run; 0 LLM calls |
| Signal emission | Per actual gap encountered | One ledger write (~200 bytes); 0 LLM calls |
| Lens I audit run | Whenever `scaffold observe audit` runs | One ledger read (already happens for other lenses) + one tasks/lessons.md read + in-memory bucket math; 0 LLM calls |
| Lessons scan | Inline with Lens I | Single regex pass over one small file; ~ms |
| Total recurring cost | Negligible | No LLM calls at any point; gap detection is deterministic |

## Section 7 — Resolved Decisions

All five decisions are locked. Each was confirmed by zigrivers on 2026-05-26.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Project distinctness axis | Explicit `project_id` payload field (sha256 of `git remote get-url origin` or cwd realpath) | Other axes (worktree_id, branch, no-axis) either conflate or omit the right unit of analysis. Project identity is what "≥2 distinct projects" needs to mean. |
| 2 | Topic clustering | Strict slug match after light normalization (lowercase, underscores→hyphens, trim punctuation) | Predictable, fast, no LLM dependency. False negatives are reversible later via stemmed/LLM clustering if empirical rates require. False positives would be worse. |
| 3 | lessons.md scanner shape | Inline at lens time, no ledger writes; treated as a separate signal set merged by topic | No dedup risk between scanner runs and agent events. lessons.md is the source of truth (current contents at audit time, not a snapshot). Synthetic `project_id='lessons'` keeps lessons-only topics off the P2 threshold by design — see Decision #6 for the explicit refinement of the parent plan's Task 18 acceptance. |
| 6 | Parent plan Task 18 acceptance refinement | Lessons mentions corroborate agent-search signals; they do *not* independently emit gap signals or cross the P2 threshold | The parent plan's Task 18 acceptance reads "recurring patterns in lessons.md (≥3 mentions of same topic) emit gap signals." Phase 3 design narrows this: lessons.md mentions count as one project in the diversity gate and surface buckets only when at least one real-project signal is also present. Rationale: lessons.md is one user's curated retrospective; without external corroboration it'd let a single project manufacture gaps. The companion plan re-states Task 18's acceptance accordingly. |
| 4 | Tail injection mechanism | Assembly-time injection at the knowledge-loader; no per-step .md file edits | One source of truth. Reword once → 89 steps update. Zero file-churn cost. `SCAFFOLD_GAP_SIGNAL_QUIET=1` suppresses cleanly. |
| 5 | Phase 3 severity rules | Ship both P2 (≥3 signals, ≥2 projects) and P1 (≥5 signals, ≥3 projects) | Same plumbing; the P1 escalation lives in the same lens evaluator. Avoids a churn follow-up PR. |

## Section 8 — Naming Reference

| Surface | Name |
|---|---|
| Event type | `knowledge_gap_signal` |
| CLI invocation | `scaffold observe event knowledge_gap_signal` |
| Lens ID | `I-knowledge-gaps` |
| Lens file | `src/observability/checks/lens-i-knowledge-gaps.ts` |
| Scanner file | `src/observability/checks/lens-i-lessons-scanner.ts` |
| Assembly helper | `renderGapSignalTail({ stepName })` |
| Suppression env var | `SCAFFOLD_GAP_SIGNAL_QUIET=1` |
| Synthetic project ID for lessons | `"lessons"` |
| Evidence variant kind | `knowledge_gap` |
| Source enum values | `agent_search` \| `lessons` \| `manual` |
| Default rolling window | 90 days |
| Severity thresholds | P2: ≥3 signals × ≥2 projects · P1: ≥5 signals × ≥3 projects |

## Phase 3 Task Breakdown (preview — full plan in companion plan doc)

| # | Task | Independence |
|---|---|---|
| T1 | Event type & validator (`types.ts`, `event-schemas.ts`, CLI smoke test) | Independent |
| T2 | Assembly-time tail injection (`knowledge-loader.ts`) | Depends on T1 |
| T3 | lessons.md scanner (pure function) | Independent |
| T4 | Lens I aggregator + `Evidence` variant + audit-runner registration (LENS_REGISTRY entry, `makeLensImplementations` entry, `SCOPE_DOC_LENSES` update) + markdown & terminal pretty-render cases for the new evidence variant | Depends on T1, T3 |
| T5 | End-to-end validation + `docs/knowledge-freshness/operations.md` doc update | Depends on T1–T4 |

Estimated single PR `feat/knowledge-freshness-gap-detection` carrying
T1–T5 together; ~15 files modified; ~800 LOC net add including tests.
Phase-3-completion gate: a real or manually-reproduced run with 3 signals
across 2 projects produces a P2 Lens I finding in `scaffold observe audit`
output.

The detailed step-by-step plan lives in the companion plan doc
[`2026-05-26-knowledge-freshness-gap-detection.md`](../plans/2026-05-26-knowledge-freshness-gap-detection.md),
which writing-plans produces next.
