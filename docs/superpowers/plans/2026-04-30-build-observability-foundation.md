# Build Observability — Foundation Implementation Plan (Plan 1 of N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest end-to-end observability foundation: `scaffold observe event` writes ledger events from agent meta-prompts, `scaffold observe progress` reads them and shows a snapshot covering active agents, in-flight tasks, completed work, and recent decisions — fused across multiple worktrees via the harvest mechanism. No audit / no findings / no doc-graph yet (those come in Plans 2 and 3).

**Architecture:** A new `src/observability/` tree houses an event ledger (per-worktree append-only `.scaffold/activity.jsonl` with a flock-coordinated writer, harvested to a central archive in the primary repo), eight read-only source adapters (git, gh, pipeline_docs, tests, state, beads, mmr, audit_history), a synthesizer that composes adapter output + ledger events into a unified `EngineOutput` JSON, and a terminal renderer. A new top-level `scaffold observe` CLI command exposes the ledger writer (`event`) and the snapshot reader (`progress`).

**Tech Stack:** TypeScript (vitest, zod for runtime schema validation, `proper-lockfile` for cross-platform advisory locking, `ulid` for time-sortable IDs, `uuid` for worktree identity, `js-yaml` for `.scaffold/observability.yaml`), bats-core for end-to-end CLI tests, Markdown meta-prompt updates for build commands.

**Spec:** [`docs/superpowers/specs/2026-04-30-build-observability-design.md`](../specs/2026-04-30-build-observability-design.md)

**Subsequent plans (out of scope here):** Plan 2 adds the doc-graph, the checks framework, lenses A/B/H, the audit subcommand, and the `ack` flow. Plans 3–8 add the remaining lenses, additional renderers, replay, stall detection, phase-boundary triggers, the MMR channel, and the fix flow. See the spec for the full picture.

---

## Pre-flight: Worktree (recommended)

If you haven't already:

```bash
scripts/setup-agent-worktree.sh observability-foundation
cd ../scaffold-observability-foundation
```

Working on `main` directly is fine too — every task is small and independently committed.

Add the runtime dependencies once at the start (subsequent tasks assume they exist):

```bash
npm install --save proper-lockfile ulid uuid js-yaml
npm install --save-dev @types/uuid @types/js-yaml
```

Commit the dependency add as a separate change before starting Task 1:

```bash
git add package.json package-lock.json
git commit -m "deps: add proper-lockfile, ulid, uuid, js-yaml for observability foundation"
```

---

## File Structure

New files this plan creates (kept as a reference; each task lists its own paths):

```
src/observability/
  engine/
    types.ts                      data-model types from spec Section 2
    types.test.ts                 type-level smoke tests
    identity.ts                   read/write .scaffold/identity.json
    identity.test.ts
    event-schemas.ts              EventType, BaseEvent, payload allowlists
    event-schemas.test.ts
    redact.ts                     write-time + render-time redaction
    redact.test.ts
    ledger-writer.ts              flock-coordinated append, 4 KiB cap
    ledger-writer.test.ts
    harvester.ts                  worktree → central archive
    harvester.test.ts
    synthesizer.ts                composes EngineOutput from adapters + ledger
    synthesizer.test.ts
    api.ts                        runProgress() entry point
    api.test.ts
  adapters/
    types.ts                      AdapterStatus, base interface
    git.ts                        git.test.ts
    gh.ts                         gh.test.ts
    pipeline-docs.ts              pipeline-docs.test.ts
    tests.ts                      tests.test.ts
    state.ts                      state.test.ts
    beads.ts                      beads.test.ts
    mmr.ts                        mmr.test.ts
    audit-history.ts              audit-history.test.ts
  renderers/
    _lib.ts                       severity tokens, time formatting
    terminal.ts                   snapshot rendering for progress
    terminal.test.ts
src/cli/commands/
  observe.ts                      CLI entry: progress, event subcommands
  observe.test.ts
src/cli/index.ts                  (modify) register observe

scripts/setup-agent-worktree.sh   (modify) write .scaffold/identity.json

tests/observability/
  fixtures/
    secret-corpus.txt
    projects/clean-monorepo/      minimal project fixture
    projects/multi-worktree-active/
  observe.bats                    end-to-end CLI tests
```

---

## Task 1: Add data-model types

**Files:**
- Create: `src/observability/engine/types.ts`
- Create: `src/observability/engine/types.test.ts`

- [ ] **Step 1: Write the failing type-level test**

Create `src/observability/engine/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type {
  Verdict,
  EngineOutput,
  Finding,
  Snapshot,
  ReplayEvent,
  AvailabilityMap,
  AdapterStatus,
  FindingsSummary,
  Event,
  EventType,
  ActiveAgent,
} from './types'

describe('engine types', () => {
  it('Verdict enum has exactly three values', () => {
    expectTypeOf<Verdict>().toEqualTypeOf<'pass' | 'degraded-pass' | 'blocked'>()
  })

  it('EventType enum has exactly eight values', () => {
    expectTypeOf<EventType>().toEqualTypeOf<
      | 'task_claimed'
      | 'task_completed'
      | 'decision_recorded'
      | 'blocker_hit'
      | 'blocker_resolved'
      | 'pr_opened'
      | 'progress_heartbeat'
      | 'finding_acknowledged'
    >()
  })

  it('FindingsSummary.by_severity_status has all four severities', () => {
    expectTypeOf<FindingsSummary['by_severity_status']>().toMatchTypeOf<{
      P0: { open: number; acknowledged: number; skipped: number }
      P1: { open: number; acknowledged: number; skipped: number }
      P2: { open: number; acknowledged: number; skipped: number }
      P3: { open: number; acknowledged: number; skipped: number }
    }>()
  })

  it('EngineOutput has schema_version "1.0"', () => {
    expectTypeOf<EngineOutput['schema_version']>().toEqualTypeOf<'1.0'>()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/types.test.ts
```

Expected: FAIL with `Cannot find module './types'` or similar.

- [ ] **Step 3: Create the types file with the full data model**

Create `src/observability/engine/types.ts`:

```typescript
// Severity rank: P0=0 (most severe) ... P3=3 (least severe).
export type Severity = 'P0' | 'P1' | 'P2' | 'P3'
export const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
export function severityRank(s: Severity): number { return SEVERITY_RANK[s] }

export type Verdict = 'pass' | 'degraded-pass' | 'blocked'

// ─── Events ─────────────────────────────────────────────────────────────
export type EventType =
  | 'task_claimed'
  | 'task_completed'
  | 'decision_recorded'
  | 'blocker_hit'
  | 'blocker_resolved'
  | 'pr_opened'
  | 'progress_heartbeat'
  | 'finding_acknowledged'

export interface BaseEvent {
  event_id: string         // ULID — globally unique, time-sortable
  worktree_id: string      // UUID from .scaffold/identity.json
  actor_label: string
  branch: string
  task_id: string | null
  type: EventType
  ts: string               // ISO 8601 UTC
}

export interface TaskClaimedPayload { task_title: string; story_id?: string; wave?: string; unplanned?: boolean }
export interface TaskCompletedPayload { outcome: 'pr_submitted' | 'dropped' | 'superseded'; pr_number?: number; commit_sha?: string }
export interface DecisionRecordedPayload { key: string; summary: string; affects: string[]; links?: string[] }
export interface BlockerHitPayload { kind: 'dependency' | 'ambiguity' | 'external' | 'environment'; summary: string }
export interface BlockerResolvedPayload { summary: string; references: string[] }
export interface PrOpenedPayload { pr_number: number }
export interface HeartbeatPayload { note: string }
export interface FindingAckPayload { finding_id: string; status: 'acknowledged' | 'open'; note?: string }

export type Event =
  | (BaseEvent & { type: 'task_claimed';        payload: TaskClaimedPayload })
  | (BaseEvent & { type: 'task_completed';      payload: TaskCompletedPayload })
  | (BaseEvent & { type: 'decision_recorded';   payload: DecisionRecordedPayload })
  | (BaseEvent & { type: 'blocker_hit';         payload: BlockerHitPayload })
  | (BaseEvent & { type: 'blocker_resolved';    payload: BlockerResolvedPayload })
  | (BaseEvent & { type: 'pr_opened';           payload: PrOpenedPayload })
  | (BaseEvent & { type: 'progress_heartbeat';  payload: HeartbeatPayload })
  | (BaseEvent & { type: 'finding_acknowledged'; task_id: null; payload: FindingAckPayload })

// ─── Adapters & availability ────────────────────────────────────────────
export type AdapterId =
  | 'git' | 'gh' | 'pipeline_docs' | 'tests' | 'state' | 'beads' | 'mmr' | 'audit_history'

export interface AdapterStatus {
  status: 'available' | 'degraded' | 'unavailable'
  reason?: string
  evidence_paths?: string[]
}

export interface AvailabilityMap {
  git: AdapterStatus
  gh: AdapterStatus
  pipeline_docs: AdapterStatus
  tests: AdapterStatus
  state: AdapterStatus
  beads: AdapterStatus
  mmr: AdapterStatus
  audit_history: AdapterStatus
  ledger: { events_read: number; malformed_lines: number; sources: { worktree_id: string; events: number; harvested_at?: string }[] }
}

// ─── Findings (used by audit; types now so Plan 2 doesn't change EngineOutput shape) ─
export interface FixHint {
  kind: 'edit_doc' | 'add_test' | 'rename_token' | 'record_decision' | 'open_task'
  target: string
  patch?: string
  prompt?: string
}

export type Evidence =
  | { kind: 'missing_node'; graph_query: string; expected: string }
  | { kind: 'orphan_node'; graph_query: string; node_id: string }
  | { kind: 'rule_violation'; rule_id: string; file: string; lines?: [number, number] }
  | { kind: 'ac_not_covered'; story_id: string; ac_id: string; missing_tests: string[] }
  | { kind: 'doc_disagreement'; left_doc: string; right_doc: string; conflict: string }
  | { kind: 'lens_skipped'; reason: 'adapter_unavailable' | 'insufficient_data'; needed: string[] }

export interface Finding {
  id: string
  lens_id: string
  severity: Severity
  title: string
  description: string
  source_doc: string
  evidence: Evidence
  fix_hint?: FixHint
  confidence: 'high' | 'medium' | 'low'
  first_seen: string
  last_seen: string
  status: 'open' | 'acknowledged' | 'skipped'
  ack_note?: string
}

export interface FindingsSummary {
  total: number
  by_severity: Record<Severity, number>
  by_severity_status: Record<Severity, { open: number; acknowledged: number; skipped: number }>
  blocking: number
  acknowledged: number
  skipped_lenses: number
}

// ─── Snapshot ───────────────────────────────────────────────────────────
export interface ActiveAgent {
  worktree_id: string
  actor_label: string
  branch: string
  current_task: { id: string | null; title: string; claimed_at: string } | null
  open_pr: { number: number; url: string; opened_at: string } | null
}
export interface TaskCompletion {
  task_id: string | null
  task_title: string
  outcome: 'pr_submitted' | 'merged' | 'dropped' | 'superseded'
  pr_number?: number
  merged_at?: string
  by: string
}
export interface TaskInFlight {
  task_id: string
  task_title: string
  story_id?: string
  by: string
  claimed_at: string
  age_hours: number
  branch: string
  pr_number?: number
}
export interface BlockedTask {
  task_id: string
  task_title: string
  blocker_kind: BlockerHitPayload['kind']
  reason: string
  blocked_at: string
  age_hours: number
}
export interface UpcomingTask {
  task_id: string
  task_title: string
  story_id?: string
  ready: boolean
  blocked_by: string[]
  wave?: string
}
export interface DecisionSummary {
  decision_id: string
  key: string
  summary: string
  recorded_at: string
  affects: string[]
}
export interface StoryCoverageRow {
  story_id: string
  story_title: string
  plan_tasks: { id: string; status: 'todo' | 'in_flight' | 'done' }[]
  playbook_tasks: { id: string; status: 'todo' | 'in_flight' | 'done' }[]
  acs_total: number
  acs_with_tests: number
  acs_test_passing: number
}
export interface Snapshot {
  current_phase: string
  active_agents: ActiveAgent[]
  completed_in_window: TaskCompletion[]
  in_flight: TaskInFlight[]
  blocked: BlockedTask[]
  upcoming: UpcomingTask[]
  recent_decisions: DecisionSummary[]
  story_coverage: StoryCoverageRow[]
}

// ─── Replay ─────────────────────────────────────────────────────────────
export interface ReplayEvent {
  sort_id: string
  correlation_id: string | null
  ts: string
  source: 'ledger' | 'git' | 'gh' | 'tests' | 'mmr' | 'state'
  kind: string
  actor_label?: string
  task_id?: string
  summary: string
  link?: string
}
export interface ReplayTimeline {
  window: { from: string; to: string }
  events: ReplayEvent[]
}

// ─── Stall detection ────────────────────────────────────────────────────
export interface NeedsAttentionItem {
  signal: 'task_stale' | 'pr_stale' | 'pr_review_stale' | 'blocker_unaddressed' | 'audit_findings_unresolved' | 'lens_skipped_repeatedly'
  ref: { kind: 'task' | 'pr' | 'finding' | 'lens'; id: string }
  age_hours: number
  threshold_hours: number
  summary: string
}

// ─── Graph stats (populated by Plan 2 once doc-graph exists) ────────────
export interface GraphStats {
  nodes_by_kind: Record<string, number>
  edges_by_kind: Record<string, number>
  orphans_by_kind: Record<string, number>
  unsanctioned_uses: number
  ad_hoc_token_uses: number
}

// ─── Engine output (the unified shape all renderers consume) ────────────
export interface EngineOutput {
  schema_version: '1.0'
  invocation: {
    command: 'progress' | 'audit'
    args: Record<string, unknown>
    started_at: string
    completed_at: string
    scaffold_version: string
  }
  availability: AvailabilityMap
  snapshot: Snapshot | null
  replay: ReplayTimeline | null
  findings: Finding[]
  needs_attention: NeedsAttentionItem[]
  graph_stats: GraphStats
  fix_threshold: Severity
  verdict: Verdict
  summary: FindingsSummary
}

// ─── Identity file ──────────────────────────────────────────────────────
export interface WorktreeIdentity {
  worktree_id: string
  worktree_label: string
  created_at: string
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/types.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/types.ts src/observability/engine/types.test.ts
git commit -m "observability: add engine data-model types

All types from spec Section 2: Event union, AvailabilityMap, Snapshot,
Finding, FindingsSummary, ReplayEvent, EngineOutput. Includes types not
yet used (Finding, GraphStats) so subsequent plans don't churn the shape."
```

---

## Task 2: Worktree identity (`.scaffold/identity.json`)

**Files:**
- Create: `src/observability/engine/identity.ts`
- Create: `src/observability/engine/identity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/identity.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureIdentity, readIdentity } from './identity'

describe('identity', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-id-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('creates .scaffold/identity.json with a UUID and the given label when missing', () => {
    const id = ensureIdentity(dir, 'agent-alice')
    expect(id.worktree_label).toBe('agent-alice')
    expect(id.worktree_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(existsSync(join(dir, '.scaffold/identity.json'))).toBe(true)
    const written = JSON.parse(readFileSync(join(dir, '.scaffold/identity.json'), 'utf8'))
    expect(written.worktree_id).toBe(id.worktree_id)
    expect(written.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('does not overwrite an existing identity file', () => {
    const first = ensureIdentity(dir, 'agent-alice')
    const second = ensureIdentity(dir, 'something-else')
    expect(second.worktree_id).toBe(first.worktree_id)
    expect(second.worktree_label).toBe(first.worktree_label)
  })

  it('readIdentity returns null when the file does not exist', () => {
    expect(readIdentity(dir)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/identity.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `identity.ts`**

Create `src/observability/engine/identity.ts`:

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import type { WorktreeIdentity } from './types'

export function identityPath(worktreeRoot: string): string {
  return join(worktreeRoot, '.scaffold', 'identity.json')
}

export function readIdentity(worktreeRoot: string): WorktreeIdentity | null {
  const path = identityPath(worktreeRoot)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as WorktreeIdentity
  } catch {
    return null
  }
}

export function ensureIdentity(worktreeRoot: string, label: string): WorktreeIdentity {
  const existing = readIdentity(worktreeRoot)
  if (existing) return existing
  const id: WorktreeIdentity = {
    worktree_id: uuidv4(),
    worktree_label: label,
    created_at: new Date().toISOString(),
  }
  mkdirSync(join(worktreeRoot, '.scaffold'), { recursive: true })
  writeFileSync(identityPath(worktreeRoot), JSON.stringify(id, null, 2) + '\n', { mode: 0o644 })
  return id
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/identity.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/identity.ts src/observability/engine/identity.test.ts
git commit -m "observability: add worktree identity (UUID in .scaffold/identity.json)"
```

---

## Task 3: Event-schema allowlist + payload validation

**Files:**
- Create: `src/observability/engine/event-schemas.ts`
- Create: `src/observability/engine/event-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/event-schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateEvent, EVENT_PAYLOAD_KEYS } from './event-schemas'

describe('event-schemas', () => {
  const base = {
    event_id: '01HF5ZABCDEFGHJKMNPQRSTVWX',
    worktree_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    actor_label: 'agent-alice',
    branch: 'alice-feat',
    task_id: 'T-001',
    ts: '2026-04-30T12:00:00Z',
  }

  it('accepts a valid task_claimed event', () => {
    const r = validateEvent({ ...base, type: 'task_claimed', payload: { task_title: 'Hello' } })
    expect(r.ok).toBe(true)
  })

  it('drops payload fields that are not in the allowlist', () => {
    const r = validateEvent({
      ...base,
      type: 'task_claimed',
      payload: { task_title: 'Hello', secret: 'xxx', wave: 'wave-2' } as never,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.event.payload).toEqual({ task_title: 'Hello', wave: 'wave-2' })
      expect(r.dropped_fields).toEqual(['secret'])
    }
  })

  it('rejects task_claimed with task_id null unless payload.unplanned === true', () => {
    const bad = validateEvent({
      ...base, task_id: null, type: 'task_claimed', payload: { task_title: 'Hello' },
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors[0]).toMatch(/unplanned/)

    const ok = validateEvent({
      ...base, task_id: null, type: 'task_claimed', payload: { task_title: 'Hello', unplanned: true },
    })
    expect(ok.ok).toBe(true)
  })

  it('rejects finding_acknowledged when task_id is non-null', () => {
    const r = validateEvent({
      ...base,
      type: 'finding_acknowledged',
      task_id: 'T-001',
      payload: { finding_id: 'abc12345', status: 'acknowledged' },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects task_completed pr_submitted without pr_number', () => {
    const r = validateEvent({
      ...base, type: 'task_completed',
      payload: { outcome: 'pr_submitted' } as never,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/pr_number/)
  })

  it('exposes the per-type payload key allowlist for ledger-writer use', () => {
    expect(EVENT_PAYLOAD_KEYS.task_claimed).toEqual(['task_title', 'story_id', 'wave', 'unplanned'])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/event-schemas.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `event-schemas.ts`**

Create `src/observability/engine/event-schemas.ts`:

```typescript
import type { Event, EventType } from './types'

export const EVENT_PAYLOAD_KEYS: Record<EventType, string[]> = {
  task_claimed:        ['task_title', 'story_id', 'wave', 'unplanned'],
  task_completed:      ['outcome', 'pr_number', 'commit_sha'],
  decision_recorded:   ['key', 'summary', 'affects', 'links'],
  blocker_hit:         ['kind', 'summary'],
  blocker_resolved:    ['summary', 'references'],
  pr_opened:           ['pr_number'],
  progress_heartbeat:  ['note'],
  finding_acknowledged:['finding_id', 'status', 'note'],
}

export type ValidationResult =
  | { ok: true; event: Event; dropped_fields: string[] }
  | { ok: false; errors: string[] }

const REQUIRED_BASE = ['event_id', 'worktree_id', 'actor_label', 'branch', 'type', 'ts'] as const

export function validateEvent(input: unknown): ValidationResult {
  const errors: string[] = []
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: ['event must be an object'] }
  }
  const e = input as Record<string, unknown>

  for (const k of REQUIRED_BASE) {
    if (typeof e[k] !== 'string') errors.push(`${k} must be a string`)
  }
  if (e.task_id !== null && typeof e.task_id !== 'string') {
    errors.push('task_id must be string or null')
  }
  if (typeof e.payload !== 'object' || e.payload === null) {
    errors.push('payload must be an object')
  }
  if (errors.length > 0) return { ok: false, errors }

  const type = e.type as EventType
  if (!(type in EVENT_PAYLOAD_KEYS)) {
    return { ok: false, errors: [`unknown event type: ${String(type)}`] }
  }

  // Allowlist payload fields
  const allowedKeys = EVENT_PAYLOAD_KEYS[type]
  const inputPayload = e.payload as Record<string, unknown>
  const filteredPayload: Record<string, unknown> = {}
  const droppedFields: string[] = []
  for (const [k, v] of Object.entries(inputPayload)) {
    if (allowedKeys.includes(k)) filteredPayload[k] = v
    else droppedFields.push(k)
  }

  // Cross-event invariants
  switch (type) {
    case 'task_claimed':
      if (typeof filteredPayload.task_title !== 'string') errors.push('task_claimed.payload.task_title required')
      if (e.task_id === null && filteredPayload.unplanned !== true) {
        errors.push('task_claimed with task_id=null requires payload.unplanned=true')
      }
      break
    case 'task_completed':
      if (filteredPayload.outcome !== 'pr_submitted' && filteredPayload.outcome !== 'dropped' && filteredPayload.outcome !== 'superseded') {
        errors.push('task_completed.payload.outcome must be pr_submitted | dropped | superseded')
      }
      if (filteredPayload.outcome === 'pr_submitted' && typeof filteredPayload.pr_number !== 'number') {
        errors.push('task_completed.payload.pr_number required when outcome=pr_submitted')
      }
      break
    case 'decision_recorded':
      if (typeof filteredPayload.key !== 'string') errors.push('decision_recorded.payload.key required')
      if (typeof filteredPayload.summary !== 'string') errors.push('decision_recorded.payload.summary required')
      if (!Array.isArray(filteredPayload.affects)) errors.push('decision_recorded.payload.affects required')
      break
    case 'blocker_hit':
      if (!['dependency', 'ambiguity', 'external', 'environment'].includes(filteredPayload.kind as string)) {
        errors.push('blocker_hit.payload.kind must be dependency | ambiguity | external | environment')
      }
      if (typeof filteredPayload.summary !== 'string') errors.push('blocker_hit.payload.summary required')
      break
    case 'blocker_resolved':
      if (typeof filteredPayload.summary !== 'string') errors.push('blocker_resolved.payload.summary required')
      if (!Array.isArray(filteredPayload.references)) errors.push('blocker_resolved.payload.references required')
      break
    case 'pr_opened':
      if (typeof filteredPayload.pr_number !== 'number') errors.push('pr_opened.payload.pr_number required')
      break
    case 'progress_heartbeat':
      if (typeof filteredPayload.note !== 'string') errors.push('progress_heartbeat.payload.note required')
      break
    case 'finding_acknowledged':
      if (e.task_id !== null) errors.push('finding_acknowledged requires task_id=null')
      if (typeof filteredPayload.finding_id !== 'string') errors.push('finding_acknowledged.payload.finding_id required')
      if (filteredPayload.status !== 'acknowledged' && filteredPayload.status !== 'open') {
        errors.push('finding_acknowledged.payload.status must be acknowledged | open')
      }
      break
  }

  if (errors.length > 0) return { ok: false, errors }
  const event = { ...e, payload: filteredPayload } as Event
  return { ok: true, event, dropped_fields: droppedFields }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/event-schemas.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/event-schemas.ts src/observability/engine/event-schemas.test.ts
git commit -m "observability: validate event payloads and enforce cross-event invariants"
```

---

## Task 4: Redaction module (write-time + render-time)

**Files:**
- Create: `src/observability/engine/redact.ts`
- Create: `src/observability/engine/redact.test.ts`
- Create: `tests/observability/fixtures/secret-corpus.txt`

- [ ] **Step 1: Create the secret corpus fixture**

Create `tests/observability/fixtures/secret-corpus.txt`:

```
# REDACT — these strings must be redacted by the secret detector.
REDACT AKIAIOSFODNN7EXAMPLE
REDACT ghp_1234567890abcdefABCDEF1234567890abcdef
REDACT password=hunter2
REDACT api_key="abc-123-def"
REDACT SECRET_TOKEN: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08

# KEEP — these must NOT be redacted (false-positive guard).
KEEP my-regular-string-with-dashes
KEEP /path/to/some/file.ts
KEEP commit-sha 4af2e1b9c0
```

- [ ] **Step 2: Write the failing test**

Create `src/observability/engine/redact.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { redactEvent, redactRendered, scrubSecrets, sanitizePath } from './redact'

const corpus = readFileSync(join(__dirname, '../../../tests/observability/fixtures/secret-corpus.txt'), 'utf8')

describe('scrubSecrets', () => {
  it('replaces matched secrets with [REDACTED:*]', () => {
    const out = scrubSecrets(corpus)
    for (const line of corpus.split('\n')) {
      if (line.startsWith('REDACT ')) {
        const value = line.replace(/^REDACT\s+/, '')
        expect(out, `should redact: ${value}`).not.toContain(value)
      }
      if (line.startsWith('KEEP ')) {
        const value = line.replace(/^KEEP\s+/, '')
        expect(out, `must NOT redact: ${value}`).toContain(value)
      }
    }
  })

  it('returns the input unchanged when no secrets present', () => {
    expect(scrubSecrets('hello world\nno secrets here')).toBe('hello world\nno secrets here')
  })
})

describe('sanitizePath', () => {
  it('rewrites macOS user paths to ~', () => {
    expect(sanitizePath('/Users/alice/Documents/repo/file.ts'))
      .toBe('~/Documents/repo/file.ts')
  })
  it('rewrites Linux user paths to ~', () => {
    expect(sanitizePath('/home/bob/src/file.go'))
      .toBe('~/src/file.go')
  })
  it('leaves repo-relative paths unchanged', () => {
    expect(sanitizePath('src/auth/login.ts')).toBe('src/auth/login.ts')
  })
})

describe('redactEvent (write-time)', () => {
  it('scrubs secrets from string fields and drops paths through sanitizePath', () => {
    const e = {
      event_id: '01H', worktree_id: 'wid', actor_label: 'alice',
      branch: 'feat/api_key="abc-123-def"', task_id: 'T-1',
      type: 'decision_recorded', ts: '2026-04-30T00:00:00Z',
      payload: { key: 'k', summary: 'token=ghp_1234567890abcdefABCDEF1234567890abcdef',
                 affects: ['/Users/alice/Documents/repo/src/file.ts'] },
    } as never
    const out = redactEvent(e) as { branch: string; payload: { summary: string; affects: string[] } }
    expect(out.payload.summary).toContain('[REDACTED:')
    expect(out.payload.affects[0]).toBe('~/Documents/repo/src/file.ts')
    expect(out.branch).toContain('[REDACTED:')
  })
})

describe('redactRendered (render-time)', () => {
  it('runs both secret-scrubbing and path-sanitization on a markdown blob', () => {
    const md = 'See /Users/alice/repo/file.ts and token=hunter2'
    const out = redactRendered(md)
    expect(out).toContain('~/repo/file.ts')
    expect(out).not.toContain('hunter2')
    expect(out).toContain('[REDACTED:')
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/redact.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `redact.ts`**

Create `src/observability/engine/redact.ts`:

```typescript
// Secret-detector regex pack. Order matters: longer patterns first.
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'aws-key',     re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'high-entropy', re: /\b[A-Fa-f0-9]{40,}\b/g },                                    // sha256-like + similar
  { name: 'kv-secret',   re: /\b(?:secret|token|password|api[_-]?key)\s*[=:]\s*"?([^\s",]+)"?/gi },
]

export function scrubSecrets(input: string): string {
  let out = input
  for (const { name, re } of SECRET_PATTERNS) {
    out = out.replace(re, (match, captured) => {
      // For kv-secret style, only redact the value (the captured group), not the key=
      if (captured) {
        return match.replace(captured, `[REDACTED:${name}]`)
      }
      return `[REDACTED:${name}]`
    })
  }
  return out
}

export function sanitizePath(s: string): string {
  // /Users/<name>/x -> ~/x ; /home/<name>/x -> ~/x ; everything else unchanged.
  return s.replace(/\/(?:Users|home)\/[^/\s]+/g, '~')
}

function recursivelyTransform(v: unknown, transform: (s: string) => string): unknown {
  if (typeof v === 'string') return transform(v)
  if (Array.isArray(v)) return v.map((x) => recursivelyTransform(x, transform))
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = recursivelyTransform(val, transform)
    }
    return out
  }
  return v
}

/** Write-time redaction: applies to a single event before it lands on disk. */
export function redactEvent<T>(event: T): T {
  return recursivelyTransform(event, (s) => sanitizePath(scrubSecrets(s))) as T
}

/** Render-time redaction: applies to persisted output (markdown, JSON sidecars, dashboard fragments). */
export function redactRendered(blob: string): string {
  return sanitizePath(scrubSecrets(blob))
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/redact.test.ts
```

Expected: PASS, 7 tests across 4 describe blocks.

- [ ] **Step 6: Commit**

```bash
git add src/observability/engine/redact.ts src/observability/engine/redact.test.ts tests/observability/fixtures/secret-corpus.txt
git commit -m "observability: add write-time and render-time redaction (secrets + paths)"
```

---

## Task 5: Ledger writer (basic append, no concurrency yet)

**Files:**
- Create: `src/observability/engine/ledger-writer.ts`
- Create: `src/observability/engine/ledger-writer.test.ts`

- [ ] **Step 1: Write the failing test (single-writer happy path)**

Create `src/observability/engine/ledger-writer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeEvent } from './ledger-writer'
import { ensureIdentity } from './identity'

describe('ledger-writer (basic append)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-lw-'))
    ensureIdentity(dir, 'agent-alice')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('appends a valid task_claimed event as a single JSONL line', async () => {
    await writeEvent(dir, {
      type: 'task_claimed',
      branch: 'alice-feat',
      task_id: 'T-001',
      payload: { task_title: 'Hello' },
    })

    const text = readFileSync(join(dir, '.scaffold/activity.jsonl'), 'utf8')
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(1)
    const obj = JSON.parse(lines[0])
    expect(obj.type).toBe('task_claimed')
    expect(obj.task_id).toBe('T-001')
    expect(obj.event_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/) // ULID
    expect(obj.worktree_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(obj.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects events larger than 4 KiB', async () => {
    const huge = 'x'.repeat(5000)
    await expect(writeEvent(dir, {
      type: 'decision_recorded', branch: 'b', task_id: null,
      payload: { key: 'k', summary: huge, affects: [] },
    })).rejects.toThrow(/4 KiB|too large/i)
  })

  it('rejects schema-invalid events', async () => {
    await expect(writeEvent(dir, {
      type: 'task_claimed', branch: 'b', task_id: null,
      payload: { task_title: 'h' }, // missing payload.unplanned=true for null task_id
    })).rejects.toThrow(/unplanned/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/ledger-writer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ledger-writer.ts` (no flock yet — simple append)**

Create `src/observability/engine/ledger-writer.ts`:

```typescript
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ulid } from 'ulid'
import type { Event, EventType } from './types'
import { validateEvent } from './event-schemas'
import { redactEvent } from './redact'
import { ensureIdentity } from './identity'

const MAX_EVENT_BYTES = 4096

export interface WriteEventInput {
  type: EventType
  branch: string
  task_id: string | null
  payload: Record<string, unknown>
  // event_id and ts are auto-assigned; worktree_id and actor_label come from identity.json
}

export function ledgerPath(worktreeRoot: string): string {
  return join(worktreeRoot, '.scaffold', 'activity.jsonl')
}

export async function writeEvent(worktreeRoot: string, input: WriteEventInput): Promise<void> {
  const id = ensureIdentity(worktreeRoot, deriveLabel(worktreeRoot))

  const candidate = {
    event_id: ulid(),
    worktree_id: id.worktree_id,
    actor_label: id.worktree_label,
    branch: input.branch,
    task_id: input.task_id,
    type: input.type,
    ts: new Date().toISOString(),
    payload: input.payload,
  }

  const validated = validateEvent(candidate)
  if (!validated.ok) {
    throw new Error(`event validation failed: ${validated.errors.join('; ')}`)
  }

  const redacted = redactEvent(validated.event) as Event
  const line = JSON.stringify(redacted) + '\n'
  if (Buffer.byteLength(line, 'utf8') > MAX_EVENT_BYTES) {
    throw new Error(`event too large (>${MAX_EVENT_BYTES} bytes / 4 KiB): split or summarize the payload`)
  }

  mkdirSync(join(worktreeRoot, '.scaffold'), { recursive: true })
  appendFileSync(ledgerPath(worktreeRoot), line, { mode: 0o644 })
}

function deriveLabel(worktreeRoot: string): string {
  // Default the label to the worktree directory's basename (e.g., "scaffold-observability-foundation").
  // Overridable later by the CLI when called with --actor-label, but for v1 the dir basename is enough.
  const segments = worktreeRoot.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? 'primary'
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/ledger-writer.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/ledger-writer.ts src/observability/engine/ledger-writer.test.ts
git commit -m "observability: add ledger writer (basic append, 4 KiB cap, schema validation)"
```

---

## Task 6: Ledger writer concurrency via `proper-lockfile`

**Files:**
- Modify: `src/observability/engine/ledger-writer.ts`
- Modify: `src/observability/engine/ledger-writer.test.ts`

- [ ] **Step 1: Add the failing concurrency test**

Append to `src/observability/engine/ledger-writer.test.ts` (inside the existing module, in a new `describe`):

```typescript
import { fork } from 'node:child_process'

describe('ledger-writer (concurrent appends)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-lw-conc-'))
    ensureIdentity(dir, 'agent-alice')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('serializes concurrent appends without losing or interleaving lines', async () => {
    const N = 30
    const concurrent = Array.from({ length: N }, (_, i) =>
      writeEvent(dir, {
        type: 'progress_heartbeat',
        branch: 'b',
        task_id: 'T-001',
        payload: { note: `n-${i}` },
      })
    )
    await Promise.all(concurrent)

    const text = readFileSync(join(dir, '.scaffold/activity.jsonl'), 'utf8')
    const lines = text.split('\n').filter(Boolean)
    expect(lines).toHaveLength(N)
    for (const ln of lines) {
      // Each line must parse as a valid JSON object (no torn writes).
      expect(() => JSON.parse(ln)).not.toThrow()
    }
  }, 15000)
})
```

- [ ] **Step 2: Run the test to confirm it fails (or surfaces the concurrency risk)**

```bash
npx vitest run src/observability/engine/ledger-writer.test.ts
```

This may pass on a fast machine (single-process Node has cooperative scheduling), but the test exists to lock in correctness once `proper-lockfile` is wired. If it fails, the concurrent-append protection is missing.

- [ ] **Step 3: Wrap the append in `proper-lockfile`**

Replace the body of `writeEvent` in `src/observability/engine/ledger-writer.ts` with the locked version:

```typescript
import lockfile from 'proper-lockfile'
// (keep the other imports from Task 5)

export async function writeEvent(worktreeRoot: string, input: WriteEventInput): Promise<void> {
  const id = ensureIdentity(worktreeRoot, deriveLabel(worktreeRoot))

  const candidate = {
    event_id: ulid(),
    worktree_id: id.worktree_id,
    actor_label: id.worktree_label,
    branch: input.branch,
    task_id: input.task_id,
    type: input.type,
    ts: new Date().toISOString(),
    payload: input.payload,
  }

  const validated = validateEvent(candidate)
  if (!validated.ok) {
    throw new Error(`event validation failed: ${validated.errors.join('; ')}`)
  }

  const redacted = redactEvent(validated.event) as Event
  const line = JSON.stringify(redacted) + '\n'
  if (Buffer.byteLength(line, 'utf8') > MAX_EVENT_BYTES) {
    throw new Error(`event too large (>${MAX_EVENT_BYTES} bytes / 4 KiB): split or summarize the payload`)
  }

  mkdirSync(join(worktreeRoot, '.scaffold'), { recursive: true })

  // Lock target = the activity file itself; proper-lockfile creates `<file>.lock`.
  // Touch the file first so lockfile has a target it can lock against on first write.
  const path = ledgerPath(worktreeRoot)
  appendFileSync(path, '', { mode: 0o644 }) // ensures the file exists with no content

  const release = await lockfile.lock(path, {
    retries: { retries: 5, factor: 1.5, minTimeout: 50, maxTimeout: 500 },
    stale: 30_000, // ms — release stale locks held > 30 s
  })
  try {
    appendFileSync(path, line, { mode: 0o644 })
  } finally {
    await release()
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/ledger-writer.test.ts
```

Expected: PASS, 4 tests total (3 from Task 5 + 1 concurrent).

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/ledger-writer.ts src/observability/engine/ledger-writer.test.ts
git commit -m "observability: serialize ledger appends with proper-lockfile (POSIX flock + Windows LockFileEx)"
```

---

## Task 7: Harvester (worktree → central archive)

**Files:**
- Create: `src/observability/engine/harvester.ts`
- Create: `src/observability/engine/harvester.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/harvester.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harvestWorktree } from './harvester'
import { writeEvent } from './ledger-writer'
import { ensureIdentity } from './identity'

describe('harvester', () => {
  let primary: string
  let worktree: string

  beforeEach(() => {
    primary = mkdtempSync(join(tmpdir(), 'observe-primary-'))
    worktree = mkdtempSync(join(tmpdir(), 'observe-wt-'))
    ensureIdentity(worktree, 'agent-alice')
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  })

  it('copies the worktree ledger to <primary>/.scaffold/activity-archive/active/<worktree-id>.jsonl atomically', async () => {
    await writeEvent(worktree, { type: 'task_claimed', branch: 'b', task_id: 'T-1', payload: { task_title: 'Hi' } })
    const id = JSON.parse(readFileSync(join(worktree, '.scaffold/identity.json'), 'utf8'))

    await harvestWorktree({ primaryRoot: primary, worktreeRoot: worktree })

    const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
    expect(existsSync(archived)).toBe(true)
    const lines = readFileSync(archived, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).type).toBe('task_claimed')
  })

  it('overwrites prior archive (idempotent full-file replacement)', async () => {
    await writeEvent(worktree, { type: 'task_claimed', branch: 'b', task_id: 'T-1', payload: { task_title: 'Hi' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: worktree })
    await writeEvent(worktree, { type: 'task_completed', branch: 'b', task_id: 'T-1', payload: { outcome: 'pr_submitted', pr_number: 42 } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: worktree })

    const id = JSON.parse(readFileSync(join(worktree, '.scaffold/identity.json'), 'utf8'))
    const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
    const lines = readFileSync(archived, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[1]).type).toBe('task_completed')
  })

  it('does nothing (returns silently) if the worktree has no ledger yet', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'observe-empty-'))
    ensureIdentity(empty, 'agent-bob')
    try {
      await harvestWorktree({ primaryRoot: primary, worktreeRoot: empty })
      // Verify no archive file was created.
      const id = JSON.parse(readFileSync(join(empty, '.scaffold/identity.json'), 'utf8'))
      const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
      expect(existsSync(archived)).toBe(false)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/harvester.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `harvester.ts`**

Create `src/observability/engine/harvester.ts`:

```typescript
import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { readIdentity } from './identity'
import { ledgerPath } from './ledger-writer'

export interface HarvestInput {
  primaryRoot: string      // absolute path to the primary repo's working tree
  worktreeRoot: string     // absolute path to the worktree to harvest
}

export function archiveDir(primaryRoot: string): string {
  return join(primaryRoot, '.scaffold', 'activity-archive')
}

export function activeArchiveFile(primaryRoot: string, worktreeId: string): string {
  return join(archiveDir(primaryRoot), 'active', `${worktreeId}.jsonl`)
}

export async function harvestWorktree(input: HarvestInput): Promise<void> {
  const sourceLedger = ledgerPath(input.worktreeRoot)
  if (!existsSync(sourceLedger)) return

  const id = readIdentity(input.worktreeRoot)
  if (!id) {
    throw new Error(`worktree at ${input.worktreeRoot} has no .scaffold/identity.json — run setup-agent-worktree.sh first`)
  }

  const dest = activeArchiveFile(input.primaryRoot, id.worktree_id)
  mkdirSync(join(archiveDir(input.primaryRoot), 'active'), { recursive: true })

  // Atomic write-to-temp-then-rename: the synthesizer reading mid-flush sees old
  // content or new content, never a torn file.
  const tmp = `${dest}.tmp.${process.pid}.${Date.now()}`
  copyFileSync(sourceLedger, tmp)
  renameSync(tmp, dest)
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/harvester.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/harvester.ts src/observability/engine/harvester.test.ts
git commit -m "observability: add harvester (worktree -> central archive, write-to-temp-then-rename)"
```

---

## Task 8: Adapter base types

**Files:**
- Create: `src/observability/adapters/types.ts`

- [ ] **Step 1: Create the adapter base types file**

This task has no test — it's pure type definitions consumed by the adapter modules in tasks 9–16.

Create `src/observability/adapters/types.ts`:

```typescript
import type { AdapterId, AdapterStatus } from '../engine/types'

export type { AdapterId, AdapterStatus }

/**
 * Every adapter implements `probe()` (cheap availability check) and one or more
 * data methods. Data methods MAY be invoked even if `probe()` returned
 * 'unavailable'; in that case they should return an empty/null result, not throw.
 */
export interface BaseAdapter {
  readonly id: AdapterId
  probe(cwd: string): Promise<AdapterStatus>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/observability/adapters/types.ts
git commit -m "observability: add adapter base types"
```

---

## Task 9: `git` adapter

**Files:**
- Create: `src/observability/adapters/git.ts`
- Create: `src/observability/adapters/git.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/adapters/git.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitAdapter } from './git'

describe('git adapter', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-git-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email test@example.com && git config user.name Test', { cwd: dir, shell: '/bin/sh' })
    writeFileSync(join(dir, 'a.txt'), 'hello\n')
    execSync('git add a.txt && git commit -q -m initial', { cwd: dir, shell: '/bin/sh' })
  })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns available inside a git repo', async () => {
    const s = await gitAdapter.probe(dir)
    expect(s.status).toBe('available')
  })

  it('probe returns unavailable outside a git repo', async () => {
    const not = mkdtempSync(join(tmpdir(), 'observe-notgit-'))
    try {
      const s = await gitAdapter.probe(not)
      expect(s.status).toBe('unavailable')
    } finally {
      rmSync(not, { recursive: true, force: true })
    }
  })

  it('listWorktrees returns at least the primary worktree', async () => {
    const wts = await gitAdapter.listWorktrees(dir)
    expect(wts.length).toBeGreaterThanOrEqual(1)
    expect(wts[0].path).toContain(dir)
  })

  it('recentCommits returns commits with sha + subject + ts', async () => {
    const cs = await gitAdapter.recentCommits(dir, { sinceHours: 24 })
    expect(cs).toHaveLength(1)
    expect(cs[0].sha).toMatch(/^[0-9a-f]{40}$/)
    expect(cs[0].subject).toBe('initial')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/git.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `git.ts`**

Create `src/observability/adapters/git.ts`:

```typescript
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { AdapterStatus, BaseAdapter } from './types'

const execFile = promisify(execFileCb)

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
}
export interface CommitInfo {
  sha: string
  branch: string | null
  ts: string
  author: string
  subject: string
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

export const gitAdapter: BaseAdapter & {
  listWorktrees(cwd: string): Promise<WorktreeInfo[]>
  recentCommits(cwd: string, opts: { sinceHours: number }): Promise<CommitInfo[]>
} = {
  id: 'git',

  async probe(cwd: string): Promise<AdapterStatus> {
    try {
      await git(cwd, ['rev-parse', '--is-inside-work-tree'])
      return { status: 'available' }
    } catch {
      return { status: 'unavailable', reason: 'not a git repository' }
    }
  },

  async listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
    try {
      const out = await git(cwd, ['worktree', 'list', '--porcelain'])
      const wts: WorktreeInfo[] = []
      let cur: Partial<WorktreeInfo> = {}
      for (const line of out.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (cur.path) wts.push(cur as WorktreeInfo)
          cur = { path: line.slice('worktree '.length).trim() }
        } else if (line.startsWith('HEAD ')) {
          cur.head = line.slice('HEAD '.length).trim()
        } else if (line.startsWith('branch ')) {
          cur.branch = line.slice('branch '.length).replace('refs/heads/', '').trim()
        }
      }
      if (cur.path) wts.push({ path: cur.path, branch: cur.branch ?? '', head: cur.head ?? '' })
      return wts
    } catch {
      return []
    }
  },

  async recentCommits(cwd: string, opts: { sinceHours: number }): Promise<CommitInfo[]> {
    try {
      const since = `${opts.sinceHours}.hours.ago`
      const fmt = '%H%x09%cI%x09%an%x09%s'
      const out = await git(cwd, ['log', '--all', `--since=${since}`, `--pretty=format:${fmt}`])
      return out.split('\n').filter(Boolean).map((line) => {
        const [sha, ts, author, subject] = line.split('\t')
        return { sha, branch: null, ts, author, subject }
      })
    } catch {
      return []
    }
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/git.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/git.ts src/observability/adapters/git.test.ts
git commit -m "observability: add git adapter (probe, listWorktrees, recentCommits)"
```

---

## Task 10: `gh` adapter

**Files:**
- Create: `src/observability/adapters/gh.ts`
- Create: `src/observability/adapters/gh.test.ts`

The gh adapter is *unavailable* on hosts without the `gh` CLI installed and is *degraded* when `gh` is installed but unauthenticated. It is OPTIONAL for Plan 1; tests use a stubbed `GH` env var to drive deterministic behavior.

- [ ] **Step 1: Write the failing test**

Create `src/observability/adapters/gh.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ghAdapter } from './gh'

describe('gh adapter', () => {
  it('probe returns unavailable when gh binary is missing', async () => {
    const s = await ghAdapter.probe('.', { ghBin: '/no/such/binary' })
    expect(s.status).toBe('unavailable')
    expect(s.reason).toMatch(/not installed|ENOENT/)
  })

  it('probe returns degraded when gh prints auth-required message to stderr', async () => {
    const s = await ghAdapter.probe('.', { ghBin: 'sh', ghArgs: ['-c', 'echo "gh auth login required" >&2; exit 1'] })
    expect(s.status).toBe('degraded')
    expect(s.reason).toMatch(/auth/i)
  })

  it('probe returns available when gh exits zero', async () => {
    const s = await ghAdapter.probe('.', { ghBin: 'true' })
    expect(s.status).toBe('available')
  })

  it('listOpenPRs returns [] when gh is unavailable', async () => {
    const prs = await ghAdapter.listOpenPRs('.', { ghBin: '/no/such/binary' })
    expect(prs).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/gh.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `gh.ts`**

Create `src/observability/adapters/gh.ts`:

```typescript
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { AdapterStatus, BaseAdapter } from './types'

const execFile = promisify(execFileCb)

export interface PrInfo {
  number: number
  url: string
  state: 'open' | 'merged' | 'closed'
  branch: string
  opened_at: string
  merged_at?: string
}

export interface GhAdapterOpts {
  ghBin?: string
  ghArgs?: string[]   // probe args; default []
}

export const ghAdapter: BaseAdapter & {
  listOpenPRs(cwd: string, opts?: GhAdapterOpts): Promise<PrInfo[]>
} = {
  id: 'gh',

  async probe(cwd: string, opts: GhAdapterOpts = {}): Promise<AdapterStatus> {
    const bin = opts.ghBin ?? 'gh'
    const args = opts.ghArgs ?? ['auth', 'status']
    try {
      await execFile(bin, args, { cwd })
      return { status: 'available' }
    } catch (err: unknown) {
      const e = err as { code?: string; stderr?: string }
      if (e.code === 'ENOENT' || /not found/i.test(String(e.stderr ?? ''))) {
        return { status: 'unavailable', reason: 'gh binary not installed (ENOENT)' }
      }
      if (/auth|login/i.test(String(e.stderr ?? ''))) {
        return { status: 'degraded', reason: 'gh installed but not authenticated' }
      }
      return { status: 'degraded', reason: String(e.stderr ?? '').trim().slice(0, 200) || 'gh probe failed' }
    }
  },

  async listOpenPRs(cwd: string, opts: GhAdapterOpts = {}): Promise<PrInfo[]> {
    const bin = opts.ghBin ?? 'gh'
    const probe = await ghAdapter.probe(cwd, opts)
    if (probe.status !== 'available') return []
    try {
      const { stdout } = await execFile(bin, [
        'pr', 'list', '--state', 'open', '--json',
        'number,url,state,headRefName,createdAt,mergedAt',
      ], { cwd })
      const raw = JSON.parse(stdout) as Array<{
        number: number; url: string; state: string; headRefName: string; createdAt: string; mergedAt?: string
      }>
      return raw.map((p) => ({
        number: p.number,
        url: p.url,
        state: (p.state.toLowerCase() as PrInfo['state']),
        branch: p.headRefName,
        opened_at: p.createdAt,
        merged_at: p.mergedAt,
      }))
    } catch {
      return []
    }
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/gh.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/gh.ts src/observability/adapters/gh.test.ts
git commit -m "observability: add gh adapter (probe, listOpenPRs) with stubbable binary path"
```

---

## Task 11: `pipeline_docs` adapter

**Files:**
- Create: `src/observability/adapters/pipeline-docs.ts`
- Create: `src/observability/adapters/pipeline-docs.test.ts`

In this plan, the adapter only checks *which* artifacts exist and exposes their raw text. The doc-graph (Plan 2) will parse them into typed nodes.

- [ ] **Step 1: Write the failing test**

Create `src/observability/adapters/pipeline-docs.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipelineDocsAdapter } from './pipeline-docs'

describe('pipeline_docs adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-pd-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when no planning docs exist', async () => {
    const s = await pipelineDocsAdapter.probe(dir)
    expect(s.status).toBe('unavailable')
  })

  it('probe returns degraded when only some artifacts exist', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/prd.md'), '# PRD\n')
    const s = await pipelineDocsAdapter.probe(dir)
    expect(s.status).toBe('degraded')
    expect(s.evidence_paths).toEqual(['docs/prd.md'])
  })

  it('probe returns available when the canonical artifact set is present', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    for (const name of ['prd.md', 'user-stories.md', 'implementation-plan.md', 'tech-stack.md', 'coding-standards.md']) {
      writeFileSync(join(dir, 'docs', name), `# ${name}\n`)
    }
    const s = await pipelineDocsAdapter.probe(dir)
    expect(s.status).toBe('available')
  })

  it('readArtifacts returns text for present files and skips missing ones', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/prd.md'), '# PRD body\n')
    const out = await pipelineDocsAdapter.readArtifacts(dir)
    expect(out.prd).toBe('# PRD body\n')
    expect(out.user_stories).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/pipeline-docs.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline-docs.ts`**

Create `src/observability/adapters/pipeline-docs.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types'

// Canonical paths and their role keys. Plan 2's doc-graph extends this map.
export const PIPELINE_ARTIFACTS = {
  prd:                    'docs/prd.md',
  user_stories:           'docs/user-stories.md',
  tech_stack:             'docs/tech-stack.md',
  coding_standards:       'docs/coding-standards.md',
  tdd_standards:          'docs/tdd-standards.md',
  design_system:          'docs/design-system.md',
  implementation_plan:    'docs/implementation-plan.md',
  implementation_playbook:'docs/implementation-playbook.md',
  story_tests_map:        'docs/story-tests-map.md',
} as const
export type ArtifactKey = keyof typeof PIPELINE_ARTIFACTS

export type ArtifactBundle = Record<ArtifactKey, string | null>

const CANONICAL_REQUIRED: ArtifactKey[] = ['prd', 'user_stories', 'implementation_plan', 'tech_stack', 'coding_standards']

export const pipelineDocsAdapter: BaseAdapter & {
  readArtifacts(cwd: string): Promise<ArtifactBundle>
} = {
  id: 'pipeline_docs',

  async probe(cwd: string): Promise<AdapterStatus> {
    const present: string[] = []
    let canonicalCount = 0
    for (const [k, rel] of Object.entries(PIPELINE_ARTIFACTS) as Array<[ArtifactKey, string]>) {
      if (existsSync(join(cwd, rel))) {
        present.push(rel)
        if (CANONICAL_REQUIRED.includes(k)) canonicalCount++
      }
    }
    if (present.length === 0) return { status: 'unavailable', reason: 'no docs/*.md planning artifacts found' }
    if (canonicalCount === CANONICAL_REQUIRED.length) return { status: 'available', evidence_paths: present }
    return { status: 'degraded', reason: `${canonicalCount}/${CANONICAL_REQUIRED.length} canonical artifacts present`, evidence_paths: present }
  },

  async readArtifacts(cwd: string): Promise<ArtifactBundle> {
    const out = {} as ArtifactBundle
    for (const [k, rel] of Object.entries(PIPELINE_ARTIFACTS) as Array<[ArtifactKey, string]>) {
      const p = join(cwd, rel)
      out[k] = existsSync(p) ? readFileSync(p, 'utf8') : null
    }
    return out
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/pipeline-docs.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/pipeline-docs.ts src/observability/adapters/pipeline-docs.test.ts
git commit -m "observability: add pipeline_docs adapter (probe + readArtifacts)"
```

---

## Task 12: `tests` adapter

**Files:**
- Create: `src/observability/adapters/tests.ts`
- Create: `src/observability/adapters/tests.test.ts`

Reads cached results from `.scaffold/last-test-run.json` if present. Plan 1 does not run tests on demand; that's a Plan 2/3 concern when an audit needs fresh results.

- [ ] **Step 1: Write the failing test**

Create `src/observability/adapters/tests.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testsAdapter } from './tests'

describe('tests adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-t-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when no cached run exists', async () => {
    const s = await testsAdapter.probe(dir)
    expect(s.status).toBe('unavailable')
  })

  it('probe returns available when last-test-run.json exists', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/last-test-run.json'), JSON.stringify({
      ran_at: '2026-04-30T00:00:00Z',
      passed: 100,
      failed: 0,
      results: [{ name: 't1', file_path: 'src/a.test.ts', status: 'passing' }],
    }))
    const s = await testsAdapter.probe(dir)
    expect(s.status).toBe('available')
    expect(s.evidence_paths).toEqual(['.scaffold/last-test-run.json'])
  })

  it('lastRun returns parsed results when available', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/last-test-run.json'), JSON.stringify({
      ran_at: '2026-04-30T00:00:00Z',
      passed: 1, failed: 0,
      results: [{ name: 't1', file_path: 'src/a.test.ts', status: 'passing' }],
    }))
    const r = await testsAdapter.lastRun(dir)
    expect(r?.results[0].status).toBe('passing')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/tests.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tests.ts`**

Create `src/observability/adapters/tests.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types'

export interface TestResult {
  name: string
  file_path: string
  status: 'passing' | 'failing' | 'skipped' | 'unknown'
}
export interface TestRun {
  ran_at: string
  passed: number
  failed: number
  results: TestResult[]
}

const REL = '.scaffold/last-test-run.json'

export const testsAdapter: BaseAdapter & { lastRun(cwd: string): Promise<TestRun | null> } = {
  id: 'tests',

  async probe(cwd: string): Promise<AdapterStatus> {
    if (!existsSync(join(cwd, REL))) return { status: 'unavailable', reason: 'no cached test run; run tests to populate' }
    return { status: 'available', evidence_paths: [REL] }
  },

  async lastRun(cwd: string): Promise<TestRun | null> {
    const p = join(cwd, REL)
    if (!existsSync(p)) return null
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as TestRun
    } catch {
      return null
    }
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/tests.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/tests.ts src/observability/adapters/tests.test.ts
git commit -m "observability: add tests adapter (cached last-test-run.json reader)"
```

---

## Task 13: `state` adapter

**Files:**
- Create: `src/observability/adapters/state.ts`
- Create: `src/observability/adapters/state.test.ts`

Reads `.scaffold/state.json` plus any `.scaffold/services/<svc>/state.json` for multi-service projects, merging by step slug.

- [ ] **Step 1: Write the failing test**

Create `src/observability/adapters/state.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stateAdapter } from './state'

describe('state adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-s-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when no state.json exists', async () => {
    expect((await stateAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('readMergedState returns root state when services dir is absent', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({
      version: '1.0',
      methodology: 'deep',
      steps: { 'user-stories': { status: 'completed', source: 'pipeline', produces: ['docs/user-stories.md'] } },
    }))
    const merged = await stateAdapter.readMergedState(dir)
    expect(merged.steps['user-stories'].status).toBe('completed')
  })

  it('readMergedState merges service-scoped state under each service step', async () => {
    mkdirSync(join(dir, '.scaffold/services/api'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/state.json'), JSON.stringify({ steps: { 'tech-stack': { status: 'completed' } } }))
    writeFileSync(join(dir, '.scaffold/services/api/state.json'), JSON.stringify({ steps: { 'coding-standards': { status: 'in_progress' } } }))
    const merged = await stateAdapter.readMergedState(dir)
    expect(merged.steps['tech-stack'].status).toBe('completed')
    expect(merged.steps['coding-standards@api'].status).toBe('in_progress')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `state.ts`**

Create `src/observability/adapters/state.ts`:

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types'

export interface StepEntry {
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  source?: 'pipeline' | 'manual'
  produces?: string[]
}
export interface MergedState {
  version?: string
  methodology?: string
  steps: Record<string, StepEntry>
}

const ROOT_STATE = '.scaffold/state.json'

function safeReadJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

export const stateAdapter: BaseAdapter & { readMergedState(cwd: string): Promise<MergedState> } = {
  id: 'state',

  async probe(cwd: string): Promise<AdapterStatus> {
    if (!existsSync(join(cwd, ROOT_STATE))) return { status: 'unavailable', reason: 'no .scaffold/state.json' }
    return { status: 'available', evidence_paths: [ROOT_STATE] }
  },

  async readMergedState(cwd: string): Promise<MergedState> {
    const merged: MergedState = { steps: {} }
    const root = safeReadJson(join(cwd, ROOT_STATE)) as Partial<MergedState> | null
    if (root) {
      Object.assign(merged, { version: root.version, methodology: root.methodology })
      Object.assign(merged.steps, root.steps ?? {})
    }
    const servicesDir = join(cwd, '.scaffold', 'services')
    if (existsSync(servicesDir) && statSync(servicesDir).isDirectory()) {
      for (const svc of readdirSync(servicesDir)) {
        const svcPath = join(servicesDir, svc, 'state.json')
        if (!existsSync(svcPath)) continue
        const svcState = safeReadJson(svcPath) as { steps?: Record<string, StepEntry> } | null
        if (!svcState?.steps) continue
        for (const [slug, entry] of Object.entries(svcState.steps)) {
          merged.steps[`${slug}@${svc}`] = entry
        }
      }
    }
    return merged
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/state.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/state.ts src/observability/adapters/state.test.ts
git commit -m "observability: add state adapter (root + service-scoped state.json merge)"
```

---

## Task 14: `beads` adapter

**Files:**
- Create: `src/observability/adapters/beads.ts`
- Create: `src/observability/adapters/beads.test.ts`

Beads is optional. Probe returns `unavailable` when `.beads/` is missing or the `bd` binary is not installed.

- [ ] **Step 1: Write the failing test**

Create `src/observability/adapters/beads.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beadsAdapter } from './beads'

describe('beads adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-bd-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable without .beads dir', async () => {
    expect((await beadsAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('probe returns degraded when .beads/ exists but bd binary is missing', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const s = await beadsAdapter.probe(dir, { bdBin: '/no/such/bd' })
    expect(s.status).toBe('degraded')
    expect(s.reason).toMatch(/bd binary/)
  })

  it('probe returns available when .beads/ + bd both exist', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const s = await beadsAdapter.probe(dir, { bdBin: 'true' })
    expect(s.status).toBe('available')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/beads.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `beads.ts`**

Create `src/observability/adapters/beads.ts`:

```typescript
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types'

const execFile = promisify(execFileCb)

export interface BeadsAdapterOpts {
  bdBin?: string
}

export const beadsAdapter: BaseAdapter & {
  listTasks(cwd: string, opts?: BeadsAdapterOpts): Promise<unknown[]>
} = {
  id: 'beads',

  async probe(cwd: string, opts: BeadsAdapterOpts = {}): Promise<AdapterStatus> {
    if (!existsSync(join(cwd, '.beads'))) return { status: 'unavailable', reason: '.beads directory not found (project chose markdown-only tracking)' }
    const bin = opts.bdBin ?? 'bd'
    try {
      await execFile(bin, ['--version'], { cwd })
      return { status: 'available' }
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === 'ENOENT') return { status: 'degraded', reason: 'bd binary not installed' }
      return { status: 'degraded', reason: 'bd probe failed' }
    }
  },

  async listTasks(cwd: string, opts: BeadsAdapterOpts = {}): Promise<unknown[]> {
    const probe = await beadsAdapter.probe(cwd, opts)
    if (probe.status !== 'available') return []
    try {
      const { stdout } = await execFile(opts.bdBin ?? 'bd', ['list', '--all', '--json'], { cwd })
      return JSON.parse(stdout) as unknown[]
    } catch {
      return []
    }
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/beads.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/beads.ts src/observability/adapters/beads.test.ts
git commit -m "observability: add beads adapter (probe + listTasks, optional)"
```

---

## Task 15: `mmr` adapter

**Files:**
- Create: `src/observability/adapters/mmr.ts`
- Create: `src/observability/adapters/mmr.test.ts`

Reads the most-recent MMR job summary from `.mmr/jobs/<id>/result.json`. Unavailable if `.mmr/` doesn't exist or has no jobs.

- [ ] **Step 1: Write the failing test**

Create `src/observability/adapters/mmr.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mmrAdapter } from './mmr'

describe('mmr adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-mmr-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when .mmr/jobs/ has no result.json files', async () => {
    expect((await mmrAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('probe returns available when at least one job result.json exists', async () => {
    const job = join(dir, '.mmr/jobs/job-001')
    mkdirSync(job, { recursive: true })
    writeFileSync(join(job, 'result.json'), JSON.stringify({ verdict: 'pass', completed_at: '2026-04-30T00:00:00Z' }))
    const s = await mmrAdapter.probe(dir)
    expect(s.status).toBe('available')
  })

  it('mostRecentJob returns the newest result.json by mtime', async () => {
    const a = join(dir, '.mmr/jobs/a'); mkdirSync(a, { recursive: true })
    writeFileSync(join(a, 'result.json'), JSON.stringify({ verdict: 'pass', completed_at: '2026-04-29T00:00:00Z' }))
    await new Promise((r) => setTimeout(r, 50))
    const b = join(dir, '.mmr/jobs/b'); mkdirSync(b, { recursive: true })
    writeFileSync(join(b, 'result.json'), JSON.stringify({ verdict: 'blocked', completed_at: '2026-04-30T00:00:00Z' }))
    const j = await mmrAdapter.mostRecentJob(dir)
    expect(j?.verdict).toBe('blocked')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/mmr.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mmr.ts`**

Create `src/observability/adapters/mmr.ts`:

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types'

export interface MmrJobResult {
  verdict: 'pass' | 'degraded-pass' | 'blocked' | 'needs-user-decision'
  completed_at: string
  fix_threshold?: string
  [k: string]: unknown
}

const JOBS_DIR = '.mmr/jobs'

function listResultFiles(cwd: string): string[] {
  const dir = join(cwd, JOBS_DIR)
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const sub of readdirSync(dir)) {
    const p = join(dir, sub, 'result.json')
    if (existsSync(p)) out.push(p)
  }
  return out
}

export const mmrAdapter: BaseAdapter & {
  mostRecentJob(cwd: string): Promise<MmrJobResult | null>
} = {
  id: 'mmr',

  async probe(cwd: string): Promise<AdapterStatus> {
    const files = listResultFiles(cwd)
    if (files.length === 0) return { status: 'unavailable', reason: 'no MMR jobs found in .mmr/jobs/' }
    return { status: 'available', evidence_paths: files.slice(-1) }
  },

  async mostRecentJob(cwd: string): Promise<MmrJobResult | null> {
    const files = listResultFiles(cwd)
    if (files.length === 0) return null
    const sorted = files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    try {
      return JSON.parse(readFileSync(sorted[0], 'utf8')) as MmrJobResult
    } catch {
      return null
    }
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/mmr.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/mmr.ts src/observability/adapters/mmr.test.ts
git commit -m "observability: add mmr adapter (probe + mostRecentJob)"
```

---

## Task 16: `audit_history` adapter

**Files:**
- Create: `src/observability/adapters/audit-history.ts`
- Create: `src/observability/adapters/audit-history.test.ts`

Reads JSON sidecars under `docs/audits/`. In Plan 1, no audit ever runs, so this adapter will report `unavailable` in real use; the tests prove the adapter does the right thing once Plan 2 starts writing sidecars.

- [ ] **Step 1: Write the failing test**

Create `src/observability/adapters/audit-history.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditHistoryAdapter } from './audit-history'

describe('audit_history adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-ah-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when docs/audits/ has no JSON sidecars', async () => {
    expect((await auditHistoryAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('probe returns available when at least one sidecar exists', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/2026-04-30-1422-fast-all.json'), JSON.stringify({
      report_id: 'audit-…', engine_output: { schema_version: '1.0', findings: [] },
    }))
    expect((await auditHistoryAdapter.probe(dir)).status).toBe('available')
  })

  it('listSidecars returns sidecar paths sorted newest-first', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/2026-04-29.json'), '{}')
    await new Promise((r) => setTimeout(r, 30))
    writeFileSync(join(dir, 'docs/audits/2026-04-30.json'), '{}')
    const list = await auditHistoryAdapter.listSidecars(dir)
    expect(list[0]).toMatch(/2026-04-30/)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/audit-history.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `audit-history.ts`**

Create `src/observability/adapters/audit-history.ts`:

```typescript
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types'

const DIR = 'docs/audits'

function listJsonFiles(cwd: string): string[] {
  const d = join(cwd, DIR)
  if (!existsSync(d)) return []
  return readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => join(d, f))
}

export const auditHistoryAdapter: BaseAdapter & { listSidecars(cwd: string): Promise<string[]> } = {
  id: 'audit_history',

  async probe(cwd: string): Promise<AdapterStatus> {
    const files = listJsonFiles(cwd)
    if (files.length === 0) return { status: 'unavailable', reason: 'no audit JSON sidecars under docs/audits/' }
    return { status: 'available', evidence_paths: [DIR] }
  },

  async listSidecars(cwd: string): Promise<string[]> {
    const files = listJsonFiles(cwd)
    return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/audit-history.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/audit-history.ts src/observability/adapters/audit-history.test.ts
git commit -m "observability: add audit_history adapter (probe + listSidecars)"
```

---

## Task 17: Synthesizer — availability map composition

**Files:**
- Create: `src/observability/engine/synthesizer.ts`
- Create: `src/observability/engine/synthesizer.test.ts`

The synthesizer's first job is to call every adapter's `probe()` and produce an `AvailabilityMap`. Snapshot composition is added in Task 18.

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/synthesizer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { composeAvailability } from './synthesizer'

describe('synthesizer.composeAvailability', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-syn-'))
    execSync('git init -q', { cwd: dir })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: dir, shell: '/bin/sh' })
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns one AdapterStatus per adapter', async () => {
    const a = await composeAvailability(dir, { ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(a.git.status).toBe('available')
    expect(a.gh.status).toBe('unavailable')
    expect(a.beads.status).toBe('unavailable')
    expect(a.pipeline_docs.status).toBe('unavailable')
    expect(a.tests.status).toBe('unavailable')
    expect(a.state.status).toBe('unavailable')
    expect(a.mmr.status).toBe('unavailable')
    expect(a.audit_history.status).toBe('unavailable')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/synthesizer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `synthesizer.ts` with `composeAvailability`**

Create `src/observability/engine/synthesizer.ts`:

```typescript
import type { AvailabilityMap } from './types'
import { gitAdapter } from '../adapters/git'
import { ghAdapter } from '../adapters/gh'
import { pipelineDocsAdapter } from '../adapters/pipeline-docs'
import { testsAdapter } from '../adapters/tests'
import { stateAdapter } from '../adapters/state'
import { beadsAdapter } from '../adapters/beads'
import { mmrAdapter } from '../adapters/mmr'
import { auditHistoryAdapter } from '../adapters/audit-history'

export interface SynthesizerOpts {
  ghBin?: string
  bdBin?: string
}

export async function composeAvailability(
  cwd: string,
  opts: SynthesizerOpts = {},
): Promise<AvailabilityMap> {
  const [git, gh, pipeline_docs, tests, state, beads, mmr, audit_history] = await Promise.all([
    gitAdapter.probe(cwd),
    ghAdapter.probe(cwd, { ghBin: opts.ghBin }),
    pipelineDocsAdapter.probe(cwd),
    testsAdapter.probe(cwd),
    stateAdapter.probe(cwd),
    beadsAdapter.probe(cwd, { bdBin: opts.bdBin }),
    mmrAdapter.probe(cwd),
    auditHistoryAdapter.probe(cwd),
  ])
  return {
    git, gh, pipeline_docs, tests, state, beads, mmr, audit_history,
    ledger: { events_read: 0, malformed_lines: 0, sources: [] }, // populated by readLedger in Task 18
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/synthesizer.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/synthesizer.ts src/observability/engine/synthesizer.test.ts
git commit -m "observability: synthesizer composeAvailability (call probe on all 8 adapters)"
```

---

## Task 18: Synthesizer — read and merge per-worktree ledgers

**Files:**
- Modify: `src/observability/engine/synthesizer.ts`
- Modify: `src/observability/engine/synthesizer.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/engine/synthesizer.test.ts`:

```typescript
import { writeEvent } from './ledger-writer'
import { harvestWorktree } from './harvester'
import { ensureIdentity } from './identity'
import { readMergedLedger } from './synthesizer'

describe('synthesizer.readMergedLedger', () => {
  let primary: string
  let wtA: string
  let wtB: string

  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-rl-pri-'))
    wtA = mkdtempSync(join(tmpdir(), 'observe-rl-A-'))
    wtB = mkdtempSync(join(tmpdir(), 'observe-rl-B-'))
    ensureIdentity(wtA, 'agent-alice')
    ensureIdentity(wtB, 'agent-bob')
    await writeEvent(wtA, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await writeEvent(wtB, { type: 'task_claimed', branch: 'b', task_id: 'T-2', payload: { task_title: 'B' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtB })
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wtA, { recursive: true, force: true })
    rmSync(wtB, { recursive: true, force: true })
  })

  it('merges events from multiple worktree archives sorted by ts', async () => {
    const merged = await readMergedLedger(primary)
    expect(merged.events).toHaveLength(2)
    expect(merged.events.map((e) => e.task_id).sort()).toEqual(['T-1', 'T-2'])
    expect(merged.summary.events_read).toBe(2)
    expect(merged.summary.sources).toHaveLength(2)
  })

  it('skips malformed trailing lines and reports them in summary', async () => {
    // Append a malformed line to one of the active archives
    const id = JSON.parse(readFileSync(join(wtA, '.scaffold/identity.json'), 'utf8'))
    const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
    writeFileSync(archived, readFileSync(archived, 'utf8') + '{not-json\n', { flag: 'w' })
    const merged = await readMergedLedger(primary)
    expect(merged.summary.malformed_lines).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/synthesizer.test.ts
```

Expected: FAIL — `readMergedLedger` not exported.

- [ ] **Step 3: Implement `readMergedLedger` in `synthesizer.ts`**

Append to `src/observability/engine/synthesizer.ts`:

```typescript
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Event } from './types'
import { archiveDir } from './harvester'

export interface MergedLedger {
  events: Event[]
  summary: { events_read: number; malformed_lines: number; sources: { worktree_id: string; events: number; harvested_at?: string }[] }
}

export async function readMergedLedger(primaryRoot: string): Promise<MergedLedger> {
  const activeDir = join(archiveDir(primaryRoot), 'active')
  if (!existsSync(activeDir)) {
    return { events: [], summary: { events_read: 0, malformed_lines: 0, sources: [] } }
  }
  const events: Event[] = []
  const sources: MergedLedger['summary']['sources'] = []
  let malformed = 0
  const seen = new Set<string>()

  for (const file of readdirSync(activeDir)) {
    if (!file.endsWith('.jsonl')) continue
    const path = join(activeDir, file)
    const worktree_id = file.replace(/\.jsonl$/, '')
    let perSource = 0
    let txt: string
    try { txt = readFileSync(path, 'utf8') } catch { continue }
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue
      try {
        const ev = JSON.parse(line) as Event
        if (seen.has(ev.event_id)) continue
        seen.add(ev.event_id)
        events.push(ev)
        perSource++
      } catch {
        malformed++
      }
    }
    const harvested_at = statSync(path).mtime.toISOString()
    sources.push({ worktree_id, events: perSource, harvested_at })
  }

  events.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1
    return a.event_id < b.event_id ? -1 : 1
  })

  return { events, summary: { events_read: events.length, malformed_lines: malformed, sources } }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/synthesizer.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/synthesizer.ts src/observability/engine/synthesizer.test.ts
git commit -m "observability: synthesizer readMergedLedger (multi-worktree merge, dedupe by event_id, malformed-line tolerance)"
```

---

## Task 19: Synthesizer — minimal Snapshot composer

**Files:**
- Modify: `src/observability/engine/synthesizer.ts`
- Modify: `src/observability/engine/synthesizer.test.ts`

This produces the subset of `Snapshot` that the ledger alone supports: `active_agents`, `in_flight`, `completed_in_window`, `recent_decisions`, `blocked`. Fields that need the doc-graph (`upcoming`, `story_coverage`) stay empty arrays in Plan 1 — Plan 2 fills them.

- [ ] **Step 1: Append the failing test**

Append to `src/observability/engine/synthesizer.test.ts`:

```typescript
import { composeSnapshot } from './synthesizer'

describe('synthesizer.composeSnapshot', () => {
  let primary: string, wtA: string

  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-cs-pri-'))
    wtA = mkdtempSync(join(tmpdir(), 'observe-cs-A-'))
    ensureIdentity(wtA, 'agent-alice')
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wtA, { recursive: true, force: true })
  })

  it('places a claimed-but-not-completed task into in_flight + active_agents', async () => {
    await writeEvent(wtA, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    const merged = await readMergedLedger(primary)
    const snap = composeSnapshot({ events: merged.events, sinceHours: 24, currentPhase: 'build' })
    expect(snap.in_flight).toHaveLength(1)
    expect(snap.in_flight[0].task_id).toBe('T-1')
    expect(snap.active_agents).toHaveLength(1)
    expect(snap.active_agents[0].current_task?.id).toBe('T-1')
    expect(snap.completed_in_window).toHaveLength(0)
  })

  it('moves a task from in_flight to completed_in_window after task_completed', async () => {
    await writeEvent(wtA, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await writeEvent(wtA, { type: 'task_completed', branch: 'a', task_id: 'T-1', payload: { outcome: 'pr_submitted', pr_number: 42 } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    const merged = await readMergedLedger(primary)
    const snap = composeSnapshot({ events: merged.events, sinceHours: 24, currentPhase: 'build' })
    expect(snap.in_flight).toHaveLength(0)
    expect(snap.completed_in_window).toHaveLength(1)
    expect(snap.completed_in_window[0].pr_number).toBe(42)
    expect(snap.active_agents[0].current_task).toBeNull()
  })

  it('lists recent decisions in reverse-chronological order', async () => {
    await writeEvent(wtA, { type: 'decision_recorded', branch: 'a', task_id: null, payload: { key: 'older', summary: 'a', affects: [] } })
    await new Promise((r) => setTimeout(r, 10))
    await writeEvent(wtA, { type: 'decision_recorded', branch: 'a', task_id: null, payload: { key: 'newer', summary: 'b', affects: [] } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wtA })
    const merged = await readMergedLedger(primary)
    const snap = composeSnapshot({ events: merged.events, sinceHours: 24, currentPhase: 'build' })
    expect(snap.recent_decisions.map((d) => d.key)).toEqual(['newer', 'older'])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/synthesizer.test.ts
```

Expected: FAIL — `composeSnapshot` not exported.

- [ ] **Step 3: Implement `composeSnapshot`**

Append to `src/observability/engine/synthesizer.ts`:

```typescript
import type { Event, Snapshot, ActiveAgent, TaskInFlight, TaskCompletion, BlockedTask, DecisionSummary } from './types'

export interface ComposeSnapshotInput {
  events: Event[]
  sinceHours: number
  currentPhase: string
}

export function composeSnapshot(input: ComposeSnapshotInput): Snapshot {
  const cutoff = Date.now() - input.sinceHours * 3600 * 1000
  const events = input.events // already time-sorted by readMergedLedger

  // Per-actor latest state
  const inFlightByActor = new Map<string, TaskInFlight>()    // actor_label -> in-flight task
  const completed: TaskCompletion[] = []
  const blocked: BlockedTask[] = []
  const decisions: DecisionSummary[] = []
  const claimsByTask = new Map<string, Event & { type: 'task_claimed' }>() // task_id -> claim event

  for (const e of events) {
    const ts = Date.parse(e.ts)
    if (Number.isNaN(ts)) continue

    if (e.type === 'task_claimed' && e.task_id) {
      claimsByTask.set(e.task_id, e as Event & { type: 'task_claimed' })
      const ageH = Math.max(0, (Date.now() - ts) / 3600 / 1000)
      inFlightByActor.set(e.actor_label, {
        task_id: e.task_id,
        task_title: e.payload.task_title,
        story_id: e.payload.story_id,
        by: e.actor_label,
        claimed_at: e.ts,
        age_hours: round1(ageH),
        branch: e.branch,
      })
    } else if (e.type === 'task_completed' && e.task_id) {
      // Remove from in-flight
      const cur = inFlightByActor.get(e.actor_label)
      if (cur && cur.task_id === e.task_id) inFlightByActor.delete(e.actor_label)
      // Surface in completed_in_window if within window
      if (ts >= cutoff) {
        const claim = claimsByTask.get(e.task_id)
        completed.push({
          task_id: e.task_id,
          task_title: claim?.payload.task_title ?? '(unknown)',
          outcome: e.payload.outcome,
          pr_number: e.payload.pr_number,
          by: e.actor_label,
        })
      }
    } else if (e.type === 'blocker_hit') {
      const ageH = Math.max(0, (Date.now() - ts) / 3600 / 1000)
      blocked.push({
        task_id: e.task_id ?? '(none)',
        task_title: claimsByTask.get(e.task_id ?? '')?.payload.task_title ?? '(unknown)',
        blocker_kind: e.payload.kind,
        reason: e.payload.summary,
        blocked_at: e.ts,
        age_hours: round1(ageH),
      })
    } else if (e.type === 'blocker_resolved') {
      // Remove the most-recent matching blocker
      const idx = [...blocked].reverse().findIndex((b) => e.payload.references.length === 0 || b.task_id === e.task_id)
      if (idx >= 0) blocked.splice(blocked.length - 1 - idx, 1)
    } else if (e.type === 'decision_recorded') {
      decisions.push({
        decision_id: `decision:${e.payload.key}`,
        key: e.payload.key,
        summary: e.payload.summary,
        recorded_at: e.ts,
        affects: e.payload.affects,
      })
    }
  }

  decisions.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
  completed.sort((a, b) => (b.task_id ?? '').localeCompare(a.task_id ?? ''))

  // Build active_agents from per-actor in-flight tasks plus actors with zero-tasks-but-still-have-events
  const actorsSeen = new Set(events.map((e) => e.actor_label))
  const activeAgents: ActiveAgent[] = [...actorsSeen].map((actor) => {
    const ev = events.findLast((e) => e.actor_label === actor)
    const inflight = inFlightByActor.get(actor) ?? null
    return {
      worktree_id: ev?.worktree_id ?? '',
      actor_label: actor,
      branch: ev?.branch ?? '',
      current_task: inflight ? { id: inflight.task_id, title: inflight.task_title, claimed_at: inflight.claimed_at } : null,
      open_pr: null, // populated from gh adapter in Plan 2 — out of scope here
    }
  })

  return {
    current_phase: input.currentPhase,
    active_agents: activeAgents,
    completed_in_window: completed,
    in_flight: [...inFlightByActor.values()],
    blocked,
    upcoming: [],          // requires doc-graph (Plan 2)
    recent_decisions: decisions.slice(0, 10),
    story_coverage: [],    // requires doc-graph (Plan 2)
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/synthesizer.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/synthesizer.ts src/observability/engine/synthesizer.test.ts
git commit -m "observability: synthesizer composeSnapshot (active_agents, in_flight, completed, decisions, blocked)"
```

---

## Task 20: Engine API entry point — `runProgress`

**Files:**
- Create: `src/observability/engine/api.ts`
- Create: `src/observability/engine/api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runProgress } from './api'
import { ensureIdentity } from './identity'
import { writeEvent } from './ledger-writer'
import { harvestWorktree } from './harvester'

describe('api.runProgress', () => {
  let primary: string, wt: string
  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-api-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-api-wt-'))
    execSync('git init -q', { cwd: primary })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: primary, shell: '/bin/sh' })
    ensureIdentity(wt, 'agent-alice')
    await writeEvent(wt, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wt })
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  })

  it('produces an EngineOutput with availability + snapshot + ledger summary', async () => {
    const out = await runProgress({ primaryRoot: primary, sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(out.schema_version).toBe('1.0')
    expect(out.invocation.command).toBe('progress')
    expect(out.availability.git.status).toBe('available')
    expect(out.availability.ledger.events_read).toBe(1)
    expect(out.snapshot?.in_flight[0].task_id).toBe('T-1')
    expect(out.findings).toEqual([])
    expect(out.summary.total).toBe(0)
    expect(out.verdict).toBe('pass')
    expect(out.fix_threshold).toBe('P2')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/api.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `api.ts`**

Create `src/observability/engine/api.ts`:

```typescript
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineOutput, Severity, Verdict, FindingsSummary } from './types'
import { composeAvailability, readMergedLedger, composeSnapshot } from './synthesizer'

export interface RunProgressInput {
  primaryRoot: string
  sinceHours: number
  ghBin?: string
  bdBin?: string
  args?: Record<string, unknown>
}

const EMPTY_SUMMARY: FindingsSummary = {
  total: 0,
  by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
  by_severity_status: {
    P0: { open: 0, acknowledged: 0, skipped: 0 },
    P1: { open: 0, acknowledged: 0, skipped: 0 },
    P2: { open: 0, acknowledged: 0, skipped: 0 },
    P3: { open: 0, acknowledged: 0, skipped: 0 },
  },
  blocking: 0, acknowledged: 0, skipped_lenses: 0,
}

function scaffoldVersion(): string {
  // Read from package.json sitting at the repo root next to dist.
  try {
    const cands = [join(__dirname, '../../../package.json'), join(process.cwd(), 'package.json')]
    for (const p of cands) {
      if (existsSync(p)) {
        const pkg = JSON.parse(readFileSync(p, 'utf8')) as { version?: string }
        if (pkg.version) return pkg.version
      }
    }
  } catch { /* fall through */ }
  return '0.0.0'
}

export async function runProgress(input: RunProgressInput): Promise<EngineOutput> {
  const started_at = new Date().toISOString()
  const merged = await readMergedLedger(input.primaryRoot)
  const availability = await composeAvailability(input.primaryRoot, { ghBin: input.ghBin, bdBin: input.bdBin })
  availability.ledger = merged.summary

  const snapshot = composeSnapshot({
    events: merged.events,
    sinceHours: input.sinceHours,
    currentPhase: 'build', // Plan 6 wires this from .scaffold/state.json
  })

  const fix_threshold: Severity = 'P2' // Plan 2 reads from .mmr.yaml; v1 uses the default
  const verdict: Verdict = 'pass'       // progress always passes per spec

  return {
    schema_version: '1.0',
    invocation: { command: 'progress', args: input.args ?? {}, started_at, completed_at: new Date().toISOString(), scaffold_version: scaffoldVersion() },
    availability,
    snapshot,
    replay: null,             // Plan 5 implements replay
    findings: [],
    needs_attention: [],      // Plan 5 implements stall detection
    graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
    fix_threshold,
    verdict,
    summary: EMPTY_SUMMARY,
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/api.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/api.ts src/observability/engine/api.test.ts
git commit -m "observability: add runProgress() API (orchestrate ledger + adapters into EngineOutput)"
```

---

## Task 21: CLI — `scaffold observe event` subcommand

**Files:**
- Create: `src/cli/commands/observe.ts`
- Create: `src/cli/commands/observe.test.ts`

The observe command tree is implemented as a yargs (or scaffold's existing CLI library — reuse what other commands use) sub-tree. Look at an existing command like `src/cli/commands/next.ts` or `status.ts` to match the project's exact pattern; the Step 3 code below is illustrative.

- [ ] **Step 1: Inspect the existing CLI scaffolding**

```bash
ls src/cli/commands/
head -30 src/cli/index.ts
head -30 src/cli/commands/next.ts 2>/dev/null || head -30 src/cli/commands/status.ts
```

Note the command-registration pattern (yargs `.command()` builder, or scaffold's wrapper). Match it in Step 3.

- [ ] **Step 2: Write the failing test**

Create `src/cli/commands/observe.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleEvent } from './observe'
import { ensureIdentity } from '../../observability/engine/identity'

describe('observe event subcommand', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-cli-'))
    ensureIdentity(dir, 'agent-alice')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('writes a task_claimed event from CLI args', async () => {
    const exitCode = await handleEvent({
      cwd: dir,
      type: 'task_claimed',
      branch: 'feat',
      taskId: 'T-001',
      keyValues: { 'task-title': 'Hello world', 'wave': 'wave-2' },
    })
    expect(exitCode).toBe(0)
    const path = join(dir, '.scaffold/activity.jsonl')
    expect(existsSync(path)).toBe(true)
    const obj = JSON.parse(readFileSync(path, 'utf8').trim())
    expect(obj.task_id).toBe('T-001')
    expect(obj.payload.task_title).toBe('Hello world')
    expect(obj.payload.wave).toBe('wave-2')
  })

  it('exits with code 2 on schema-invalid input (missing payload field)', async () => {
    const exitCode = await handleEvent({
      cwd: dir,
      type: 'task_claimed',
      branch: 'feat',
      taskId: 'T-001',
      keyValues: {},   // missing task-title
    })
    expect(exitCode).toBe(2)
  })

  it('coerces pr-number to a number for pr_opened events', async () => {
    const exitCode = await handleEvent({
      cwd: dir,
      type: 'pr_opened',
      branch: 'feat',
      taskId: 'T-001',
      keyValues: { 'pr-number': '42' },
    })
    expect(exitCode).toBe(0)
    const obj = JSON.parse(readFileSync(join(dir, '.scaffold/activity.jsonl'), 'utf8').trim())
    expect(obj.payload.pr_number).toBe(42)
  })
})
```

- [ ] **Step 3: Implement `observe.ts` (event handler first)**

Create `src/cli/commands/observe.ts`:

```typescript
import { writeEvent } from '../../observability/engine/ledger-writer'
import type { EventType } from '../../observability/engine/types'
import { EVENT_PAYLOAD_KEYS } from '../../observability/engine/event-schemas'

export interface HandleEventInput {
  cwd: string
  type: EventType
  branch: string
  taskId: string | null
  keyValues: Record<string, string>      // raw string values from --key=value flags
}

const NUMERIC_KEYS = new Set(['pr-number'])
const ARRAY_KEYS = new Set(['affects', 'links', 'references'])
const BOOLEAN_KEYS = new Set(['unplanned'])

function snakeKey(k: string): string { return k.replace(/-/g, '_') }

function coerce(rawKey: string, raw: string): unknown {
  if (NUMERIC_KEYS.has(rawKey)) return Number(raw)
  if (BOOLEAN_KEYS.has(rawKey)) return raw === 'true'
  if (ARRAY_KEYS.has(rawKey)) return raw.split(',').map((s) => s.trim()).filter(Boolean)
  return raw
}

function buildPayload(type: EventType, kv: Record<string, string>): Record<string, unknown> {
  const allowed = new Set(EVENT_PAYLOAD_KEYS[type])
  const out: Record<string, unknown> = {}
  for (const [rawKey, raw] of Object.entries(kv)) {
    const snake = snakeKey(rawKey)
    if (allowed.has(snake)) out[snake] = coerce(rawKey, raw)
  }
  return out
}

export async function handleEvent(input: HandleEventInput): Promise<number> {
  const payload = buildPayload(input.type, input.keyValues)
  try {
    await writeEvent(input.cwd, {
      type: input.type,
      branch: input.branch,
      task_id: input.taskId,
      payload,
    })
    return 0
  } catch (err: unknown) {
    const msg = (err as Error).message
    process.stderr.write(`scaffold observe event: ${msg}\n`)
    if (/validation failed|too large/i.test(msg)) return 2
    return 3
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts
git commit -m "observability: add CLI handleEvent (writes ledger events from --key=value flags)"
```

---

## Task 22: CLI — `scaffold observe progress` subcommand

**Files:**
- Modify: `src/cli/commands/observe.ts`
- Modify: `src/cli/commands/observe.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/cli/commands/observe.test.ts`:

```typescript
import { handleProgress } from './observe'
import { writeEvent } from '../../observability/engine/ledger-writer'
import { harvestWorktree } from '../../observability/engine/harvester'
import { execSync } from 'node:child_process'

describe('observe progress subcommand', () => {
  let primary: string, wt: string
  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-progress-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-progress-wt-'))
    execSync('git init -q', { cwd: primary })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: primary, shell: '/bin/sh' })
    ensureIdentity(wt, 'agent-alice')
    await writeEvent(wt, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wt })
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  })

  it('--json prints the EngineOutput JSON to stdout and exits 0', async () => {
    let captured = ''
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (s: string | Uint8Array) => { captured += String(s); return true }
    try {
      const code = await handleProgress({ cwd: primary, json: true, sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
      expect(code).toBe(0)
    } finally {
      process.stdout.write = origWrite
    }
    const obj = JSON.parse(captured)
    expect(obj.schema_version).toBe('1.0')
    expect(obj.snapshot.in_flight[0].task_id).toBe('T-1')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: FAIL — `handleProgress` not exported.

- [ ] **Step 3: Add `handleProgress` to `observe.ts`**

Append to `src/cli/commands/observe.ts`:

```typescript
import { runProgress } from '../../observability/engine/api'
import { redactRendered } from '../../observability/engine/redact'

export interface HandleProgressInput {
  cwd: string
  json: boolean
  sinceHours: number
  maskPaths?: boolean
  ghBin?: string
  bdBin?: string
}

export async function handleProgress(input: HandleProgressInput): Promise<number> {
  try {
    const out = await runProgress({
      primaryRoot: input.cwd,
      sinceHours: input.sinceHours,
      ghBin: input.ghBin,
      bdBin: input.bdBin,
    })
    if (input.json) {
      const blob = JSON.stringify(out, null, 2)
      // --json defaults to secrets-only redaction (paths kept for navigation);
      // --mask-paths opts in to the persisted-output policy.
      process.stdout.write((input.maskPaths ? redactRendered(blob) : blob) + '\n')
      return 0
    }
    // Terminal renderer comes in Task 24; for now print a one-line summary
    process.stdout.write(`build observability: ${out.snapshot?.in_flight.length ?? 0} in-flight, ${out.snapshot?.completed_in_window.length ?? 0} completed in window\n`)
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe progress: ${(err as Error).message}\n`)
    return 3
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS, 4 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts
git commit -m "observability: add CLI handleProgress (--json mode, basic terminal one-liner)"
```

---

## Task 23: CLI — `scaffold observe harvest` subcommand

**Files:**
- Modify: `src/cli/commands/observe.ts`
- Modify: `src/cli/commands/observe.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/cli/commands/observe.test.ts`:

```typescript
import { handleHarvest } from './observe'

describe('observe harvest subcommand', () => {
  let primary: string, wt: string
  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-h-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-h-wt-'))
    ensureIdentity(wt, 'agent-alice')
    await writeEvent(wt, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  })

  it('flushes a worktree ledger to the central archive', async () => {
    const code = await handleHarvest({ primaryRoot: primary, worktreeRoot: wt })
    expect(code).toBe(0)
    const id = JSON.parse(readFileSync(join(wt, '.scaffold/identity.json'), 'utf8'))
    const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
    expect(existsSync(archived)).toBe(true)
  })

  it('returns 3 when worktree has no identity.json', async () => {
    const noid = mkdtempSync(join(tmpdir(), 'observe-noid-'))
    try {
      const code = await handleHarvest({ primaryRoot: primary, worktreeRoot: noid })
      expect(code).toBe(3)
    } finally {
      rmSync(noid, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: FAIL — `handleHarvest` not exported.

- [ ] **Step 3: Add `handleHarvest`**

Append to `src/cli/commands/observe.ts`:

```typescript
import { harvestWorktree } from '../../observability/engine/harvester'

export interface HandleHarvestInput {
  primaryRoot: string
  worktreeRoot: string
}

export async function handleHarvest(input: HandleHarvestInput): Promise<number> {
  try {
    await harvestWorktree(input)
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe harvest: ${(err as Error).message}\n`)
    return 3
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS, 6 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts
git commit -m "observability: add CLI handleHarvest (worktree -> central archive)"
```

---

## Task 24: Terminal renderer for snapshot

**Files:**
- Create: `src/observability/renderers/_lib.ts`
- Create: `src/observability/renderers/terminal.ts`
- Create: `src/observability/renderers/terminal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/renderers/terminal.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderProgressTerminal } from './terminal'
import type { EngineOutput } from '../engine/types'

const fixtureOutput: EngineOutput = {
  schema_version: '1.0',
  invocation: { command: 'progress', args: {}, started_at: '2026-04-30T14:00:00Z', completed_at: '2026-04-30T14:00:01Z', scaffold_version: '3.25.1' },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable' }, pipeline_docs: { status: 'available' },
    tests: { status: 'available' }, state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 4, malformed_lines: 0, sources: [{ worktree_id: 'wid-a', events: 4 }] },
  },
  snapshot: {
    current_phase: 'build',
    active_agents: [{ worktree_id: 'wid-a', actor_label: 'agent-alice', branch: 'feat-auth',
      current_task: { id: 'T-031', title: 'refresh token rotation', claimed_at: '2026-04-30T13:55:00Z' }, open_pr: null }],
    completed_in_window: [{ task_id: 'T-029', task_title: 'login bug', outcome: 'pr_submitted', pr_number: 40, by: 'agent-alice' }],
    in_flight: [{ task_id: 'T-031', task_title: 'refresh token rotation', by: 'agent-alice', claimed_at: '2026-04-30T13:55:00Z', age_hours: 0.1, branch: 'feat-auth' }],
    blocked: [], upcoming: [], recent_decisions: [{ decision_id: 'decision:foo', key: 'foo', summary: 'bar', recorded_at: '2026-04-30T13:00:00Z', affects: [] }],
    story_coverage: [],
  },
  replay: null, findings: [], needs_attention: [],
  graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
  fix_threshold: 'P2', verdict: 'pass',
  summary: { total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 }, by_severity_status: { P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 } }, blocking: 0, acknowledged: 0, skipped_lenses: 0 },
}

describe('renderProgressTerminal', () => {
  it('produces a snapshot summary with active agents, in-flight, and completed sections', () => {
    const out = renderProgressTerminal(fixtureOutput)
    expect(out).toContain('build observability — progress')
    expect(out).toContain('active agents')
    expect(out).toContain('agent-alice')
    expect(out).toContain('T-031')
    expect(out).toContain('refresh token rotation')
    expect(out).toContain('completed in window')
    expect(out).toContain('PR #40')
    expect(out).toContain('availability:')
    expect(out).toContain('git ✓')
    expect(out).toContain('beads —')
  })

  it('omits empty sections (no Active Agents header when active_agents is empty)', () => {
    const empty = { ...fixtureOutput, snapshot: { ...fixtureOutput.snapshot!, active_agents: [], in_flight: [], completed_in_window: [], recent_decisions: [] } }
    const out = renderProgressTerminal(empty)
    expect(out).not.toContain('active agents')
    expect(out).not.toContain('completed in window')
  })

  it('redacts secrets from rendered output', () => {
    const tainted: EngineOutput = JSON.parse(JSON.stringify(fixtureOutput))
    tainted.snapshot!.recent_decisions[0].summary = 'token=ghp_1234567890abcdefABCDEF1234567890abcdef'
    const out = renderProgressTerminal(tainted)
    expect(out).not.toContain('ghp_1234567890abcdefABCDEF1234567890abcdef')
    expect(out).toContain('[REDACTED:')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/terminal.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `_lib.ts` and `terminal.ts`**

Create `src/observability/renderers/_lib.ts`:

```typescript
import type { AdapterStatus, AvailabilityMap, Severity, Verdict } from '../engine/types'

export function severityBadge(s: Severity): string {
  return { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' }[s]
}

export function verdictToken(v: Verdict): string {
  return { pass: 'pass', 'degraded-pass': 'degraded-pass', blocked: 'blocked' }[v]
}

export function adapterGlyph(s: AdapterStatus): string {
  return s.status === 'available' ? '✓' : s.status === 'degraded' ? '~' : '—'
}

export function availabilityLine(a: AvailabilityMap): string {
  const ord: (keyof AvailabilityMap)[] = ['git', 'gh', 'pipeline_docs', 'tests', 'state', 'beads', 'mmr', 'audit_history']
  return ord.map((k) => `${k} ${adapterGlyph(a[k] as AdapterStatus)}`).join(' · ')
}
```

Create `src/observability/renderers/terminal.ts`:

```typescript
import type { EngineOutput } from '../engine/types'
import { availabilityLine } from './_lib'
import { scrubSecrets } from '../engine/redact'

function fmtLocalDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function renderProgressTerminal(out: EngineOutput): string {
  const lines: string[] = []
  const sinceHours = Number(out.invocation.args.sinceHours ?? 24)
  lines.push(`build observability — progress (last ${sinceHours}h · phase: ${out.snapshot?.current_phase ?? 'unknown'})`)
  lines.push('')

  const snap = out.snapshot
  if (snap && snap.active_agents.length > 0) {
    lines.push(`active agents (${snap.active_agents.length})`)
    for (const a of snap.active_agents) {
      const taskBit = a.current_task ? ` · ${a.current_task.id ?? '(unplanned)'} ${a.current_task.title}` : ' · idle'
      const prBit = a.open_pr ? ` · PR #${a.open_pr.number}` : ''
      lines.push(`  ${a.actor_label}${taskBit}  branch ${a.branch}${prBit}`)
    }
    lines.push('')
  }
  if (snap && snap.in_flight.length > 0) {
    lines.push(`in flight (${snap.in_flight.length})`)
    for (const t of snap.in_flight) {
      lines.push(`  ${t.task_id} ${t.task_title}  by ${t.by} · age ${t.age_hours}h · branch ${t.branch}`)
    }
    lines.push('')
  }
  if (snap && snap.completed_in_window.length > 0) {
    lines.push(`completed in window (${snap.completed_in_window.length})`)
    for (const c of snap.completed_in_window) {
      const pr = c.pr_number ? ` PR #${c.pr_number}` : ''
      lines.push(`  ✓ ${c.task_id ?? '(unplanned)'} ${c.task_title}${pr}  by ${c.by}`)
    }
    lines.push('')
  }
  if (snap && snap.recent_decisions.length > 0) {
    lines.push(`recent decisions (${snap.recent_decisions.length})`)
    for (const d of snap.recent_decisions.slice(0, 5)) {
      lines.push(`  ${d.key.padEnd(24).slice(0, 24)} ${d.summary}`)
    }
    lines.push('')
  }
  lines.push(`availability: ${availabilityLine(out.availability)}`)
  lines.push(`                              (✓ available  · ~ degraded  · — unavailable)`)

  return scrubSecrets(lines.join('\n'))
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/terminal.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Wire the renderer into `handleProgress`**

In `src/cli/commands/observe.ts`, replace the placeholder one-liner with the renderer call:

```typescript
import { renderProgressTerminal } from '../../observability/renderers/terminal'
// (other imports unchanged)

export async function handleProgress(input: HandleProgressInput): Promise<number> {
  try {
    const out = await runProgress({
      primaryRoot: input.cwd,
      sinceHours: input.sinceHours,
      ghBin: input.ghBin,
      bdBin: input.bdBin,
      args: { sinceHours: input.sinceHours },
    })
    if (input.json) {
      const blob = JSON.stringify(out, null, 2)
      process.stdout.write((input.maskPaths ? redactRendered(blob) : blob) + '\n')
      return 0
    }
    process.stdout.write(renderProgressTerminal(out) + '\n')
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe progress: ${(err as Error).message}\n`)
    return 3
  }
}
```

- [ ] **Step 6: Re-run all observe tests**

```bash
npx vitest run src/cli/commands/observe.test.ts src/observability/renderers/terminal.test.ts
```

Expected: PASS — all observe + terminal-renderer tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/observability/renderers/_lib.ts src/observability/renderers/terminal.ts src/observability/renderers/terminal.test.ts src/cli/commands/observe.ts
git commit -m "observability: add terminal renderer for progress snapshot (sections, availability line, redaction)"
```

---

## Task 25: Register `scaffold observe` in the top-level CLI

**Files:**
- Modify: `src/cli/index.ts`

This task wires the observe command tree into scaffold's existing CLI. The exact builder code depends on the project's CLI library (yargs, commander, custom). Read `src/cli/index.ts` and a peer command (`next`, `status`) to match the convention.

- [ ] **Step 1: Read the peer command and the CLI index**

```bash
cat src/cli/index.ts | head -60
ls src/cli/commands/
```

Identify the registration pattern (e.g., `yargs.command(...)` or a hand-rolled `if (cmd === 'next')`).

- [ ] **Step 2: Add `observe` registration to `src/cli/index.ts`**

If the project uses yargs (most likely), add the registration block. Adapt the dispatch pattern to match what's already there. Indicative form:

```typescript
import { handleEvent, handleProgress, handleHarvest } from './commands/observe'
import type { EventType } from '../observability/engine/types'

// Inside the yargs builder:
.command('observe <subcommand>', 'Build observability commands', (sub) => sub
  .command('event <type>', 'Write a ledger event', (y) =>
    y.positional('type', { type: 'string', demandOption: true })
     .option('branch', { type: 'string', demandOption: true })
     .option('task-id', { type: 'string' })
     .option('actor-label', { type: 'string' }), // optional override; defaults to identity.json
    async (argv) => {
      const kv: Record<string, string> = {}
      for (const [k, v] of Object.entries(argv)) {
        if (['_', '$0', 'subcommand', 'branch', 'task-id', 'actor-label', 'type'].includes(k)) continue
        if (typeof v === 'string') kv[k] = v
        else if (typeof v === 'number' || typeof v === 'boolean') kv[k] = String(v)
      }
      const code = await handleEvent({
        cwd: process.cwd(),
        type: argv.type as EventType,
        branch: argv.branch as string,
        taskId: (argv.taskId as string | undefined) ?? null,
        keyValues: kv,
      })
      process.exit(code)
    })
  .command('progress', 'Show build progress snapshot', (y) =>
    y.option('json', { type: 'boolean', default: false })
     .option('mask-paths', { type: 'boolean', default: false })
     .option('since-hours', { type: 'number', default: 24 }),
    async (argv) => {
      const code = await handleProgress({
        cwd: process.cwd(),
        json: !!argv.json,
        maskPaths: !!argv.maskPaths,
        sinceHours: argv.sinceHours as number,
      })
      process.exit(code)
    })
  .command('harvest', 'Flush a worktree ledger to the primary archive', (y) =>
    y.option('worktree', { type: 'string', demandOption: true }),
    async (argv) => {
      const code = await handleHarvest({
        primaryRoot: process.cwd(),
        worktreeRoot: argv.worktree as string,
      })
      process.exit(code)
    })
  .demandCommand(1, 'observe requires a subcommand: event | progress | harvest'))
```

If the CLI is hand-rolled, add an `if (cmd === 'observe')` branch following the same shape. Either way, keep these helpers exported so tests can reach them directly (Task 21–23 already validated the handlers in isolation).

- [ ] **Step 3: Build and smoke-test the CLI binary**

```bash
npm run build
node dist/cli/index.js observe progress --json --since-hours 24 | head -5
```

Expected: prints a JSON object with `"schema_version": "1.0"`. May exit zero with degraded availability if you have no ledger events yet — that's fine.

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "cli: register scaffold observe (event, progress, harvest)"
```

---

## Task 26: Update `setup-agent-worktree.sh` to write `.scaffold/identity.json`

**Files:**
- Modify: `scripts/setup-agent-worktree.sh`

- [ ] **Step 1: Read the current script**

```bash
cat scripts/setup-agent-worktree.sh
```

Locate the section after `git worktree add …` succeeds.

- [ ] **Step 2: Add identity-file generation after worktree creation**

Append (or insert immediately after the `git worktree add` block in `scripts/setup-agent-worktree.sh`):

```bash
# ─── Write .scaffold/identity.json (for build observability) ────────────
mkdir -p "$worktree_dir/.scaffold"
if [ ! -f "$worktree_dir/.scaffold/identity.json" ]; then
    if command -v uuidgen >/dev/null 2>&1; then
        identity_uuid="$(uuidgen | tr 'A-Z' 'a-z')"
    else
        # Fallback: build a UUID-shaped string from /dev/urandom hex
        identity_uuid="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n' | sed -E 's/^(.{8})(.{4})(.{4})(.{4})(.{12})$/\1-\2-\3-\4-\5/')"
    fi
    created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '{\n  "worktree_id": "%s",\n  "worktree_label": "%s",\n  "created_at": "%s"\n}\n' \
        "$identity_uuid" "$agent_suffix" "$created_at" \
        > "$worktree_dir/.scaffold/identity.json"
    echo "Wrote $worktree_dir/.scaffold/identity.json (worktree_id=$identity_uuid)"
fi
```

- [ ] **Step 3: Verify with shellcheck**

```bash
make lint
```

Expected: no new ShellCheck issues.

- [ ] **Step 4: Smoke-test by re-running the setup script in a sandbox**

```bash
( cd /tmp && rm -rf sandbox-scaffold && mkdir sandbox-scaffold && cd sandbox-scaffold && git init -q && git -c init.defaultBranch=main commit --allow-empty -m init -q && SCRIPT_DIR="$(pwd)/$(dirname /Users/kenallred/Documents/dev-projects/scaffold/scripts/setup-agent-worktree.sh)" REPO_DIR="$(pwd)" bash /Users/kenallred/Documents/dev-projects/scaffold/scripts/setup-agent-worktree.sh testagent && cat ../sandbox-scaffold-testagent/.scaffold/identity.json )
```

Expected: prints a JSON object with `worktree_id`, `worktree_label: "testagent"`, and a recent `created_at`.

(This is a one-off smoke test; clean up `/tmp/sandbox-scaffold*` after.)

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-agent-worktree.sh
git commit -m "setup-agent-worktree: write .scaffold/identity.json (UUID + label + timestamp)"
```

---

## Task 27: bats end-to-end smoke test

**Files:**
- Create: `tests/observability/observe.bats`

- [ ] **Step 1: Write the failing bats test**

Create `tests/observability/observe.bats`:

```bash
#!/usr/bin/env bats

setup() {
    SANDBOX="$(mktemp -d)"
    export SANDBOX
    cd "$SANDBOX"
    git init -q
    git config user.email "t@e.com"
    git config user.name "T"
    git -c init.defaultBranch=main commit --allow-empty -m init -q

    # Write identity directly (we are not running setup-agent-worktree.sh in the test).
    mkdir -p .scaffold
    cat > .scaffold/identity.json <<'EOF'
{ "worktree_id": "11111111-1111-4111-8111-111111111111",
  "worktree_label": "primary",
  "created_at": "2026-04-30T14:00:00Z" }
EOF

    BIN="$BATS_TEST_DIRNAME/../../node_modules/.bin/scaffold"
    if [ ! -x "$BIN" ]; then
        # Fall back to running through node + dist
        BIN="node $BATS_TEST_DIRNAME/../../dist/cli/index.js"
    fi
    export BIN
}

teardown() {
    rm -rf "$SANDBOX"
}

@test "observe event task_claimed appends a JSONL line" {
    run $BIN observe event task_claimed --branch=main --task-id=T-001 --task-title="hello"
    [ "$status" -eq 0 ]
    [ -f .scaffold/activity.jsonl ]
    line="$(cat .scaffold/activity.jsonl)"
    [[ "$line" == *'"type":"task_claimed"'* ]]
    [[ "$line" == *'"task_id":"T-001"'* ]]
    [[ "$line" == *'"task_title":"hello"'* ]]
}

@test "observe progress --json includes the freshly-written event" {
    $BIN observe event task_claimed --branch=main --task-id=T-001 --task-title="hello"
    # Harvest is required for the synthesizer to read the per-worktree ledger.
    $BIN observe harvest --worktree="$SANDBOX"

    run $BIN observe progress --json --since-hours=24
    [ "$status" -eq 0 ]
    [[ "$output" == *'"schema_version":"1.0"'* ]]
    [[ "$output" == *'"task_id":"T-001"'* ]]
    [[ "$output" == *'"in_flight"'* ]]
}

@test "observe event with missing required field exits 2" {
    run $BIN observe event task_claimed --branch=main --task-id=T-001
    [ "$status" -eq 2 ]
}

@test "observe progress prints terminal output by default" {
    $BIN observe event task_claimed --branch=main --task-id=T-031 --task-title="refresh token rotation"
    $BIN observe harvest --worktree="$SANDBOX"

    run $BIN observe progress
    [ "$status" -eq 0 ]
    [[ "$output" == *"build observability — progress"* ]]
    [[ "$output" == *"in flight"* ]]
    [[ "$output" == *"T-031"* ]]
    [[ "$output" == *"availability:"* ]]
}
```

- [ ] **Step 2: Run the bats test**

```bash
make test
```

Or, more narrowly:

```bash
bats tests/observability/observe.bats
```

Expected: PASS, 4 cases. May require `npm run build` first if the test is using `node dist/cli/index.js`.

- [ ] **Step 3: Commit**

```bash
git add tests/observability/observe.bats
git commit -m "observability: add bats end-to-end smoke test for observe event/harvest/progress"
```

---

## Task 28: Run `make check-all` and fix any cross-cutting issues

- [ ] **Step 1: Run the full quality gate**

```bash
make check-all
```

Expected: PASS. Common failures and what to do:
- ESLint complaints in new files → run `npx eslint --fix src/observability/ src/cli/commands/observe.ts` and re-commit if changes.
- Type-check failures from missing `@types/uuid` etc. → `npm install --save-dev @types/uuid @types/js-yaml @types/proper-lockfile` and re-commit lock changes.
- Coverage threshold drop (the project uses 84/80/88/84) → if any new file lacks coverage, add tests to bring it up rather than lowering thresholds.
- Bats failures from missing `dist/` → run `npm run build` first, or wire bats setup to do so.

- [ ] **Step 2: Commit any necessary fixes as a single follow-up commit**

```bash
git add -u
git commit -m "observability: fix lint / type-check / coverage gaps surfaced by make check-all"
```

(Skip if step 1 passed cleanly.)

---

## Task 29: Document the observe surface in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find the right insertion point**

Read CLAUDE.md and locate the "Key Commands" table (or its analogue).

- [ ] **Step 2: Add observe rows to the table**

Add the following rows under the existing key-commands list, preserving the table format already in place:

```markdown
| `scaffold observe event <type> ...` | Write a build-observability ledger event |
| `scaffold observe progress` | Show snapshot of in-flight, completed, and recent decisions |
| `scaffold observe harvest --worktree=<path>` | Flush a worktree's ledger to the primary archive |
```

- [ ] **Step 3: Add a short narrative paragraph in the appropriate section**

Find the section that documents project-level conventions (e.g., right after the "Key Commands" table, or under "Project Structure Quick Reference") and add:

> **Build observability** lives under `src/observability/`. Build-command meta-prompts (`single-agent-start`, `multi-agent-start`, the resume variants, `review-pr`, `review-code`) are expected to call `scaffold observe event …` at named workflow points (claim/complete/decision/blocker/PR-open). Plan 1 ships the foundation (ledger, adapters, snapshot); Plans 2+ add the audit, doc-graph, lenses, additional renderers, and operational hooks. See `docs/superpowers/specs/2026-04-30-build-observability-design.md`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document scaffold observe in CLAUDE.md key commands"
```

---

## Task 30: Self-review the plan against the spec — final cross-check

This task is performed by a human (or the executing agent) before declaring Plan 1 done. It is not test-shaped; it's a checklist.

- [ ] **Step 1: Confirm Plan 1 completes the spec's "Engine" subsystem (Section 1) for everything except findings**

Read Section 1 and Section 2 of the spec. Confirm each of the following has a concrete task in this plan:
- Ledger writer (Task 5–6) ✓
- Synthesizer (Task 17–19) ✓
- Source adapters: 8 of them (Tasks 9–16) ✓
- Three renderers — *only terminal in Plan 1* (markdown + dashboard come in Plan 4)
- Multi-worktree concurrency model (Task 6 + Task 7 + Task 26) ✓
- Redaction policy (Task 4) ✓
- Stall detection — *deferred to Plan 5* (the spec lists it under Plan 1's scope but the foundation plan stays focused; needs_attention[] is empty for now)
- The full `EngineOutput` JSON shape (Task 1 + Task 20) ✓ (with empty findings + zero summary + verdict pass for progress)
- CLI: `scaffold observe progress` and `scaffold observe event` (Tasks 21–25) ✓
- `setup-agent-worktree.sh` writes `.scaffold/identity.json` (Task 26) ✓

- [ ] **Step 2: Confirm every type from Section 2 appears in `src/observability/engine/types.ts`**

```bash
grep -E '^export (type|interface|const) ' src/observability/engine/types.ts | sort
```

Compare to Section 2.5–2.8 of the spec. The following types must all be present (verify by name):

`Severity`, `Verdict`, `EventType`, `BaseEvent`, `Event`, `TaskClaimedPayload`, `TaskCompletedPayload`, `DecisionRecordedPayload`, `BlockerHitPayload`, `BlockerResolvedPayload`, `PrOpenedPayload`, `HeartbeatPayload`, `FindingAckPayload`, `AdapterId`, `AdapterStatus`, `AvailabilityMap`, `Finding`, `FixHint`, `Evidence`, `FindingsSummary`, `EngineOutput`, `Snapshot`, `ActiveAgent`, `TaskCompletion`, `TaskInFlight`, `BlockedTask`, `UpcomingTask`, `DecisionSummary`, `StoryCoverageRow`, `ReplayEvent`, `ReplayTimeline`, `NeedsAttentionItem`, `GraphStats`, `WorktreeIdentity`.

(Plan 2 adds doc-graph types — those are not part of Plan 1.)

- [ ] **Step 3: Confirm exit codes from spec Section 5.1 are used**

Spec exit codes: `0` success, `1` audit-blocked (not used in Plan 1 — no audit yet), `2` usage error, `3` engine error, `64–78` reserved adapter-specific. In Plan 1, the relevant codes are 0/2/3; verify by searching:

```bash
grep -rn "return 0\|return 2\|return 3" src/cli/commands/observe.ts
```

Each branch should map to the right code per the spec.

- [ ] **Step 4: Mark this plan complete**

```bash
git add docs/superpowers/plans/2026-04-30-build-observability-foundation.md
git commit -m "plans: build-observability foundation — final self-review pass" --allow-empty
```

---

## Plan 1 — Self-review (built into the plan, run while writing)

Spec-coverage check (every Plan-1-scoped requirement points to a task):

| Spec requirement (section) | Implemented in |
|---|---|
| `EngineOutput` JSON shape and all child types (§2) | Task 1 |
| Worktree identity (`.scaffold/identity.json`) (§1 multi-worktree concurrency) | Task 2, Task 26 |
| Allowed event types + payload allowlist (§2.1, §2.2) | Task 3 |
| Write-time + render-time redaction (§1 redaction policy) | Task 4 |
| Append-only ledger writer with 4 KiB cap and atomicity (§1 ledger location, atomic append) | Task 5 |
| Concurrent-write coordination via flock (§1 concurrent-write coordination) | Task 6 |
| Harvester worktree → central archive (§1 ledger harvesting) | Task 7 |
| Eight source adapters (§1 synthesizer) | Tasks 8–16 |
| Synthesizer produces availability map, ledger summary, snapshot subset (§1 synthesizer, §2.7) | Tasks 17–19 |
| Engine API entry points (§5.2 single audit code path) | Task 20 |
| `scaffold observe event` CLI (§5.1, §1 ledger writer) | Task 21 |
| `scaffold observe progress` CLI with `--json` and `--mask-paths` (§4.6, §5.1) | Tasks 22, 24 |
| `scaffold observe harvest` CLI (§5.1, §5.6) | Task 23 |
| Terminal renderer for snapshot (§4.1) | Task 24 |
| CLI registration in `src/cli/index.ts` (§5.1) | Task 25 |
| `setup-agent-worktree.sh` writes identity.json (§5.6) | Task 26 |
| End-to-end CLI smoke test (§6.3) | Task 27 |
| Quality gate (§6.8) | Task 28 |
| Documentation in CLAUDE.md | Task 29 |

**Out of Plan 1 (handed off to subsequent plans):**

- Stall detection (Plan 5, with replay).
- Replay timeline (`--replay`) (Plan 5).
- Doc-graph + lenses + audit (Plans 2–3).
- Markdown + dashboard renderers + JSON sidecars (Plan 4).
- Phase-boundary triggers + StateManager refactor (Plan 6).
- MMR `doc-conformance` channel (Plan 7).
- `--fix` flow + worktree teardown script (Plan 8).
- `scaffold observe gc` (Plan 4 alongside markdown rotation, or Plan 1.5 if rotation pressure shows up sooner).

Each subsequent plan starts where this one ends and never breaks the contracts established here — types in `engine/types.ts` are stable; the `EngineOutput` shape is stable; renderers consume the JSON, never the filesystem.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-30-build-observability-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a 30-task plan where I want each task verified before the next starts.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Best if you want to watch the work in this session.

**Which approach?**
