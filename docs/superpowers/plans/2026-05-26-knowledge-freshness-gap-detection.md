# Knowledge-Freshness Gap Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 3 of the knowledge-freshness system — a structured `knowledge_gap_signal` observability event, an assembly-time tail in every pipeline prompt that instructs agents to emit one when they hit a knowledge-base gap, a `tasks/lessons.md` scanner that surfaces the same signal from human-curated retrospectives, and a new audit lens (`I-knowledge-gaps`) that aggregates both sources and emits P2/P1 findings when ≥3 signals from ≥2 distinct projects target the same topic.

**Architecture:** Extend the existing observability ledger with one new event type; thread that event end-to-end through the `observe event` CLI (zero CLI changes — already data-driven via `EVENT_PAYLOAD_KEYS`), a shared assembler-time tail-injection helper called from both `AssemblyEngine.buildKnowledgeBaseSection` (runtime prompt path) and `claude-code.ts::buildKnowledgeSection` (generated-command path), a pure lessons-scanner function called inline by Lens I, and a new audit lens registered in three places (`LENS_REGISTRY` array, `LENS_IMPLEMENTATIONS` map, `SCOPE_DOC_LENSES` set). All decisions are locked in the companion design doc — this plan implements verbatim from there.

**Tech Stack:** TypeScript (existing `src/`), Vitest for unit tests, Node `node:crypto` for sha256, Node `node:fs/path` for I/O, Zod-free validator pattern (matches existing `event-schemas.ts:114–175` switch shape).

**Companion design doc:** [`docs/superpowers/specs/2026-05-26-knowledge-freshness-gap-detection-design.md`](../specs/2026-05-26-knowledge-freshness-gap-detection-design.md). Read it first — it carries the resolved decisions, the exact file/line targets, the rationale for the `'lessons'` synthetic project_id and its exclusion from the diversity gate, and the round-1-through-round-5 design corrections that the plan inherits without re-deriving.

---

## Phase Sequencing

Phase 3 is a single phase producing a single PR on branch
`feat/knowledge-freshness-phase-3` (already checked out from this
worktree, branched off `origin/main`). Tasks land in this order:

| Task | Outcome | Depends on |
|---|---|---|
| **T1** | `knowledge_gap_signal` event type + validator + CLI passthrough tests | — |
| **T2** | Shared `renderGapSignalTail` helper + dual-call-site wiring | T1 |
| **T3** | `scanLessonsForGaps` pure function (fence-aware, ASCII-safe regex) | — |
| **T4** | Lens I aggregator + Evidence variant + 3-site registration + markdown pretty-render | T1, T3 |
| **T5** | End-to-end validation against a real audit; operations.md update | T1–T4 |

**Parallel-dispatch opportunities** (under `superpowers:subagent-driven-development`):

- T1 and T3 are fully independent; dispatch in parallel.
- T2 starts when T1 lands (the validator must accept the new event before any tail-injection test can pass end-to-end).
- T4 starts when both T1 and T3 land.
- T5 is final-integration only; runs serially after T4.

**Estimated size:** ~15 files modified, ~800 LOC net add including
tests, per the spec's §"Phase 3 Task Breakdown" budget.

**Branch model:** All T1–T5 work goes on branch
`feat/knowledge-freshness-phase-3` already checked out in this worktree.
Each task has its own commit; the PR opens after T5 lands.

---

## Task 1 — Event Type & Validator + CLI Passthrough Tests

Touches the discriminated-union event type, adds the new validation
case, and proves CLI flag plumbing already works. Zero CLI code changes
required (the CLI auto-coerces `--<key>=<value>` flags via the existing
`snakeKey()` machinery; the validator filters payload keys via
`EVENT_PAYLOAD_KEYS[type]`).

**Files:**
- Modify: `src/observability/engine/types.ts:9–17` (extend `EventType`), `:29–56` (add `KnowledgeGapSignalPayload` interface and discriminant arm)
- Modify: `src/observability/engine/event-schemas.ts:3–12` (add payload-keys entry), `:40–43` (add `VALID_GAP_SOURCES` constant), `:114–175` (add validation switch case)
- Test: `src/observability/engine/event-schemas.test.ts` (extend with new cases) — or create if absent

- [ ] **Step 1: Read the spec section to anchor the contract**

Spec §1.1, §1.2, §1.3, §1.5, §1.6 of
`docs/superpowers/specs/2026-05-26-knowledge-freshness-gap-detection-design.md`.
Key contract:

- Payload shape: `{ topic, source, project_id, step_name?, agent_excerpt? }`
- `topic`: required, kebab-case slug (regex `^[a-z0-9]+(-[a-z0-9]+)*$`), ≤80 chars
- `source`: required, enum of `'agent_search' | 'lessons' | 'manual'`
- `project_id`: required string; either 64-char sha256 hex OR the literal `'lessons'`; if it's `'lessons'`, then `source` MUST also be `'lessons'` (reserved-literal cross-field rule)
- `step_name`: optional string
- `agent_excerpt`: optional string, ≤200 chars

- [ ] **Step 2: Write failing validator tests**

Open `src/observability/engine/event-schemas.test.ts`. If the file
already exists, append a new `describe()` block. If it doesn't exist
(verify with `ls src/observability/engine/event-schemas.test.ts`),
create it with the imports below:

```typescript
import { describe, it, expect } from 'vitest'
import { validateEvent } from './event-schemas.js'

function baseEvent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    event_id: '01HXXXXXXXXXXXXXXXXXXXXXX',
    worktree_id: '00000000-0000-4000-8000-000000000000',
    actor_label: 'test-agent',
    branch: 'feat/test',
    task_id: null,
    ts: '2026-05-26T12:00:00Z',
    ...overrides,
  }
}

const VALID_HEX = 'a'.repeat(64)

describe('validateEvent — knowledge_gap_signal', () => {
  it('accepts a fully-populated event', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: {
        topic: 'agent-eval-harnesses',
        source: 'agent_search',
        project_id: VALID_HEX,
        step_name: 'tech-stack',
        agent_excerpt: 'I was looking for harness patterns and found nothing.',
      },
    }))
    expect(result.ok).toBe(true)
  })

  it('accepts a minimal event (only required payload fields)', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'agent-eval-harnesses', source: 'agent_search', project_id: VALID_HEX },
    }))
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid source enum', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'foo', source: 'bogus', project_id: VALID_HEX },
    }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.some(e => /source/.test(e))).toBe(true)
  })

  it('rejects a non-kebab-case topic', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'Agent Eval Harnesses', source: 'agent_search', project_id: VALID_HEX },
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects a topic >80 chars', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'a-' + 'b'.repeat(80), source: 'agent_search', project_id: VALID_HEX },
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects a project_id that is neither 64-char hex nor "lessons"', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'foo', source: 'agent_search', project_id: 'too-short' },
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects project_id="lessons" when source != "lessons" (reserved-literal cross-field rule)', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'foo', source: 'agent_search', project_id: 'lessons' },
    }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.some(e => /reserved.*lessons|project_id/.test(e))).toBe(true)
  })

  it('accepts project_id="lessons" when source="lessons" (synthetic scanner round-trip safety)', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'foo', source: 'lessons', project_id: 'lessons' },
    }))
    expect(result.ok).toBe(true)
  })

  it('rejects agent_excerpt over 200 chars', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: {
        topic: 'foo', source: 'agent_search', project_id: VALID_HEX,
        agent_excerpt: 'a'.repeat(201),
      },
    }))
    expect(result.ok).toBe(false)
  })

  it('filters unknown payload keys silently (matches existing data-driven shape)', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: {
        topic: 'foo', source: 'agent_search', project_id: VALID_HEX,
        unknown_extra: 'should be dropped',
      },
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.dropped_fields).toContain('unknown_extra')
  })
})
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/observability/engine/event-schemas.test.ts`
Expected: FAIL on all 10 new cases — `unknown event type: knowledge_gap_signal`.

- [ ] **Step 4: Extend `EventType` and add the payload interface and discriminant arm**

In `src/observability/engine/types.ts`, replace the existing `EventType`
union (lines 9–17) with:

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
  | 'knowledge_gap_signal'
```

Add the payload interface alongside the existing payload interfaces
(after `FindingAckPayload` at line 46, before the `Event` union at
line 48):

```typescript
export interface KnowledgeGapSignalPayload {
  topic: string                                  // required, kebab-case slug, ≤80 chars
  source: 'agent_search' | 'lessons' | 'manual'  // required
  project_id: string                             // required: 64-char sha256 hex OR the literal "lessons"
  step_name?: string                             // optional, pipeline step slug
  agent_excerpt?: string                         // optional, ≤200 chars
}
```

Extend the `Event` discriminated union (lines 48–56) with the new arm
at the end:

```typescript
export type Event =
  | (BaseEvent & { type: 'task_claimed';         payload: TaskClaimedPayload })
  | (BaseEvent & { type: 'task_completed';       payload: TaskCompletedPayload })
  | (BaseEvent & { type: 'decision_recorded';    payload: DecisionRecordedPayload })
  | (BaseEvent & { type: 'blocker_hit';          payload: BlockerHitPayload })
  | (BaseEvent & { type: 'blocker_resolved';     payload: BlockerResolvedPayload })
  | (BaseEvent & { type: 'pr_opened';            payload: PrOpenedPayload })
  | (BaseEvent & { type: 'progress_heartbeat';   payload: HeartbeatPayload })
  | (BaseEvent & { type: 'finding_acknowledged'; task_id: null; payload: FindingAckPayload })
  | (BaseEvent & { type: 'knowledge_gap_signal'; payload: KnowledgeGapSignalPayload })
```

- [ ] **Step 5: Add the payload-keys entry in `EVENT_PAYLOAD_KEYS`**

**This map is the source of truth for both CLI passthrough and validator
filtering.** Per `src/observability/engine/event-schemas.ts:105–112`,
`filteredPayload` is built by walking the incoming payload and keeping
only keys present in `EVENT_PAYLOAD_KEYS[type]`. The switch case below
in Step 7 will never see fields that are absent here. Forgetting this
edit is the highest-risk silent-failure mode in T1 — all five payload
fields would be silently dropped before validation runs, and the
integration test in Step 10 would observe an empty `payload: {}`.

In `src/observability/engine/event-schemas.ts`, extend the
`EVENT_PAYLOAD_KEYS` record (lines 3–12) with the new entry as the last
property:

```typescript
export const EVENT_PAYLOAD_KEYS: Record<EventType, string[]> = {
  task_claimed:         ['task_title', 'story_id', 'wave', 'unplanned'],
  task_completed:       ['outcome', 'pr_number', 'commit_sha'],
  decision_recorded:    ['key', 'summary', 'affects', 'links'],
  blocker_hit:          ['kind', 'summary'],
  blocker_resolved:     ['summary', 'references'],
  pr_opened:            ['pr_number'],
  progress_heartbeat:   ['note'],
  finding_acknowledged: ['finding_id', 'status', 'note'],
  knowledge_gap_signal: ['topic', 'source', 'project_id', 'step_name', 'agent_excerpt'],
}
```

- [ ] **Step 6: Add the `VALID_GAP_SOURCES` constant**

In `src/observability/engine/event-schemas.ts`, alongside the existing
`VALID_OUTCOMES` / `VALID_BLOCKER_KINDS` / `VALID_ACK_STATUSES` (lines
41–43), add:

```typescript
const VALID_GAP_SOURCES = ['agent_search', 'lessons', 'manual'] as const
```

- [ ] **Step 7: Add the validation switch case**

In `src/observability/engine/event-schemas.ts`, inside the `switch
(type)` block (the one starting around line 114), add a new `case` at
the end of the switch, immediately before the closing brace:

```typescript
  case 'knowledge_gap_signal':
    reqStr('knowledge_gap_signal.payload.topic', filteredPayload.topic, errors, 80)
    if (typeof filteredPayload.topic === 'string' &&
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(filteredPayload.topic)) {
      errors.push(
        'knowledge_gap_signal.payload.topic must be kebab-case slug ' +
        '(lowercase, hyphen-separated)',
      )
    }
    if (!VALID_GAP_SOURCES.includes(filteredPayload.source as never)) {
      errors.push(
        'knowledge_gap_signal.payload.source must be agent_search | lessons | manual',
      )
    }
    if (typeof filteredPayload.project_id !== 'string') {
      errors.push('knowledge_gap_signal.payload.project_id required')
    } else if (filteredPayload.project_id === 'lessons') {
      if (filteredPayload.source !== 'lessons') {
        errors.push(
          'knowledge_gap_signal.payload.project_id="lessons" is reserved for synthetic ' +
          'lessons.md scanner signals; source must also be "lessons"',
        )
      }
    } else if (!/^[a-f0-9]{64}$/.test(filteredPayload.project_id)) {
      errors.push(
        'knowledge_gap_signal.payload.project_id must be a 64-char sha256 hex string',
      )
    }
    optStr('knowledge_gap_signal.payload.step_name', filteredPayload.step_name, errors)
    optStr('knowledge_gap_signal.payload.agent_excerpt', filteredPayload.agent_excerpt, errors, 200)
    break
```

The `as never` cast on the `source` check matches the existing pattern
at `case 'task_completed':` (line 127) and `case 'blocker_hit':` (line
146). Don't change the style — consistency with the surrounding code
beats local idiomatic improvement; the cross-cutting refactor is
deferred per the deferred-findings file.

- [ ] **Step 8: Run validator tests and confirm pass**

Run: `npx vitest run src/observability/engine/event-schemas.test.ts`
Expected: PASS — all 10 new cases plus all pre-existing cases.

- [ ] **Step 9: Run the full type-check + test suite**

Run: `npm run type-check`
Expected: PASS — the exhaustive switch in `validateEvent` should still
type-check after the new case lands. The `Event` union extension is
backwards-compatible (every prior usage still discriminates correctly).

Run: `npx vitest run src/observability/`
Expected: PASS — no other observability test should break. If
anything breaks, it's a test that was implicitly exhaustive over
`EventType`; either add the missing arm or filter out
`knowledge_gap_signal` in that test as appropriate.

- [ ] **Step 10: Add an automated handleEvent integration test**

The spec's §1.6 calls for an "integration test: invoking `handleEvent`
through the CLI flow produces a validated event in the ledger." The
manual smoke command in Step 10b below is informational; the
auto-running guard lives here, in `src/cli/commands/observe.test.ts`.

Append the new `describe` block to `src/cli/commands/observe.test.ts`,
**matching the file's established pattern**: named `node:fs` imports
(not `fs.` namespace), `ensureIdentity()` for identity bootstrap, and
a single per-`describe` temp directory managed by `beforeEach` /
`afterEach`. The file's existing `describe('observe event subcommand',
...)` block at the top is the template — read it before adding the new
block.

Imports already in `observe.test.ts`:
- `describe`, `it`, `expect`, `beforeEach`, `afterEach` from `'vitest'`
- `mkdtempSync`, `rmSync`, `readFileSync`, `existsSync` (and others) from `'node:fs'`
- `tmpdir` from `'node:os'`
- `join` from `'node:path'`
- `handleEvent` from `'./observe.js'`
- `ensureIdentity` from `'../../observability/engine/identity.js'`

You do **not** need to add any imports — the file's existing set
covers everything the new test needs. Append the new describe block at
the bottom of the file (after the last existing block):

```typescript
describe('handleEvent — knowledge_gap_signal', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-cli-kgs-'))
    ensureIdentity(dir, 'agent-alice')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('persists all five payload fields through the CLI flow', async () => {
    const exitCode = await handleEvent({
      cwd: dir,
      type: 'knowledge_gap_signal',
      branch: 'main',
      taskId: null,
      keyValues: {
        topic: 'agent-eval-harnesses',
        source: 'agent_search',
        'project-id': 'a'.repeat(64),
        'step-name': 'tech-stack',
        'agent-excerpt': 'a manual smoke test',
      },
    })
    expect(exitCode).toBe(0)
    const ledgerPath = join(dir, '.scaffold/activity.jsonl')
    expect(existsSync(ledgerPath)).toBe(true)
    const lastLine = readFileSync(ledgerPath, 'utf8').trim().split('\n').pop()!
    const obj = JSON.parse(lastLine) as Record<string, unknown>
    expect(obj['type']).toBe('knowledge_gap_signal')
    expect(obj['payload']).toEqual({
      topic: 'agent-eval-harnesses',
      source: 'agent_search',
      project_id: 'a'.repeat(64),
      step_name: 'tech-stack',
      agent_excerpt: 'a manual smoke test',
    })
  })

  it('rejects project_id="lessons" with non-lessons source (validator rule)', async () => {
    const exitCode = await handleEvent({
      cwd: dir,
      type: 'knowledge_gap_signal',
      branch: 'main',
      taskId: null,
      keyValues: { topic: 'foo', source: 'agent_search', 'project-id': 'lessons' },
    })
    expect(exitCode).toBe(2) // validation-failure exit code
  })
})
```

Run the test:

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS for both cases.

- [ ] **Step 10b: Manual CLI smoke (optional, for local verification)**

The automated integration test above is the load-bearing check. For
local sanity, you can also run a manual smoke against a temp worktree
(make sure `npm run build` has run **unconditionally** first so `dist/`
reflects the new event type — an existing `dist/` from before T1 will
be stale):

```bash
# From the scaffold worktree root:
npm run build
SCAFFOLD_BIN="$(git rev-parse --show-toplevel)/dist/index.js"
TMPDIR=$(mktemp -d)
cd "$TMPDIR"
git init -q && git remote add origin https://example.org/test 2>/dev/null
node "$SCAFFOLD_BIN" observe event knowledge_gap_signal \
  --branch="main" --topic="smoke-test-topic" --source=agent_search \
  --project-id="$(printf 'https://example.org/test' | shasum -a 256 | awk '{print $1}')" \
  --step-name="tech-stack" --agent-excerpt="manual smoke test"
echo "exit: $?"
cat .scaffold/activity.jsonl | tail -1
cd - >/dev/null && rm -rf "$TMPDIR"
```

Expected: exit 0; the JSONL line shows
`"type":"knowledge_gap_signal","payload":{"topic":"smoke-test-topic",...}`
with all five payload fields present.

- [ ] **Step 11: Commit**

```bash
git add src/observability/engine/types.ts \
        src/observability/engine/event-schemas.ts \
        src/observability/engine/event-schemas.test.ts \
        src/cli/commands/observe.test.ts
git commit -m "feat(observability): add knowledge_gap_signal event type + validator

Adds the new event type to the EventType union, KnowledgeGapSignalPayload
interface, and a validation case enforcing the reserved-literal cross-
field rule (project_id='lessons' requires source='lessons'). Zero CLI
changes — the existing data-driven --<key>=<value> machinery handles
the new flags via EVENT_PAYLOAD_KEYS. Adds an automated handleEvent
integration test in observe.test.ts proving end-to-end CLI passthrough.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Assembly-Time Tail Injection

Adds a shared `renderGapSignalTail` helper and wires it into both
emission paths (runtime assembly + generated Claude commands). Per the
spec, **Option A** is committed (change the signatures of
`buildKnowledgeBaseSection` and `buildKnowledgeSection` to receive
`stepName`). Token cost: ~120 tokens × 89 steps = ~10.7K tokens per full
pipeline run, well within budget per spec §3.3.

**Files:**
- Create: `src/core/assembly/gap-signal-tail.ts` (new shared helper)
- Create: `src/core/assembly/gap-signal-tail.test.ts` (TDD)
- Modify: `src/core/assembly/engine.ts:101` (caller of `buildKnowledgeBaseSection` — pass `step` positional through), `:172–180` (method signature changes to accept `stepName`)
- Modify: `src/core/adapters/claude-code.ts:32` (caller of `buildKnowledgeSection` — pass `slug`), `:74–85` (function signature accepts `stepSlug`)
- Modify: `src/core/assembly/engine.test.ts` (existing tests need the new arg)
- Modify: `src/core/adapters/claude-code.test.ts` (existing tests need the new arg)

- [ ] **Step 1: Read the spec section to anchor the contract**

Spec §3.1 and §3.2 of the design doc. Key contract:

- One helper, two call sites.
- Helper returns `''` when `SCAFFOLD_GAP_SIGNAL_QUIET=1` (and callers
  no-op the concatenation in that case).
- Helper substitutes `{{step_name}}` placeholder with the passed
  `stepName`.
- Token cost is acceptable; the tail goes into the assembled prompt
  for every pipeline step that has knowledge entries (all 89 today).

- [ ] **Step 2: Write failing tests for the helper**

Create `src/core/assembly/gap-signal-tail.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderGapSignalTail } from './gap-signal-tail.js'

describe('renderGapSignalTail', () => {
  const originalEnv = process.env['SCAFFOLD_GAP_SIGNAL_QUIET']

  beforeEach(() => {
    delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
  })

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
    else process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = originalEnv
  })

  it('returns a non-empty tail string when the env var is unset', () => {
    const tail = renderGapSignalTail({ stepName: 'tech-stack' })
    expect(tail.length).toBeGreaterThan(0)
  })

  it('includes the scaffold observe event invocation', () => {
    const tail = renderGapSignalTail({ stepName: 'tech-stack' })
    expect(tail).toContain('scaffold observe event knowledge_gap_signal')
  })

  it('substitutes {{step_name}} with the provided stepName', () => {
    const tail = renderGapSignalTail({ stepName: 'tech-stack' })
    expect(tail).toContain('--step-name="tech-stack"')
    expect(tail).not.toContain('{{step_name}}')
  })

  it('returns empty string when SCAFFOLD_GAP_SIGNAL_QUIET=1', () => {
    process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = '1'
    const tail = renderGapSignalTail({ stepName: 'tech-stack' })
    expect(tail).toBe('')
  })

  it('does not suppress when SCAFFOLD_GAP_SIGNAL_QUIET is any value other than "1"', () => {
    process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = '0'
    expect(renderGapSignalTail({ stepName: 'x' }).length).toBeGreaterThan(0)

    process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = 'true'
    expect(renderGapSignalTail({ stepName: 'x' }).length).toBeGreaterThan(0)
  })

  it('uses portable PROJECT_ID computation (shasum-first with sha256sum fallback)', () => {
    const tail = renderGapSignalTail({ stepName: 'x' })
    expect(tail).toContain('shasum -a 256')
    expect(tail).toContain('sha256sum')
    expect(tail).toContain('pwd -P')
  })

  it('uses a non-failing branch resolution', () => {
    const tail = renderGapSignalTail({ stepName: 'x' })
    expect(tail).toContain('git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown')
  })
})
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/core/assembly/gap-signal-tail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the helper**

Create `src/core/assembly/gap-signal-tail.ts`:

```typescript
/**
 * Renders the gap-signal tail appended to a pipeline step's Knowledge
 * Base section. The tail instructs downstream agents to emit a
 * knowledge_gap_signal observability event when they search the
 * knowledge base for a topic and find nothing.
 *
 * Returns the empty string when SCAFFOLD_GAP_SIGNAL_QUIET=1 so test
 * fixtures and CI stay deterministic.
 *
 * Called from two sites:
 *  - src/core/assembly/engine.ts (runtime assembly path)
 *  - src/core/adapters/claude-code.ts (generated-command path)
 */

const GAP_SIGNAL_TAIL_TEMPLATE = `### When this knowledge base lacks what you need

If you search this section for a topic and find nothing — and you'd want
guidance to confidently proceed — emit a gap signal so the topic shows up
in the knowledge-base freshness audit:

\`\`\`bash
PROJECT_KEY=$(git remote get-url origin 2>/dev/null || pwd -P)
PROJECT_ID=$(printf '%s' "$PROJECT_KEY" \\
  | { command -v shasum >/dev/null 2>&1 && shasum -a 256 || sha256sum; } \\
  | awk '{print $1}')
scaffold observe event knowledge_gap_signal \\
  --branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)" \\
  --topic="<kebab-case-slug-of-missing-topic>" \\
  --source=agent_search \\
  --project-id="$PROJECT_ID" \\
  --step-name="{{step_name}}" \\
  --agent-excerpt="<≤200 chars of what you were looking for>"
\`\`\`

Use a kebab-case slug like \`agent-eval-harnesses\`, not a full sentence.
Skip emission if you find adequate guidance (this is not for incomplete
coverage of a topic that IS present — it's for topics that aren't covered
at all).`

export interface RenderGapSignalTailOptions {
  stepName: string
}

export function renderGapSignalTail(opts: RenderGapSignalTailOptions): string {
  if (process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] === '1') return ''
  return GAP_SIGNAL_TAIL_TEMPLATE.replace(/\{\{step_name\}\}/g, opts.stepName)
}
```

- [ ] **Step 5: Run helper tests and confirm pass**

Run: `npx vitest run src/core/assembly/gap-signal-tail.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 6: Wire the helper into the runtime assembly path**

Edit `src/core/assembly/engine.ts`. First, add an import near the top
of the file (alongside other `./` imports):

```typescript
import { renderGapSignalTail } from './gap-signal-tail.js'
```

Then change the signature of `buildKnowledgeBaseSection` (the method at
lines 172–180) to accept a `stepName` parameter, and append the tail:

```typescript
  private buildKnowledgeBaseSection(entries: KnowledgeEntry[], stepName: string): string {
    if (entries.length === 0) {
      return '(No knowledge base entries specified for this step.)'
    }

    const body = entries
      .map(entry => `## ${entry.name}: ${entry.description}\n\n${entry.content}`)
      .join('\n\n')

    const tail = renderGapSignalTail({ stepName })
    return tail ? `${body}\n\n${tail}` : body
  }
```

Update the call site at line 101 to pass the positional `step`
argument:

```typescript
        { heading: 'Knowledge Base',
          content: this.buildKnowledgeBaseSection(options.knowledgeEntries, step) },
```

`step` is the positional first argument to `assemble(step: string, options:
AssemblyOptions)` at line 53 of the same file — it is **not** a field
on `options`. Do not write `options.step`; that field does not exist on
`AssemblyOptions` and the TypeScript compiler will reject it.

- [ ] **Step 7: Update engine tests that already construct calls**

Run: `npx vitest run src/core/assembly/engine.test.ts`
Expected: Some tests may fail with `Expected 2 arguments, but got 1` —
the method signature changed.

For each failing test, update the call site to pass a step name (any
non-empty string works for fixture purposes). For example, the test at
`engine.test.ts:134` ("Verify order: System before Meta-Prompt before
Knowledge Base") goes through the full `engine.assemble(...)` flow and
should pass without changes. The tests that directly invoke
`buildKnowledgeBaseSection` (search for that string in the test file)
need the second arg.

Search for direct invocations:

```bash
grep -n "buildKnowledgeBaseSection" src/core/assembly/engine.test.ts
```

For each match, add a step-name argument like `'test-step'`.

Also: existing tests likely rely on the **absence** of the tail in the
output. The simplest way to keep them passing without rewriting them is
to set `SCAFFOLD_GAP_SIGNAL_QUIET=1` in a top-level `beforeAll`/`afterAll`
in `engine.test.ts`. First, ensure the vitest imports at the top of
the file include all four lifecycle hooks needed: `beforeAll`,
`afterAll`, `beforeEach`, `afterEach` (the dedicated describe block
below uses `beforeEach`/`afterEach` for finer scoping). The existing
import is just `import { describe, it, expect } from 'vitest'` — extend
it to:

```typescript
import {
  describe, it, expect, beforeAll, afterAll, beforeEach, afterEach,
} from 'vitest'
```

Then add this top-level block after imports, BEFORE the existing
`describe`s:

```typescript
const ORIGINAL_QUIET = process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
beforeAll(() => { process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = '1' })
afterAll(() => {
  if (ORIGINAL_QUIET === undefined) delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
  else process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = ORIGINAL_QUIET
})
```

The save-and-restore pattern matters because some CI environments may
set `SCAFFOLD_GAP_SIGNAL_QUIET` for their own reasons; an unconditional
`delete` would clobber that. Same pattern is used by the new dedicated
test block below (with `beforeEach`/`afterEach` for finer scoping).

Add a new dedicated test that exercises the WITH-tail path. The file
already has `makeOptions()` and `makeKBEntry()` helpers near the top
(at `engine.test.ts:81` and `engine.test.ts:95`) — reuse them
directly:

```typescript
describe('AssemblyEngine — gap-signal tail injection', () => {
  const originalQuiet = process.env['SCAFFOLD_GAP_SIGNAL_QUIET']

  beforeEach(() => { delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] })
  afterEach(() => {
    if (originalQuiet === undefined) delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
    else process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = originalQuiet
  })

  const withKnowledge = () => makeOptions({
    knowledgeEntries: [makeKBEntry({ name: 'tdd-patterns', description: 'd', content: 'c' })],
  })
  const withoutKnowledge = () => makeOptions({ knowledgeEntries: [] })

  it('appends gap-signal tail to Knowledge Base section when env var unset', () => {
    const engine = new AssemblyEngine()
    const result = engine.assemble('tech-stack', withKnowledge())
    expect(result.success).toBe(true)
    expect(result.prompt?.text).toContain('scaffold observe event knowledge_gap_signal')
    expect(result.prompt?.text).toContain('--step-name="tech-stack"')
  })

  it('does NOT append tail when SCAFFOLD_GAP_SIGNAL_QUIET=1', () => {
    process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = '1'
    const engine = new AssemblyEngine()
    const result = engine.assemble('tech-stack', withKnowledge())
    expect(result.success).toBe(true)
    expect(result.prompt?.text).not.toContain('scaffold observe event knowledge_gap_signal')
  })

  it('does NOT append tail when there are no knowledge entries (defensive)', () => {
    const engine = new AssemblyEngine()
    const result = engine.assemble('tech-stack', withoutKnowledge())
    expect(result.success).toBe(true)
    expect(result.prompt?.text).not.toContain('scaffold observe event knowledge_gap_signal')
  })
})
```

`makeOptions()` returns a valid `AssemblyOptions` with sensible defaults
including a valid `metaPrompt`, depth 3, empty knowledge by default, and
a base `ScaffoldConfig` / `PipelineState`. `makeKBEntry()` returns a
valid `KnowledgeEntry` you can spread overrides into. Neither helper
needs new code — they exist already.

- [ ] **Step 8: Run engine tests and confirm pass**

Run: `npx vitest run src/core/assembly/engine.test.ts`
Expected: PASS — all existing tests plus the three new tail-injection
tests.

- [ ] **Step 9: Wire the helper into the generated-command (claude-code) path**

Edit `src/core/adapters/claude-code.ts`. Add the import near the top
of the file:

```typescript
import { renderGapSignalTail } from '../assembly/gap-signal-tail.js'
```

**Note:** `buildKnowledgeSection` is a **local** function defined inside
this same file (at lines 74–85), not an import from elsewhere. The edit
in this step changes both that local function's body AND the call site
in `generateStepWrapper` at line 32. Both live in the same file; the
import added above is just for the new shared `renderGapSignalTail`
helper.

Change the signature of `buildKnowledgeSection` (the function at lines
74–85) to accept a `stepSlug` parameter and append the tail:

```typescript
function buildKnowledgeSection(
  entries: Array<{ name: string; description: string; content: string }>,
  stepSlug: string,
): string {
  if (entries.length === 0) return ''

  const parts = entries.map((entry) => {
    const header = `### ${entry.name}\n\n*${entry.description}*`
    return `${header}\n\n${entry.content.trim()}`
  })

  const body = `\n\n---\n\n## Domain Knowledge\n\n${parts.join('\n\n---\n\n')}`
  const tail = renderGapSignalTail({ stepName: stepSlug })
  return tail ? `${body}\n\n${tail}` : body
}
```

Update the call site at line 32 inside `generateStepWrapper(input)` to
pass `slug`:

```typescript
    // Build knowledge section
    const knowledgeSection = buildKnowledgeSection(knowledgeEntries, slug)
```

`slug` is already in scope at line 22 (destructured from `input`).

- [ ] **Step 10: Update claude-code tests**

Run: `npx vitest run src/core/adapters/claude-code.test.ts`
Expected: Some failures because existing tests don't expect the tail.

Apply the same approach as Step 7: ensure the vitest imports at the
top of `src/core/adapters/claude-code.test.ts` include `beforeAll`,
`afterAll`, `beforeEach`, and `afterEach` (extend the existing import
line). Then add the save-and-restore top-level block at the top of the
file (after imports, before existing `describe`s):

```typescript
const ORIGINAL_QUIET = process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
beforeAll(() => { process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = '1' })
afterAll(() => {
  if (ORIGINAL_QUIET === undefined) delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
  else process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = ORIGINAL_QUIET
})
```

This stabilizes existing claude-code tests. Then add a dedicated
`describe('buildKnowledgeSection — gap-signal tail')` block covering:

```typescript
describe('buildKnowledgeSection — gap-signal tail', () => {
  const originalQuiet = process.env['SCAFFOLD_GAP_SIGNAL_QUIET']

  beforeEach(() => { delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] })
  afterEach(() => {
    if (originalQuiet === undefined) delete process.env['SCAFFOLD_GAP_SIGNAL_QUIET']
    else process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = originalQuiet
  })

  it('emits Domain Knowledge section + gap-signal tail when entries are present', () => {
    const adapter = new ClaudeCodeAdapter()
    const output = adapter.generateStepWrapper(makeStepInput({
      slug: 'tech-stack',
      knowledgeEntries: [{ name: 'tdd-patterns', description: 'd', content: 'c' }],
    }))
    expect(output.files[0].content).toContain('## Domain Knowledge')
    expect(output.files[0].content).toContain('scaffold observe event knowledge_gap_signal')
    expect(output.files[0].content).toContain('--step-name="tech-stack"')
  })

  it('omits both sections when there are no entries', () => {
    const adapter = new ClaudeCodeAdapter()
    const output = adapter.generateStepWrapper(makeStepInput({
      slug: 'tech-stack', knowledgeEntries: [],
    }))
    expect(output.files[0].content).not.toContain('Domain Knowledge')
    expect(output.files[0].content).not.toContain('scaffold observe event')
  })

  it('omits the tail when SCAFFOLD_GAP_SIGNAL_QUIET=1', () => {
    process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] = '1'
    const adapter = new ClaudeCodeAdapter()
    const output = adapter.generateStepWrapper(makeStepInput({
      slug: 'tech-stack',
      knowledgeEntries: [{ name: 'tdd-patterns', description: 'd', content: 'c' }],
    }))
    expect(output.files[0].content).toContain('## Domain Knowledge')
    expect(output.files[0].content).not.toContain('scaffold observe event')
  })
})
```

The `makeStepInput` helper at the top of `claude-code.test.ts` likely
exists already — reuse it. If it doesn't, look at the existing test at
`claude-code.test.ts:73` ("generated file includes knowledge entries
under Domain Knowledge heading") and copy its `generateStepWrapper(...)`
input shape.

- [ ] **Step 11: Run claude-code tests and confirm pass**

Run: `npx vitest run src/core/adapters/claude-code.test.ts`
Expected: PASS — all pre-existing tests plus the three new tail-injection
tests.

- [ ] **Step 12: Verify other adapters aren't broken**

Search for any other caller of `buildKnowledgeSection`:

```bash
grep -rn "buildKnowledgeSection" src/
```

Expected: `claude-code.ts:32` (the only call site) and the test file we
just updated. No other adapter imports it; gemini.ts / codex.ts /
universal.ts construct the knowledge section themselves through the
runtime assembly path which goes through `engine.ts` (already updated).

Run the broad assembly + adapters tests:

```bash
npx vitest run src/core/assembly/ src/core/adapters/
```

Expected: PASS.

- [ ] **Step 13: Verify a fresh `npm run type-check` is still clean**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/core/assembly/gap-signal-tail.ts \
        src/core/assembly/gap-signal-tail.test.ts \
        src/core/assembly/engine.ts \
        src/core/assembly/engine.test.ts \
        src/core/adapters/claude-code.ts \
        src/core/adapters/claude-code.test.ts
git commit -m "feat(observability): inject gap-signal tail at both knowledge emission paths

Adds src/core/assembly/gap-signal-tail.ts with the canonical tail text
and SCAFFOLD_GAP_SIGNAL_QUIET=1 suppression. Wired into both
AssemblyEngine.buildKnowledgeBaseSection (runtime prompts) and
buildKnowledgeSection in the claude-code adapter (generated commands).
Both call sites now thread the step name through (Option A from the
spec). Existing tests stabilized by setting the quiet env var in a
beforeAll; three new dedicated tests per call site cover the with-tail
and without-tail paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — lessons.md Scanner (Pure Function)

A pure function `scanLessonsForGaps(absPath: string):
KnowledgeGapSignalPayload[]`. Reads exactly the path it's given,
returns `[]` on missing/empty file, skips lines inside fenced code
blocks, applies one explicit-marker regex + three heuristic regexes,
and synthesizes payloads with `source='lessons'` and
`project_id='lessons'`.

**Files:**
- Create: `src/observability/checks/lens-i-lessons-scanner.ts`
- Create: `src/observability/checks/lens-i-lessons-scanner.test.ts`

This task is fully independent of T1 (it does not import the new event
type yet — only the payload shape, which we duplicate here as a local
type; T4 will fix the import). It can dispatch in parallel with T1.

- [ ] **Step 1: Read the spec section to anchor the contract**

Spec §4.1, §4.3, §4.4, §4.7. Key contract:

- Pure function; no side effects.
- Input: absolute path. Output: `KnowledgeGapSignalPayload[]`.
- Pass 1 (explicit markers): `<!-- gap-topic: SLUG -->` — capture
  verbatim.
- Pass 2 (heuristic regexes): three patterns; captures flow through
  `normalizeTopic`.
- Fence-aware: skip lines inside ```` ``` ```` fences (toggle on
  triple-backtick lines).
- Synthetic payload shape: `{ topic, source: 'lessons', project_id:
  'lessons', step_name: undefined, agent_excerpt }` where
  `agent_excerpt = matchedLine.slice(0, 200)`.

- [ ] **Step 2: Write failing tests**

Create `src/observability/checks/lens-i-lessons-scanner.test.ts`:

```typescript
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { scanLessonsForGaps, normalizeTopic } from './lens-i-lessons-scanner.js'

const tmpFiles: string[] = []

function writeTmp(content: string): string {
  const p = path.join(os.tmpdir(), `lessons-test-${crypto.randomUUID()}.md`)
  fs.writeFileSync(p, content, 'utf8')
  tmpFiles.push(p)
  return p
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const f = tmpFiles.pop()!
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
})

describe('scanLessonsForGaps', () => {
  it('returns [] when the file does not exist', () => {
    const nonexistent = path.join(os.tmpdir(), `does-not-exist-${crypto.randomUUID()}.md`)
    expect(scanLessonsForGaps(nonexistent)).toEqual([])
  })

  it('returns [] when the file is empty', () => {
    const p = writeTmp('')
    expect(scanLessonsForGaps(p)).toEqual([])
  })

  it('extracts an explicit <!-- gap-topic: slug --> marker verbatim', () => {
    const p = writeTmp('## Lesson\n\n<!-- gap-topic: agent-eval-harnesses -->\n\nbody\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('agent-eval-harnesses')
    expect(signals[0].source).toBe('lessons')
    expect(signals[0].project_id).toBe('lessons')
  })

  it('extracts a "would have helped" heuristic match', () => {
    const p = writeTmp(`## Lesson\n\nWould have helped to have a guide on "agent eval harnesses".\n`)
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('agent-eval-harnesses')
  })

  it('extracts a "no knowledge entry for" heuristic match', () => {
    const p = writeTmp('No knowledge entry for "retry-with-jitter".\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('retry-with-jitter')
  })

  it('extracts a "missing knowledge:" heuristic match', () => {
    const p = writeTmp('Missing knowledge: \`circuit-breaker-patterns\`.\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('circuit-breaker-patterns')
  })

  it('matches sentences ending in ! or ?', () => {
    const p = writeTmp([
      'Would have helped to have a guide on agent eval harnesses!',
      'No knowledge entry for retry-with-jitter?',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    const topics = signals.map(s => s.topic).sort()
    expect(topics).toContain('agent-eval-harnesses')
    expect(topics).toContain('retry-with-jitter')
  })

  it('strips apostrophes via normalizeTopic (smart and ASCII)', () => {
    const p = writeTmp([
      'Would have helped to have a guide on "agent’s eval harnesses".',
      "No knowledge entry for \"agent's eval harnesses\".",
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    for (const s of signals) {
      expect(s.topic).toBe('agents-eval-harnesses')
    }
  })

  it('normalizes punctuation to validator-compatible kebab slug (direct normalizeTopic test)', () => {
    // Direct test of normalizeTopic — covers cases that are independent
    // of the heuristic capture path.
    expect(normalizeTopic('react-19.0')).toBe('react-19-0')
    expect(normalizeTopic('agent eval?')).toBe('agent-eval')
    expect(normalizeTopic('Foo_Bar')).toBe('foo-bar')
  })

  it('captures version-numbered topics through the heuristic path without truncating', () => {
    // The closing class uses [.!?](?=\s|$) so an internal dot followed
    // by a digit (like "react-19.0") survives the capture; only the
    // sentence-terminating dot ends the match.
    const p = writeTmp('No knowledge entry for "react-19.0".\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('react-19-0')
  })

  it('produces multiple signals when the same topic appears on different lines', () => {
    const p = writeTmp([
      '<!-- gap-topic: foo-bar -->',
      'No knowledge entry for "foo-bar".',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(2)
    expect(signals.every(s => s.topic === 'foo-bar')).toBe(true)
  })

  it('does NOT extract topic mentions from inside a fenced code block', () => {
    const p = writeTmp([
      '## Lesson',
      '',
      'Real prose: would have helped to have a guide on "real-topic".',
      '',
      '\`\`\`bash',
      '# this is a code example, NOT a real lesson',
      '# no knowledge entry for "fake-topic-in-code"',
      '\`\`\`',
      '',
      'More prose.',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    const topics = signals.map(s => s.topic)
    expect(topics).toContain('real-topic')
    expect(topics).not.toContain('fake-topic-in-code')
  })

  it('handles multiple fenced blocks (toggle in/out works)', () => {
    const p = writeTmp([
      'No knowledge entry for "first-topic".',
      '\`\`\`',
      'No knowledge entry for "ignored-1"',
      '\`\`\`',
      'No knowledge entry for "second-topic".',
      '\`\`\`bash',
      'No knowledge entry for "ignored-2"',
      '\`\`\`',
      'No knowledge entry for "third-topic".',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    const topics = signals.map(s => s.topic).sort()
    expect(topics).toEqual(['first-topic', 'second-topic', 'third-topic'])
  })

  it('caps agent_excerpt to 200 chars', () => {
    const longSuffix = 'x'.repeat(300)
    const p = writeTmp(`No knowledge entry for "long-topic". ${longSuffix}.\n`)
    const signals = scanLessonsForGaps(p)
    expect(signals[0].agent_excerpt!.length).toBeLessThanOrEqual(200)
  })

  it('handles Windows CRLF line endings without crashing', () => {
    const p = writeTmp('<!-- gap-topic: crlf-topic -->\r\nbody\r\n')
    const signals = scanLessonsForGaps(p)
    expect(signals[0].topic).toBe('crlf-topic')
  })

  it('drops topics exceeding the 80-char validator limit (heuristic)', () => {
    // A runaway capture would violate the canonical
    // KnowledgeGapSignalPayload contract; the scanner enforces the
    // ≤80-char kebab-slug rule locally before emitting.
    const longish = 'a'.repeat(90)
    const p = writeTmp(`No knowledge entry for "${longish}".\n`)
    const signals = scanLessonsForGaps(p)
    expect(signals).toEqual([])
  })

  it('drops explicit markers whose slug exceeds 80 chars', () => {
    const longSlug = 'a'.repeat(81)
    const p = writeTmp(`<!-- gap-topic: ${longSlug} -->\n`)
    const signals = scanLessonsForGaps(p)
    expect(signals).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `npx vitest run src/observability/checks/lens-i-lessons-scanner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the scanner**

Create `src/observability/checks/lens-i-lessons-scanner.ts`:

```typescript
import fs from 'node:fs'

/**
 * Synthetic gap-signal payload produced by the lessons scanner. Mirrors
 * the KnowledgeGapSignalPayload defined in
 * src/observability/engine/types.ts but is duplicated locally so this
 * file stays in the checks/ tree alongside the lens code. T4 will
 * unify the import once the lens consumes both.
 */
export interface LessonsGapSignalPayload {
  topic: string
  source: 'lessons'
  project_id: 'lessons'
  step_name?: string
  agent_excerpt?: string
}

const EXPLICIT_MARKER_RE = /<!--\s*gap-topic:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->/g

// Sentence-terminating . ! ? end the capture only when followed by
// whitespace or end-of-line. This preserves version-style dots inside
// topics (e.g. "react-19.0") while still terminating real sentence
// ends ("missing knowledge: foo." captures "foo"). Quotes/backticks
// terminate unconditionally.
const TERM = `(?:["\`]|[.!?](?=\\s|$))`
const HEURISTIC_PATTERNS: RegExp[] = [
  new RegExp(
    `(?:would have helped to have|missing) (?:a )?` +
    `(?:guide|knowledge entry|entry) (?:on|for|about) ` +
    `["\`']?(.+?)${TERM}`, 'i',
  ),
  new RegExp(`no (?:knowledge|kb) entry for ["\`']?(.+?)${TERM}`, 'i'),
  new RegExp(`missing knowledge:\\s*["\`']?(.+?)${TERM}`, 'i'),
]

const FENCE_RE = /^\s*\`\`\`/

/**
 * Normalize a captured topic phrase to a validator-compatible
 * kebab-case slug. Matches the spec §2.3 contract — must always
 * produce strings satisfying ^[a-z0-9]+(-[a-z0-9]+)*$ or empty string.
 */
export function normalizeTopic(raw: string): string {
  return raw.toLowerCase()
    .replace(/['\u2018\u2019]/g, '')        // strip ASCII + U+2018 + U+2019 smart-quote apostrophes
    .replace(/[^a-z0-9-]+/g, '-')             // any other non-slug char becomes a hyphen
    .replace(/-{2,}/g, '-')                   // collapse repeated hyphens
    .replace(/^-+|-+$/g, '')                  // trim leading/trailing hyphens
}

/**
 * Reads an absolute path to a lessons.md file and returns synthetic
 * gap-signal payloads. Returns [] on missing/empty file (no throws).
 *
 * Lens I owns path resolution; this scanner reads exactly the path
 * it's given.
 */
export function scanLessonsForGaps(absPath: string): LessonsGapSignalPayload[] {
  let content: string
  try {
    content = fs.readFileSync(absPath, 'utf8')
  } catch {
    return [] // missing file is the default expected state
  }
  if (content.trim() === '') return []

  const out: LessonsGapSignalPayload[] = []

  // Normalize CRLF → LF before splitting so trailing \r doesn't leak into captures.
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let insideFence = false

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      insideFence = !insideFence
      continue
    }
    if (insideFence) continue

    // Pass 1 — explicit markers (multiple per line OK via /g)
    EXPLICIT_MARKER_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = EXPLICIT_MARKER_RE.exec(line)) !== null) {
      const slug = m[1]
      if (slug && isValidTopic(slug)) {
        out.push({
          topic: slug,
          source: 'lessons',
          project_id: 'lessons',
          agent_excerpt: line.slice(0, 200),
        })
      }
    }

    // Pass 2 — heuristic patterns (first match per line per regex is enough)
    for (const re of HEURISTIC_PATTERNS) {
      const match = re.exec(line)
      if (!match) continue
      const normalized = normalizeTopic(match[1] ?? '')
      if (!isValidTopic(normalized)) continue
      out.push({
        topic: normalized,
        source: 'lessons',
        project_id: 'lessons',
        agent_excerpt: line.slice(0, 200),
      })
    }
  }

  return out
}

/**
 * Synthetic payloads from this scanner never round-trip through the
 * runtime validator (they're consumed in-memory by Lens I), but the
 * scanner enforces the same kebab-case-slug ≤80-chars contract here
 * so the in-process payloads remain shape-compatible with
 * KnowledgeGapSignalPayload from the canonical types. Drops
 * (rather than truncates) overlong topics — an 80+ char topic is
 * almost always a runaway regex capture, not a real gap.
 */
const TOPIC_MAX = 80
const TOPIC_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function isValidTopic(topic: string): boolean {
  return topic.length > 0 && topic.length <= TOPIC_MAX && TOPIC_SLUG_RE.test(topic)
}
```

- [ ] **Step 5: Run tests and confirm pass**

Run: `npx vitest run src/observability/checks/lens-i-lessons-scanner.test.ts`
Expected: PASS — all 13 cases.

- [ ] **Step 6: Run a broader sweep to confirm no collateral damage**

Run: `npx vitest run src/observability/`
Expected: PASS — no other observability test should break since this
is a new file with no callers yet.

- [ ] **Step 7: Commit**

```bash
git add src/observability/checks/lens-i-lessons-scanner.ts \
        src/observability/checks/lens-i-lessons-scanner.test.ts
git commit -m "feat(observability): add lessons.md gap-signal scanner

Pure function scanLessonsForGaps(absPath) — reads tasks/lessons.md,
extracts explicit <!-- gap-topic: slug --> markers and three heuristic
phrase patterns, skips fenced code blocks, normalizes captures to
validator-compatible kebab-case slugs, and returns synthetic
KnowledgeGapSignalPayload-shaped objects with source='lessons' and
project_id='lessons'. Lens I (T4) owns path resolution; this scanner
reads exactly the path it's given and returns [] on missing/empty file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Lens I Aggregator + Evidence Variant + Registration + Renderer

Adds the new audit lens and threads it through the engine.

**Files:**
- Modify: `src/observability/engine/types.ts:92–98` (extend the `Evidence` discriminated union with a `knowledge_gap` variant)
- Create: `src/observability/checks/lens-i-knowledge-gaps.ts` (the lens implementation)
- Create: `src/observability/checks/lens-i-knowledge-gaps.test.ts`
- Modify: `src/observability/engine/checks/registry.ts:25` (add to `LENS_REGISTRY`), `:48` (add to `LENS_IMPLEMENTATIONS`)
- Modify: `src/observability/engine/api.ts:67` (add to `SCOPE_DOC_LENSES`)
- Modify: `src/observability/checks/lens-i-lessons-scanner.ts` (T3) — change the duplicated `LessonsGapSignalPayload` to import the canonical `KnowledgeGapSignalPayload` from T1
- Modify: `src/observability/renderers/markdown.ts` — add pretty-render case for the `knowledge_gap` evidence variant

- [ ] **Step 1: Read the spec section to anchor the contract**

Spec §2.1, §2.2, §2.3, §2.4 (with the `delete('lessons')` rule), §2.5
(P2 + P1 finding thresholds), §2.6 (Evidence variant +
`distinct_project_count` separate from sample array), §2.7 (fix hint),
§2.8 (degradation), §4.6 (TimedSignal wrapper, synthetic-signals exempt
from window).

Key non-obvious requirements:
- `distinctProjects.delete('lessons')` runs **before** the count is
  computed for the diversity gate.
- Signals are bucketed by `normalizeTopic()` output, not raw topic.
- Use a `TimedSignal = { payload, ts }` wrapper so ledger event `ts`
  isn't lost during merge; lessons-derived signals get the current
  audit timestamp.
- 90-day window applies only to ledger events; lessons synthetics are
  always current.
- Two finding rules: P2 (≥3 signals × ≥2 real projects), P1 (≥5 × ≥3).
  P1 takes precedence (one finding per topic; highest applicable
  severity).
- Evidence carries both `distinct_project_count` (authoritative) and
  `distinct_projects` (sample, truncated to 5).

- [ ] **Step 2: Extend the `Evidence` discriminated union**

Edit `src/observability/engine/types.ts` lines 92–98. The current
`Evidence` union ends with the `lens_skipped` variant. Add the new
arm:

```typescript
export type Evidence =
  | { kind: 'missing_node'; graph_query: string; expected: string }
  | { kind: 'orphan_node'; graph_query: string; node_id: string }
  | { kind: 'rule_violation'; rule_id: string; file: string; lines?: [number, number] }
  | { kind: 'ac_not_covered'; story_id: string; ac_id: string; missing_tests: string[] }
  | { kind: 'doc_disagreement'; left_doc: string; right_doc: string; conflict: string }
  | { kind: 'lens_skipped'; reason: 'adapter_unavailable' | 'insufficient_data'; needed: string[] }
  | {
      kind: 'knowledge_gap'
      topic: string
      signal_count: number
      distinct_project_count: number   // authoritative count (after delete('lessons'))
      distinct_projects: string[]      // sample of up to 5 project_ids; truncated for size
      first_seen: string
      last_seen: string
      example_excerpts: string[]       // up to 3 distinct excerpts
    }
```

- [ ] **Step 3: Update the lessons scanner to import the canonical payload type (T3 → T4 cleanup)**

In `src/observability/checks/lens-i-lessons-scanner.ts`, replace the
duplicated `LessonsGapSignalPayload` interface with an import from the
canonical types:

```typescript
import fs from 'node:fs'
import type { KnowledgeGapSignalPayload } from '../engine/types.js'

const EXPLICIT_MARKER_RE = /<!--\s*gap-topic:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->/g

// ... (rest unchanged)

export function scanLessonsForGaps(absPath: string): KnowledgeGapSignalPayload[] {
  // ... (function body unchanged but return type swapped)
}
```

Delete the local `LessonsGapSignalPayload` interface. TypeScript will
verify the swap is shape-compatible. (`KnowledgeGapSignalPayload` has
broader enum for `source` and `project_id`, but the values we produce
here are still valid members of those unions.)

Re-run the T3 tests to confirm nothing broke:

```bash
npx vitest run src/observability/checks/lens-i-lessons-scanner.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing tests for Lens I**

Create `src/observability/checks/lens-i-knowledge-gaps.test.ts`:

```typescript
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { lensIKnowledgeGaps } from './lens-i-knowledge-gaps.js'
import type {
  Event, DocGraph, AvailabilityMap, Finding, KnowledgeGapSignalPayload,
} from '../engine/types.js'
import type { LensContext } from '../engine/checks/runner.js'

// ── Test fixtures ──

const VALID_HEX_A = 'a'.repeat(64)
const VALID_HEX_B = 'b'.repeat(64)
const VALID_HEX_C = 'c'.repeat(64)

function makeEvent(overrides: Partial<{
  ts: string; payload: KnowledgeGapSignalPayload
}>): Event {
  return {
    event_id: crypto.randomUUID(),
    worktree_id: '00000000-0000-4000-8000-000000000000',
    actor_label: 'test',
    branch: 'main',
    task_id: null,
    // Default to "now" so events fall inside the lens's 90-day window
    // regardless of when the test runs. Tests that need a specific age
    // pass `ts` in overrides (e.g. the >90-day-old window-exclusion test).
    ts: overrides.ts ?? new Date().toISOString(),
    type: 'knowledge_gap_signal',
    payload: overrides.payload ?? {
      topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A,
    },
  } as Event
}

// Empty graph stub — Lens I ignores the graph
const emptyGraph: DocGraph = {
  cwd: '/tmp',
  features: [], stories: [], acceptance_criteria: [],
  plan_tasks: [], playbook_tasks: [], tests: [],
  pull_requests: [], files: [], rules: [], components: [],
  tokens: [], decisions: [], edges: [], provenance: {},
  unresolved_globs: [],
}

const stubAvailability: AvailabilityMap = {
  git: { status: 'available' }, gh: { status: 'available' },
  pipeline_docs: { status: 'available' }, tests: { status: 'available' },
  state: { status: 'available' }, beads: { status: 'available' },
  mmr: { status: 'available' }, audit_history: { status: 'available' },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

const tmpDirs: string[] = []

function makeTmpProject(lessonsContent?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-i-test-'))
  tmpDirs.push(dir)
  if (lessonsContent !== undefined) {
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'tasks', 'lessons.md'), lessonsContent, 'utf8')
  }
  return dir
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

function makeContext(cwd: string): LensContext {
  return { profile: 'fast', cwd }
}

async function runLens(opts: {
  events?: Event[], cwd?: string,
}): Promise<Finding[]> {
  const cwd = opts.cwd ?? makeTmpProject()
  return await lensIKnowledgeGaps(
    emptyGraph,
    { events: opts.events ?? [] },
    stubAvailability,
    [],
    new Set(['I-knowledge-gaps']),
    makeContext(cwd),
  )
}

// ── Tests ──

describe('lensIKnowledgeGaps', () => {
  it('returns no findings on empty ledger and missing lessons.md', async () => {
    const findings = await runLens({ events: [] })
    expect(findings).toEqual([])
  })

  it('returns no findings when below P2 threshold (2 signals, 2 projects)', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    expect(findings).toEqual([])
  })

  it('surfaces P2 when 3 signals from 2 real projects target the same normalized topic', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('P2')
    expect(findings[0].lens_id).toBe('I-knowledge-gaps')
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.topic).toBe('foo-bar')
    expect(findings[0].evidence.signal_count).toBe(3)
    expect(findings[0].evidence.distinct_project_count).toBe(2)
  })

  it('escalates to P1 when 5 signals from 3 real projects target the same normalized topic', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_C } }),
      ],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('P1')
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.distinct_project_count).toBe(3)
  })

  it('does NOT surface when 5 signals come from a single project (diversity gate)', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
      ],
    })
    expect(findings).toEqual([])
  })

  it('does NOT count synthetic project_id="lessons" as a distinct project (gate)', async () => {
    // 2 CLI from project A + 1 lessons mention should be 1 distinct project, no P2.
    const cwd = makeTmpProject('No knowledge entry for "foo-bar".\n')
    const findings = await runLens({
      cwd,
      events: [
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
      ],
    })
    expect(findings).toEqual([])
  })

  it('lessons mentions still contribute to signal_count when real projects also signal', async () => {
    // 2 CLI from 2 different projects + 1 lessons = signal_count=3, distinct=2 → P2 fires
    const cwd = makeTmpProject('No knowledge entry for "foo-bar".\n')
    const findings = await runLens({
      cwd,
      events: [
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('P2')
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.signal_count).toBe(3)
    expect(findings[0].evidence.distinct_project_count).toBe(2)
  })

  it('collapses different surface-spellings of the same topic via normalizeTopic', async () => {
    // Three different on-the-wire topics that all normalize to 'foo-bar'.
    // If the lens bucketed by raw `payload.topic`, this would produce 3
    // buckets of size 1 (no finding). If it normalizes first, it produces
    // one bucket of size 3 with 2 distinct projects (P2 fires).
    const findings = await runLens({
      events: [
        makeEvent({ payload: {
          topic: 'foo-bar', source: 'agent_search', project_id: VALID_HEX_A,
        } }),
        makeEvent({ payload: {
          topic: 'Foo_Bar', source: 'agent_search', project_id: VALID_HEX_A,
        } }),
        makeEvent({ payload: {
          topic: 'foo bar', source: 'agent_search', project_id: VALID_HEX_B,
        } }),
      ],
    })
    expect(findings).toHaveLength(1)
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.topic).toBe('foo-bar')
    expect(findings[0].evidence.signal_count).toBe(3)
    expect(findings[0].evidence.distinct_project_count).toBe(2)
  })

  it('lessons-only signals never cross the P2 threshold (negative case)', async () => {
    // Five lessons mentions of the same topic, no ledger signals.
    // distinct_project_count = 0 after delete('lessons') → no finding.
    const cwd = makeTmpProject([
      'No knowledge entry for "lessons-only-topic".',
      'No knowledge entry for "lessons-only-topic".',
      'No knowledge entry for "lessons-only-topic".',
      'No knowledge entry for "lessons-only-topic".',
      'No knowledge entry for "lessons-only-topic".',
    ].join('\n'))
    const findings = await runLens({ cwd, events: [] })
    expect(findings).toEqual([])
  })

  it('high count from a single project + lessons still fails the diversity gate', async () => {
    // 5 CLI signals from project A + 3 lessons mentions = signal_count=8,
    // distinct_project_count = 1 (only A; 'lessons' is excluded). No finding.
    const cwd = makeTmpProject([
      'No knowledge entry for "same-proj-topic".',
      'No knowledge entry for "same-proj-topic".',
      'No knowledge entry for "same-proj-topic".',
    ].join('\n'))
    const events = Array.from({ length: 5 }, () => makeEvent({ payload: {
      topic: 'same-proj-topic', source: 'agent_search', project_id: VALID_HEX_A,
    } }))
    const findings = await runLens({ cwd, events })
    expect(findings).toEqual([])
  })

  it('excludes ledger signals older than 90 days from window', async () => {
    const oldTs = new Date(Date.now() - 100 * 86400 * 1000).toISOString()
    const newTs = new Date().toISOString()
    const findings = await runLens({
      events: [
        makeEvent({ ts: oldTs, payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ ts: newTs, payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ ts: newTs, payload: { topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    expect(findings).toEqual([]) // signal_count = 2, distinct = 2 — below P2 threshold
  })

  it('emits up to 5 sample project IDs but reports the authoritative count', async () => {
    const projects = Array.from({ length: 7 }, (_, i) =>
      'a'.repeat(63) + String.fromCharCode('0'.charCodeAt(0) + i),
    )
    const events = projects.map(p =>
      makeEvent({ payload: { topic: 'foo', source: 'agent_search', project_id: p } }),
    )
    const findings = await runLens({ events })
    expect(findings).toHaveLength(1)
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.distinct_project_count).toBe(7)
    expect(findings[0].evidence.distinct_projects.length).toBeLessThanOrEqual(5)
  })

  it('includes up to 3 distinct example_excerpts', async () => {
    const findings = await runLens({
      events: [
        makeEvent({ payload: {
          topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A,
          agent_excerpt: 'excerpt-1',
        } }),
        makeEvent({ payload: {
          topic: 'foo', source: 'agent_search', project_id: VALID_HEX_B,
          agent_excerpt: 'excerpt-2',
        } }),
        makeEvent({ payload: {
          topic: 'foo', source: 'agent_search', project_id: VALID_HEX_C,
          agent_excerpt: 'excerpt-3',
        } }),
        makeEvent({ payload: {
          topic: 'foo', source: 'agent_search', project_id: VALID_HEX_A,
          agent_excerpt: 'excerpt-4',
        } }),
      ],
    })
    expect(findings).toHaveLength(1)
    if (findings[0].evidence.kind !== 'knowledge_gap') throw new Error('unreachable')
    expect(findings[0].evidence.example_excerpts.length).toBeLessThanOrEqual(3)
    expect(findings[0].evidence.example_excerpts.length).toBeGreaterThan(0)
  })

  it('uses context.cwd to locate tasks/lessons.md', async () => {
    const cwd = makeTmpProject('No knowledge entry for "from-lessons".\n')
    const findings = await runLens({
      cwd,
      events: [
        makeEvent({ payload: { topic: 'from-lessons', source: 'agent_search', project_id: VALID_HEX_A } }),
        makeEvent({ payload: { topic: 'from-lessons', source: 'agent_search', project_id: VALID_HEX_B } }),
      ],
    })
    // 2 real signals from 2 projects + 1 lessons mention → signal_count=3, distinct=2 → P2
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('P2')
  })
})
```

- [ ] **Step 5: Run tests and confirm they fail**

Run: `npx vitest run src/observability/checks/lens-i-knowledge-gaps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement Lens I**

Create `src/observability/checks/lens-i-knowledge-gaps.ts`:

```typescript
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Finding, KnowledgeGapSignalPayload } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { scanLessonsForGaps, normalizeTopic } from './lens-i-lessons-scanner.js'

const lensId = 'I-knowledge-gaps'
const WINDOW_DAYS = 90
const MAX_SAMPLE_PROJECTS = 5
const MAX_EXAMPLE_EXCERPTS = 3

interface TimedSignal {
  payload: KnowledgeGapSignalPayload
  ts: string
}

interface Bucket {
  topic: string                  // normalized slug
  signals: TimedSignal[]
  realProjects: Set<string>      // project_id values excluding 'lessons'
  firstSeen: string
  lastSeen: string
}

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

function dedupeExcerpts(signals: TimedSignal[], cap: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of signals) {
    const ex = s.payload.agent_excerpt
    if (!ex || seen.has(ex)) continue
    seen.add(ex)
    out.push(ex)
    if (out.length >= cap) break
  }
  return out
}

export const lensIKnowledgeGaps: LensFn = async (
  _graph, ledger, _availability, _upstream, _enabled, context,
) => {
  const findings: Finding[] = []
  const auditTs = new Date().toISOString()
  // Use parsed-ms comparison rather than lexical ISO string compare.
  // The validator accepts both UTC ('...Z') and offset ('...+05:00')
  // timestamps, and string-compare on those can misclassify around
  // the cutoff. Date.parse() normalizes to UTC ms.
  const cutoffMs = Date.now() - WINDOW_DAYS * 86400 * 1000

  // 1. Collect signals from the ledger (windowed)
  const ledgerSignals: TimedSignal[] = ledger.events
    .filter(e =>
      e.type === 'knowledge_gap_signal' && Date.parse(e.ts) >= cutoffMs,
    )
    .map(e => ({ payload: e.payload as KnowledgeGapSignalPayload, ts: e.ts }))

  // 2. Collect synthetic signals from tasks/lessons.md (resolved via context.cwd)
  const lessonsPath = context
    ? path.join(context.cwd, 'tasks', 'lessons.md')
    : null
  const lessonsSignals: TimedSignal[] = lessonsPath
    ? scanLessonsForGaps(lessonsPath).map(payload => ({ payload, ts: auditTs }))
    : []

  const allSignals = [...ledgerSignals, ...lessonsSignals]

  // 3. Bucket by normalized topic
  const buckets = new Map<string, Bucket>()
  for (const s of allSignals) {
    const topic = normalizeTopic(s.payload.topic)
    if (!topic) continue
    let bucket = buckets.get(topic)
    if (!bucket) {
      bucket = {
        topic,
        signals: [],
        realProjects: new Set(),
        firstSeen: s.ts,
        lastSeen: s.ts,
      }
      buckets.set(topic, bucket)
    }
    bucket.signals.push(s)
    if (s.payload.project_id !== 'lessons') {
      bucket.realProjects.add(s.payload.project_id)
    }
    // Parse ms for chronological comparison; keep the original ISO
    // string in the bucket for evidence output. This handles offset
    // timestamps consistently (UTC ms ordering is the same regardless
    // of which timezone the ISO string was written in).
    if (Date.parse(s.ts) < Date.parse(bucket.firstSeen)) bucket.firstSeen = s.ts
    if (Date.parse(s.ts) > Date.parse(bucket.lastSeen)) bucket.lastSeen = s.ts
  }

  // 4. Apply finding rules
  for (const bucket of buckets.values()) {
    const signalCount = bucket.signals.length
    const distinctProjectCount = bucket.realProjects.size

    let severity: 'P1' | 'P2' | null = null
    if (signalCount >= 5 && distinctProjectCount >= 3) severity = 'P1'
    else if (signalCount >= 3 && distinctProjectCount >= 2) severity = 'P2'
    if (!severity) continue

    const projectsSample = [...bucket.realProjects].slice(0, MAX_SAMPLE_PROJECTS)

    const titleSummary =
      `${signalCount} signals across ${distinctProjectCount} projects`
    findings.push({
      id: makeFindingId([lensId, bucket.topic]),
      lens_id: lensId,
      severity,
      title:
        `Knowledge base lacks coverage for "${bucket.topic}" — ${titleSummary}`,
      description:
        `Downstream agents have emitted ${signalCount} ` +
        `${signalCount === 1 ? 'signal' : 'signals'} ` +
        `for the topic "${bucket.topic}" across ${distinctProjectCount} distinct ` +
        `${distinctProjectCount === 1 ? 'project' : 'projects'} ` +
        `in the last ${WINDOW_DAYS} days. ` +
        `Consider adding a knowledge entry covering this topic.`,
      source_doc: '',
      evidence: {
        kind: 'knowledge_gap',
        topic: bucket.topic,
        signal_count: signalCount,
        distinct_project_count: distinctProjectCount,
        distinct_projects: projectsSample,
        first_seen: bucket.firstSeen,
        last_seen: bucket.lastSeen,
        example_excerpts: dedupeExcerpts(bucket.signals, MAX_EXAMPLE_EXCERPTS),
      },
      confidence: severity === 'P1' ? 'high' : 'medium',
      first_seen: bucket.firstSeen,
      last_seen: bucket.lastSeen,
      status: 'open',
      fix_hint: {
        kind: 'edit_doc',
        target: `content/knowledge/<category>/${bucket.topic}.md`,
        prompt:
          `Propose a new knowledge entry for "${bucket.topic}". ` +
          `Evidence: ${signalCount} signals from ${distinctProjectCount} ` +
          `projects in the last ${WINDOW_DAYS} days.`,
      },
    })
  }

  return findings
}
```

- [ ] **Step 7: Run lens tests and confirm pass**

Run: `npx vitest run src/observability/checks/lens-i-knowledge-gaps.test.ts`
Expected: PASS — all 13 cases.

- [ ] **Step 8: Register the lens in the registry**

Edit `src/observability/engine/checks/registry.ts`. Add an import near
the top (alongside the other lens imports at lines 2–9):

```typescript
import { lensIKnowledgeGaps } from '../../checks/lens-i-knowledge-gaps.js'
```

Append the manifest to `LENS_REGISTRY` (the literal array starting at
line 25). Find the closing `]` of the array and add the new entry just
before it:

```typescript
  {
    id: 'I-knowledge-gaps', name: 'Knowledge gaps',
    profiles: ['fast', 'full'],
    required: [], optional: [],
  },
```

Add an entry to `LENS_IMPLEMENTATIONS` (the literal object at line 48).
Find the closing `}` and add before it:

```typescript
  'I-knowledge-gaps': lensIKnowledgeGaps,
```

`makeLensImplementations(projectRoot)` at line 61 spreads
`LENS_IMPLEMENTATIONS` and overrides `G-decisions` — it doesn't need
direct modification because the spread picks up the new lens
automatically. The Lens uses `context.cwd` for path resolution rather
than baking the project root at module-load time.

**Update the registry test.** `src/observability/engine/checks/registry.test.ts`
asserts the registry has "all eight lenses" with a literal id-array
comparison. Adding Lens I makes it nine. Edit the test:

```typescript
// In registry.test.ts, update the existing assertion:
it('has all nine lenses', () => {
  const ids = LENS_REGISTRY.map((m) => m.id).sort()
  expect(ids).toEqual([
    'A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack',
    'E-design', 'F-scope', 'G-decisions', 'H-cross-doc', 'I-knowledge-gaps',
  ])
})
```

Run: `npx vitest run src/observability/engine/checks/registry.test.ts`
Expected: PASS.

- [ ] **Step 9: Add Lens I to `SCOPE_DOC_LENSES`**

Edit `src/observability/engine/api.ts` line 67. Change:

```typescript
const SCOPE_DOC_LENSES = new Set(['H-cross-doc'])
```

to:

```typescript
const SCOPE_DOC_LENSES = new Set(['H-cross-doc', 'I-knowledge-gaps'])
```

Lens I now runs under `--scope=docs` and `--scope=all` (which unions
the doc + code sets per `pickEnabledIds` at api.ts:72).

**Do NOT add Lens I to `SCOPE_CODE_LENSES`** at api.ts:68. Lens I is
docs-only — gap detection is fundamentally about *documentation*
coverage, not code. Adding it symmetrically would invoke the lens on
`--scope=code` audits where it has no useful work to do, and it would
slow down the much-larger code-scope audit runs that don't care about
knowledge gaps.

- [ ] **Step 10: Add markdown pretty-render case for the new evidence variant**

Edit `src/observability/renderers/markdown.ts`. Find
`function renderEvidence(ev: Evidence): string` (around line 161). It
currently has only one custom case (`doc_disagreement`). Add the new
case before the generic JSON fallback:

```typescript
function renderEvidence(ev: Evidence): string {
  if (ev.kind === 'doc_disagreement') {
    const docs = `\`${mdEscape(ev.left_doc)}\` ↔ \`${mdEscape(ev.right_doc)}\``
    return `*Documents:* ${docs}\n\n*Conflict:* ${mdEscape(ev.conflict)}`
  }
  if (ev.kind === 'knowledge_gap') {
    const lines = [
      `*Topic:* \`${mdEscape(ev.topic)}\``,
      `*Signals:* ${ev.signal_count} across ${ev.distinct_project_count} projects`,
      `*Window:* ${ev.first_seen} → ${ev.last_seen}`,
    ]
    if (ev.example_excerpts.length > 0) {
      lines.push('*Example excerpts:*')
      for (const ex of ev.example_excerpts) {
        lines.push(`- "${mdEscape(ex)}"`)
      }
    }
    return lines.join('\n')
  }
  return `\`\`\`\`json\n${JSON.stringify(ev, null, 2)}\n\`\`\`\``
}
```

Look for `mdEscape` near the top of the file — it's the markdown-escape
helper this renderer already uses. Reuse it; don't roll a new escaper.

- [ ] **Step 11: Add a renderer test**

Find the existing markdown renderer test
(`src/observability/renderers/markdown.test.ts`) and append a new test
case to the appropriate `describe` block:

```typescript
it('renders knowledge_gap evidence with topic / counts / window / excerpts', () => {
  // Construct a minimal EngineOutput with one Finding carrying knowledge_gap evidence.
  // Reuse existing helpers in the file for EngineOutput construction.
  const finding: Finding = {
    id: 'abc123', lens_id: 'I-knowledge-gaps', severity: 'P2',
    title: 'Knowledge base lacks coverage for "foo"',
    description: 'desc', source_doc: '',
    evidence: {
      kind: 'knowledge_gap',
      topic: 'foo', signal_count: 3, distinct_project_count: 2,
      distinct_projects: ['a'.repeat(64), 'b'.repeat(64)],
      first_seen: '2026-05-20T00:00:00Z', last_seen: '2026-05-26T00:00:00Z',
      example_excerpts: ['first excerpt', 'second excerpt'],
    },
    confidence: 'medium',
    first_seen: '2026-05-20T00:00:00Z', last_seen: '2026-05-26T00:00:00Z',
    status: 'open',
  }
  const out = renderAuditMarkdown({ /* construct minimal EngineOutput; reuse helpers */ })
  expect(out).toContain('*Topic:* `foo`')
  expect(out).toContain('*Signals:* 3 across 2 projects')
  expect(out).toContain('first excerpt')
})
```

Reuse the EngineOutput-construction helpers already in
`markdown.test.ts`. If `renderAuditMarkdown` isn't directly exported,
test through whatever export the file already uses.

- [ ] **Step 12: Run the full audit-engine test suite**

Run: `npx vitest run src/observability/`
Expected: PASS — all pre-existing observability tests plus the three
new test files we added.

If a registration test fails ("Lens I-knowledge-gaps not found" or
similar), double-check the three registration sites:

```bash
grep -n "I-knowledge-gaps" \
  src/observability/engine/checks/registry.ts \
  src/observability/engine/api.ts
```

You should see four hits: registry array entry, implementations entry,
import, and the SCOPE_DOC_LENSES addition.

- [ ] **Step 13: Run the full type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/observability/engine/types.ts \
        src/observability/checks/lens-i-knowledge-gaps.ts \
        src/observability/checks/lens-i-knowledge-gaps.test.ts \
        src/observability/checks/lens-i-lessons-scanner.ts \
        src/observability/engine/checks/registry.ts \
        src/observability/engine/api.ts \
        src/observability/renderers/markdown.ts \
        src/observability/renderers/markdown.test.ts
git commit -m "feat(observability): add Lens I (knowledge gaps) aggregator + Evidence variant

New audit lens I-knowledge-gaps aggregates knowledge_gap_signal events
from the ledger (90-day window) plus synthetic signals from the
lessons.md scanner. Diversity-gate computation deletes 'lessons' from
the project set before counting, so a single project's CLI signals
plus its own lessons mentions don't manufacture a P2. P1 at ≥5 signals
× ≥3 projects; P2 at ≥3 × ≥2. New knowledge_gap Evidence variant
carries authoritative distinct_project_count alongside a sample array
(truncated to 5). Registered in LENS_REGISTRY, LENS_IMPLEMENTATIONS,
and SCOPE_DOC_LENSES. Markdown renderer pretty-renders the new
variant; terminal/dashboard/mmr-findings inherit current no-evidence
behavior with no regression.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — End-to-End Validation + Operations Doc

Manual smoke-run that proves the loop fires: emit 3 ledger events from
2 distinct project_ids targeting the same topic, run `scaffold observe
audit --scope=docs`, confirm Lens I surfaces a P2 finding. Document the
procedure for future operators.

**Files:**
- Modify: `docs/knowledge-freshness/operations.md` (append a new section)
- No code changes (pure validation + doc)

- [ ] **Step 1: Build + ensure a clean working tree**

```bash
npm run build
git status
```

Expected: build succeeds; working tree shows only any uncommitted T4
edits resolved.

- [ ] **Step 2: Set up a temp project to act as "downstream"**

First, capture the scaffold worktree path (the directory containing
`package.json` and the `dist/` build output) so the rest of T5 stays
portable:

```bash
# Run this from the scaffold worktree before cd-ing into the temp tree:
SCAFFOLD_WORKTREE="$(git rev-parse --show-toplevel)"
SCAFFOLD_BIN="$SCAFFOLD_WORKTREE/dist/index.js"
[ -f "$SCAFFOLD_BIN" ] || (cd "$SCAFFOLD_WORKTREE" && npm run build)
```

Then build the temp downstream project:

```bash
TMPDIR_E2E=$(mktemp -d)
cd "$TMPDIR_E2E"
git init -q
git remote add origin https://example.org/test-e2e
mkdir -p tasks
echo "No knowledge entry for \"agent-eval-harnesses\"." > tasks/lessons.md
mkdir -p .scaffold
```

- [ ] **Step 3: Emit 3 signals from 2 distinct project_ids**

```bash
PROJECT_A=$(printf 'https://example.org/project-a' | shasum -a 256 | awk '{print $1}')
PROJECT_B=$(printf 'https://example.org/project-b' | shasum -a 256 | awk '{print $1}')

node "$SCAFFOLD_BIN" observe event knowledge_gap_signal \
  --branch=main --topic=agent-eval-harnesses --source=agent_search \
  --project-id="$PROJECT_A" --step-name=tech-stack \
  --agent-excerpt="needed eval harness guidance"

node "$SCAFFOLD_BIN" observe event knowledge_gap_signal \
  --branch=main --topic=agent-eval-harnesses --source=agent_search \
  --project-id="$PROJECT_A" --step-name=create-evals \
  --agent-excerpt="still nothing on eval harnesses"

node "$SCAFFOLD_BIN" observe event knowledge_gap_signal \
  --branch=main --topic=agent-eval-harnesses --source=agent_search \
  --project-id="$PROJECT_B" --step-name=tech-stack \
  --agent-excerpt="another project needs harness docs"
```

Verify the ledger has three entries:

```bash
wc -l .scaffold/activity.jsonl
```

Expected: `3`.

- [ ] **Step 4: Run the audit**

```bash
node "$SCAFFOLD_BIN" observe audit --scope=docs --json | \
  jq '.findings[] | select(.lens_id == "I-knowledge-gaps")'
```

Expected: a single finding object printed with:
- `severity: "P2"`
- `lens_id: "I-knowledge-gaps"`
- `evidence.topic: "agent-eval-harnesses"`
- `evidence.signal_count: 4` (3 ledger + 1 lessons)
- `evidence.distinct_project_count: 2` (project_a, project_b)

If `evidence.signal_count` shows 3 instead of 4, the lessons scanner
didn't fire — verify `tasks/lessons.md` is at
`$TMPDIR_E2E/tasks/lessons.md` and the audit was run from inside
`$TMPDIR_E2E`. The lens uses `context.cwd` which `runAudit` threads
from `primaryRoot`.

- [ ] **Step 5: Verify the markdown sidecar pretty-renders the evidence**

`observe audit` prints a compact terminal summary to stdout, but
**terminal output does not include evidence details** (terminal/dashboard
renderers omit evidence for every variant — see spec §2.6). The
pretty-render lives in the markdown sidecar at `docs/audits/<id>.md`,
which the audit writes alongside stdout.

```bash
node "$SCAFFOLD_BIN" observe audit --scope=docs
# Find the just-written audit markdown sidecar in the temp project:
LATEST_AUDIT=$(ls -t docs/audits/*.md 2>/dev/null | head -1)
echo "audit markdown at: $LATEST_AUDIT"
cat "$LATEST_AUDIT"
```

Expected: the markdown report contains the pretty-rendered evidence
block from Lens I:

```
*Topic:* `agent-eval-harnesses`
*Signals:* 4 across 2 projects
*Window:* 2026-… → 2026-…
*Example excerpts:*
- "needed eval harness guidance"
- "still nothing on eval harnesses"
- "another project needs harness docs"
```

If the audit doesn't write to `docs/audits/` in the temp project (the
audit subsystem requires the project to have a recognizable scaffold
structure), grep stdout for the finding ID instead:

```bash
node "$SCAFFOLD_BIN" observe audit --scope=docs --json | \
  jq -r '.findings[] | select(.lens_id=="I-knowledge-gaps") | .id'
```

The terminal renderer will list the finding (title + severity) but not
its evidence — that's expected and not a regression.

- [ ] **Step 6: Negative test — same project, no diversity, should NOT fire**

```bash
TMPDIR_NEG=$(mktemp -d)
cd "$TMPDIR_NEG"
git init -q
mkdir -p .scaffold

# 3 signals, same project_id
for i in 1 2 3; do
  node "$SCAFFOLD_BIN" observe event knowledge_gap_signal \
    --branch=main --topic=lone-project-topic --source=agent_search \
    --project-id="$PROJECT_A" --step-name=tech-stack
done

node "$SCAFFOLD_BIN" observe audit --scope=docs --json | \
  jq '.findings[] | select(.lens_id == "I-knowledge-gaps")'
```

Expected: empty output (`null` or no objects). Diversity gate prevents
a single project from manufacturing a finding.

- [ ] **Step 7: Negative test — lessons-only should NOT fire**

```bash
TMPDIR_LESSONS=$(mktemp -d)
cd "$TMPDIR_LESSONS"
git init -q
mkdir -p tasks .scaffold
cat > tasks/lessons.md << 'EOF'
## Three lessons all flagging the same topic

<!-- gap-topic: lessons-only-topic -->
<!-- gap-topic: lessons-only-topic -->
<!-- gap-topic: lessons-only-topic -->
EOF

node "$SCAFFOLD_BIN" observe audit --scope=docs --json | \
  jq '.findings[] | select(.lens_id == "I-knowledge-gaps")'
```

Expected: empty output. Lessons-only never crosses the diversity gate
because `'lessons'` is excluded from `distinct_project_count`.

- [ ] **Step 8: Cleanup**

```bash
cd "$SCAFFOLD_WORKTREE"
rm -rf "$TMPDIR_E2E" "$TMPDIR_NEG" "$TMPDIR_LESSONS"
unset TMPDIR_E2E TMPDIR_NEG TMPDIR_LESSONS SCAFFOLD_BIN SCAFFOLD_WORKTREE PROJECT_A PROJECT_B
```

- [ ] **Step 9: Document the procedure in operations.md**

Edit `docs/knowledge-freshness/operations.md`. Append a new section at
the end of the file:

```markdown
## Phase 3: Gap Detection

The knowledge-freshness system surfaces topics agents need but the
knowledge base doesn't yet cover. Two signal sources feed Lens I:

1. **Agent-search signals** — pipeline meta-prompts include a tail
   instruction (auto-injected at assembly time) telling the executing
   agent to emit a `knowledge_gap_signal` event when they search the
   injected knowledge base and find nothing. The agent runs the
   command embedded in the tail; the event lands in the worktree's
   `.scaffold/activity.jsonl` ledger.
2. **Lessons scanner** — Lens I reads `tasks/lessons.md` inline at
   audit time. Two extraction passes:
   - Explicit markers: `<!-- gap-topic: kebab-case-slug -->`
   - Heuristic phrases: "would have helped to have a guide on X",
     "no knowledge entry for X", "missing knowledge: X"
   Code-fenced blocks are skipped.

Synthetic lessons signals are tagged with `project_id='lessons'`, which
is excluded from the diversity gate's `distinct_project_count`. This
means lessons mentions corroborate real signals but cannot
independently manufacture a gap finding.

### Suppression

Set `SCAFFOLD_GAP_SIGNAL_QUIET=1` to suppress the tail in tests, CI,
or local runs where you don't want the noise.

### Severity thresholds

| Severity | Threshold |
|---|---|
| P2 | ≥3 signals × ≥2 distinct real projects |
| P1 | ≥5 signals × ≥3 distinct real projects |

P1 takes precedence; one finding per topic at the highest applicable
severity.

### Manual validation procedure

To verify the loop end-to-end in a fresh worktree:

```bash
TMPDIR_E2E=$(mktemp -d) && cd "$TMPDIR_E2E"
git init -q && git remote add origin https://example.org/test-e2e
mkdir -p tasks && echo 'No knowledge entry for "agent-eval-harnesses".' > tasks/lessons.md
PROJECT_A=$(printf 'https://example.org/project-a' | shasum -a 256 | awk '{print $1}')
PROJECT_B=$(printf 'https://example.org/project-b' | shasum -a 256 | awk '{print $1}')
for proj in "$PROJECT_A" "$PROJECT_A" "$PROJECT_B"; do
  scaffold observe event knowledge_gap_signal \
    --branch=main --topic=agent-eval-harnesses --source=agent_search \
    --project-id="$proj" --step-name=tech-stack \
    --agent-excerpt="manual e2e test"
done
scaffold observe audit --scope=docs --json | jq '.findings[] | select(.lens_id=="I-knowledge-gaps")'
```

Expected: one finding with `severity=P2`, `signal_count=4` (3 ledger +
1 lessons), `distinct_project_count=2`.

### Where to find the finding

`scaffold observe audit` (with no scope flag, or `--scope=all`) writes
the audit sidecar to `docs/audits/<id>.{md,json}`. The terminal output
also surfaces Lens I findings inline. To run just Lens I, scope to
`--scope=docs` (it lives in `SCOPE_DOC_LENSES` alongside lens H).

### Adding a knowledge entry from a Lens I finding

The finding's `fix_hint.target` is `content/knowledge/<category>/<topic>.md`
with `<category>` as a literal placeholder — categories are a human
judgment. The `fix_hint.prompt` is a summary suitable for handing to
a writing-knowledge agent. After authoring the entry, follow the
standard knowledge-freshness workflow: add freshness frontmatter
(`volatility`, `sources`), commit, and the next audit run will reflect
the gap is closed (no signal accumulation if no more agents look for
the topic without finding it).
```

- [ ] **Step 10: Commit the operations doc**

```bash
git add docs/knowledge-freshness/operations.md
git commit -m "docs(knowledge-freshness): operations guide for Phase 3 gap detection

Documents the two signal sources (agent-search + lessons scanner), the
SCAFFOLD_GAP_SIGNAL_QUIET suppression knob, P2/P1 thresholds, and the
manual end-to-end validation procedure used to verify Lens I in
freshly-spawned projects.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 11: Final sanity check before PR**

Run the full check suite:

```bash
make check-all
```

Expected: PASS — all bash quality gates, TypeScript build + tests,
MMR review tooling check, knowledge frontmatter validator.

If anything fails, fix it before opening the PR. The most likely
failures are:
- Type-check errors from a missed import in `lens-i-knowledge-gaps.ts`
  or `lens-i-lessons-scanner.ts` after the T3→T4 type unification.
- Test failures from forgetting to set `SCAFFOLD_GAP_SIGNAL_QUIET=1`
  in an existing test that compares full assembled output.
- Markdown renderer test failures because the new evidence variant's
  pretty-render emits content the test snapshot didn't anticipate.

- [ ] **Step 12: Open the PR**

```bash
git push -u origin feat/knowledge-freshness-phase-3
gh pr create --base main \
  --title "feat(knowledge-freshness): Phase 3 gap detection (Lens I + tail injection + lessons scanner)" \
  --body "$(cat <<'PRBODY'
## Summary

Implements Phase 3 of the knowledge-freshness system: detect topics that
downstream agents need but the knowledge base doesn't yet cover.

- New `knowledge_gap_signal` observability event type
- Assembly-time tail injection at both knowledge emission paths
  (runtime + claude-code adapter)
- Pure `tasks/lessons.md` scanner with fence-aware parsing
- New audit Lens `I-knowledge-gaps` aggregator with `delete('lessons')`
  diversity gate
- New `knowledge_gap` Evidence variant with authoritative
  `distinct_project_count` separate from truncated sample array
- Three-site registration: LENS_REGISTRY, LENS_IMPLEMENTATIONS,
  SCOPE_DOC_LENSES
- Markdown renderer pretty-render case
- Operations doc

## Spec & plan

- Spec: docs/superpowers/specs/2026-05-26-knowledge-freshness-gap-detection-design.md
- Plan: docs/superpowers/plans/2026-05-26-knowledge-freshness-gap-detection.md

The spec went through 6 rounds of MMR + grok review before this
implementation began.

## Test plan

- [x] T1: unit tests for the validator (10 cases)
- [x] T2: unit tests for the helper + integration tests for both call sites
- [x] T3: unit tests for the scanner (13 cases, including fence-aware skip)
- [x] T4: unit tests for Lens I (13 cases) + markdown renderer test
- [x] T5: end-to-end manual smoke run produced a P2 finding from 3 signals
      across 2 project_ids + 1 lessons mention
- [x] make check-all passes
PRBODY
)"
```

- [ ] **Step 13: Run review-pr per the project's MMR + grok loop**

After the PR is open, follow the project's mandatory code-review
discipline (see CLAUDE.md "Mandatory Code Review" section). Run
`scaffold run review-pr` plus the grok 4th-channel review as documented
in the prompt that drove this Phase 3 work. Address all findings per
the per-PR round budget (rounds 1–5: fix every P2+; rounds 6+: P0/P1
only, defer P2/P3 to
`docs/superpowers/deferred-findings/feat+knowledge-freshness-phase-3.md`).

- [ ] **Step 14: Final landing — sync, verify, push**

After the review loop stabilizes (MMR verdict `pass` or
`degraded-pass`, no P0/P1 findings remaining, grok prose clean), run
the final landing sequence to make sure the branch is current and any
review-fix commits are pushed:

```bash
make check-all                    # final guard: all gates green
git fetch origin main             # see what's on origin/main without merging yet
# If origin/main has new commits behind the PR head, merge it in
# (DO NOT rebase a published branch — that requires a force-push,
# which is forbidden per CLAUDE.md "Git Safety Protocol").
git merge --no-edit origin/main || {
  # If the merge produced conflicts, resolve them, then:
  #   git add <resolved-files>
  #   git commit --no-edit
  # Re-run check-all after resolution.
  echo "Merge conflict — resolve, commit, then re-run from make check-all" >&2
  exit 1
}
make check-all                    # re-run after merge
git push                          # plain push (no -f); commits are append-only
git status                        # verify "Your branch is up to date with 'origin/...'"
gh pr checks                      # confirm CI on the open PR is green
```

The reason for **merge instead of rebase**: rebasing a branch that's
already pushed to origin rewrites those commits' SHAs. A plain
`git push` would then be rejected because the remote has the old SHAs.
Force-push (`--force` or `--force-with-lease`) would resolve it but is
prohibited by CLAUDE.md's "Never force-push" rule unless the user
explicitly authorizes it. Merging origin/main into the PR branch keeps
history append-only and the push succeeds.

If origin/main is already an ancestor of the PR head (no new commits),
the `git merge --no-edit origin/main` is a no-op (fast-forward
unnecessary; merge prints "Already up to date").

Only mark the PR ready for human merge once `gh pr checks` shows all
required CI green and the review loop has hit stop conditions.

---

## Self-Review

**Spec coverage** (cross-reference against
`docs/superpowers/specs/2026-05-26-knowledge-freshness-gap-detection-design.md`):

| Spec section | Implementing task |
|---|---|
| §1 Event Type & Payload | T1 |
| §2.1 Lens location and registration (3 sites) | T4 Step 8, 9 |
| §2.2 Inputs (ledger + lessons inline) | T4 Step 6 (lens body) |
| §2.3 Topic normalization | T3 Step 4 (normalizeTopic export) + T4 (imported and used) |
| §2.4 Aggregation + diversity gate | T4 Step 6 |
| §2.5 Finding rules (P2/P1) | T4 Step 6 |
| §2.6 Evidence variant + renderer impact | T4 Step 2, 10 |
| §2.7 Fix hint | T4 Step 6 (in lens body) |
| §2.8 Degradation | T4 Step 6 (empty ledger returns [] silently) |
| §2.9 Lens tests | T4 Step 4 |
| §3.1 Assembly-time injection (both paths, Option A) | T2 Step 6, 9 |
| §3.2 Tail content | T2 Step 4 (helper) |
| §3.3 Token cost | (no implementation; documentation) |
| §3.4 Helper tests | T2 Step 2 |
| §4.1 Scanner location and shape | T3 Step 4 |
| §4.2 Input resolution (lens owns path) | T4 Step 6 |
| §4.3 Topic extraction (fence-aware + regexes) | T3 Step 4 |
| §4.4 Output shape | T3 Step 4 |
| §4.5 Diversity-gate semantics | T4 Step 6 (Set + delete) |
| §4.6 Synthetic signals exempt from window | T4 Step 6 (lessons signals get auditTs) |
| §4.7 Scanner tests | T3 Step 2 |
| §5 Risks & Mitigations | (documentation; no code) |
| §7 Resolved Decisions | (locked; implementation follows) |
| §"Phase 3 Task Breakdown" T1–T5 | This plan's task split |

**Type consistency:**
- `KnowledgeGapSignalPayload` defined in T1 Step 4 (types.ts), used in
  T3 Step 3 (scanner returns it), T4 Step 6 (lens consumes it).
- `LensFn` imported from `runner.ts` (canonical 6-param version) in
  T4 Step 6.
- `Evidence` discriminated union extended in T4 Step 2 with the
  `knowledge_gap` variant; consumed in T4 Step 6 (lens emits it) and
  T4 Step 10 (markdown renderer).
- `TimedSignal` is an internal type in `lens-i-knowledge-gaps.ts`; not
  exported.

**Placeholder scan:** No "TBD", "implement later", or "similar to Task
N" placeholders. Every step contains actual code or commands.

---

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-05-26-knowledge-freshness-gap-detection.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review
between tasks. T1 and T3 dispatch in parallel (no dependencies). T2
runs after T1. T4 runs after T1+T3. T5 runs after T4.

**2. Inline Execution** — Execute tasks in this session using
`executing-plans`, batch with checkpoints.

Which approach?
