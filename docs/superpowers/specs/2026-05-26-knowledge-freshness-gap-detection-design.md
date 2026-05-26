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
- **Lens scope is data-driven, not docs/code.** The existing 8-lens
  framework partitions on `scope: 'docs' | 'code' | 'all'` based on what the
  lens *reads* — lens H reads docs, lenses A–G read code+graph. Lens I reads
  the ledger (which is neither). It registers under `scope: 'all'` and is
  surfaced under `--scope=docs` via a one-line addition to the scope-routing
  map (the docs scope is the closer semantic neighbor since gap detection is
  about *documentation* coverage), but it does not require a new scope axis.
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

`project_id` is `sha256(git remote get-url origin || realpath .)`.
The pipeline tail-instruction embeds the shell expansion so agents don't
have to think about it:

```bash
PROJECT_ID=$(git remote get-url origin 2>/dev/null | sha256sum | head -c 64 \
  || realpath . | sha256sum | head -c 64)
```

The `head -c 64` strips the trailing space + `-` that `sha256sum` appends.
Synthetic `project_id = "lessons"` is reserved for the lessons.md scanner
(Section 4) — the validator accepts that literal as a special case so the
scanner doesn't need a synthetic hex.

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

### 2.1 Location and registration

**`src/observability/checks/lens-i-knowledge-gaps.ts`** — sibling to lenses
A–H. Implements the `LensCheck` interface used by the audit runner. Adds
itself to whatever lens-registry the audit runner uses (the exact
registration mechanism is at the audit-runner call site; the plan will
identify it as part of T4).

`scope: 'all'`. The audit runner's scope-to-lens routing map gets a one-line
addition mapping the docs scope to include `I-knowledge-gaps` so
`--scope=docs` runs it alongside lens H.

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
    .replace(/[_\s]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
}
```

Applied to every signal before bucketing. `"Agent-Eval-Harnesses"`,
`"agent_eval_harnesses"`, `"agent eval harnesses"` all collapse to
`"agent-eval-harnesses"`.

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
lessons-scanner synthetics, both use the file's mtime (since lessons.md
isn't temporal at the line level).

### 2.5 Finding rules

| Condition | Severity | Confidence | Title pattern |
|---|---|---|---|
| `signal_count ≥ 3` AND `distinct_project_count ≥ 2` | P2 | `medium` | `Knowledge base lacks coverage for "<topic>" — <N> signals across <M> projects` |
| `signal_count ≥ 5` AND `distinct_project_count ≥ 3` | P1 | `high` | (same wording with the higher counts) |
| Below P2 threshold | not surfaced | — | — |

P1 takes precedence over P2 (one finding per topic, the highest applicable
severity).

### 2.6 Evidence variant

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

### 2.8 Degradation

- **Ledger empty or unreadable.** Emit a `lens_skipped` evidence finding
  with `reason: 'insufficient_data'`. Audit verdict unaffected.
- **lessons.md missing.** Scanner returns `[]`; lens proceeds with only
  ledger signals.
- **No buckets cross the threshold.** Lens emits no findings. This is the
  expected steady state for a healthy knowledge base.

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

### 3.1 Mechanism

In `src/core/assembly/knowledge-loader.ts`, after the function that emits
the `## Knowledge Base` section for a step, append a fixed tail when:

1. The step has at least one knowledge-base entry in frontmatter (true for
   all 89 current pipeline steps — verified via
   `grep -rl "^knowledge-base:" content/pipeline --include='*.md'`).
2. The environment variable `SCAFFOLD_GAP_SIGNAL_QUIET` is not set to `1`.

The assembler exports a new helper:

```typescript
export function renderGapSignalTail(opts: { stepName: string }): string {
  return GAP_SIGNAL_TAIL_TEMPLATE.replace(/\{\{step_name\}\}/g, opts.stepName)
}
```

The call site in the assembler:

```typescript
if (knowledgeEntries.length > 0 && process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] !== '1') {
  assembledKnowledgeBase += '\n\n' + renderGapSignalTail({ stepName: step.name })
}
```

### 3.2 Tail content (canonical)

```markdown
### When this knowledge base lacks what you need

If you search this section for a topic and find nothing — and you'd want
guidance to confidently proceed — emit a gap signal so the topic shows up
in the knowledge-base freshness audit:

```bash
PROJECT_ID=$(git remote get-url origin 2>/dev/null | sha256sum | head -c 64 \
  || realpath . | sha256sum | head -c 64)
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

### 4.3 Topic extraction (two-pass parser)

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
synthetic signals. The regex set is deliberately small (3 patterns) to
minimize false positives — broader regexes will be added in Phase 4 only if
empirical false-negative rates are high.

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

### 4.6 Tests

- Returns `[]` when file doesn't exist.
- Returns `[]` when file is empty.
- Extracts explicit `<!-- gap-topic: foo-bar -->` markers verbatim.
- Extracts each heuristic regex correctly against fixture lines.
- Multiple mentions of the same topic produce multiple signals.
- Handles UTF-8, Windows CRLF, unicode in non-slug positions without
  crashing.
- Doesn't extract topic mentions inside fenced code blocks (skip lines
  between ```` ``` ```` fences).

## Section 5 — Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Tail-injection token cost balloons | Currently 89 × ~120 = ~10.7K added tokens per full pipeline run. Bounded; if this grows, condense the tail. |
| Agents don't emit signals reliably | The tail includes a literal shell invocation, not just prose guidance — reduces reconstruction error. Phase 3 acceptance gate requires demonstrating signals fire from a real agent run. |
| Strict normalization misses near-duplicates | The tail tells the agent to use kebab-case slugs. If empirical false-negative rates are high, Phase 4 can add stemmed matching. Strict-first is reversible. |
| lessons.md is empty (true for many projects) | Lessons scanner returns `[]` gracefully. The system works with agent-search signals alone. |
| Single noisy power user manufactures gaps | The diversity gate (≥2 distinct `project_id`s) prevents this by design. |
| Ledger fills up with low-value signals | Each signal is small (~200 bytes); 90-day window bounds growth. The harvester rotates archives automatically. |
| `project_id` computation is wrong (e.g., agents run inside a subdirectory) | `git remote get-url origin` is run from any subdirectory of a git repo; only the cwd-realpath fallback is sensitive. Documented in operations.md. |
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
| 3 | lessons.md scanner shape | Inline at lens time, no ledger writes; treated as a separate signal set merged by topic | No dedup risk between scanner runs and agent events. lessons.md is the source of truth (file mtime, not snapshot). Synthetic `project_id='lessons'` keeps lessons-only topics off the P2 threshold by design. |
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
| T4 | Lens I aggregator + `Evidence` variant + audit-runner registration | Depends on T1, T3 |
| T5 | End-to-end validation + `docs/knowledge-freshness/operations.md` doc update | Depends on T1–T4 |

Estimated single PR `feat/knowledge-freshness-gap-detection` carrying
T1–T5 together; ~15 files modified; ~800 LOC net add including tests.
Phase-3-completion gate: a real or manually-reproduced run with 3 signals
across 2 projects produces a P2 Lens I finding in `scaffold observe audit`
output.

The detailed step-by-step plan lives in the companion plan doc
[`2026-05-26-knowledge-freshness-gap-detection.md`](../plans/2026-05-26-knowledge-freshness-gap-detection.md),
which writing-plans produces next.
