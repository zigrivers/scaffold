# Brownfield R4 — Queue Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tier D of `docs/superpowers/specs/2026-07-19-brownfield-adoption-design.md` — the four local merge-queue enhancements, in the spec's §9 order: **D12** gate-result cache by tree hash, **D15** event-driven wake + direct poller kick, **D13** conflict-aware batching with overlap zones (`HELD_HUMAN` / `scaffold mq release`), and **D14** layered TIA with a coverage-map feedback loop (`scaffold tia affected`). Each D-item is independently shippable: a release could stop after any item's last task.

**Architecture:** All engine work extends the existing `src/merge-queue/` module (pure core + injectable seams + daemon orchestrator) and its `.mq/` state directory. New pure modules: `src/merge-queue/gate-cache.ts` (content-addressed green-result cache), `src/merge-queue/wake.ts` (fs.watch journal wake), `src/tia/` (coverage map + selection engine). New CLI surface: `scaffold mq gate-cache|release` actions and a `scaffold tia` command. Generated-project integration goes through the existing agent-ops templates: `content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl` (cache + recording) and R2's `content/assets/agent-ops/gate/gate-check-affected.sh.tmpl` (TIA consumption). Everything crosses process boundaries via the JSONL journal and small JSON files — no new daemons, no sockets.

**Tech Stack:** TypeScript (strict, repo style: no semicolons, single quotes, 2-space indent), vitest (colocated `*.test.ts`, harness pattern with `FakeGh`/`FakeGit` scripted fakes), bats for template tests, `minimatch` / `js-yaml` / `proper-lockfile` / `ulid` (all already in package.json), Node built-ins only for hashing (`node:crypto`), watching (`fs.watch`), and coverage (`NODE_V8_COVERAGE`).

## Global Constraints

- **Branch:** create `brownfield-r4-queue-enhancements` off up-to-date `main` (PR-per-plan, spec §10). Do NOT work on `docs/brownfield-adoption-design`.
- **No new external dependencies** (spec D15: watchman explicitly deferred; fs.watch only). `minimatch@^10` is already a dependency — overlap-zone globs use it; V8 coverage uses Node's native `NODE_V8_COVERAGE`, not c8-the-package.
- **D12 cache keys — exact composition (spec D12):**
  - *Affected-gate key* = sha256 over (`'affected'`, candidate tree hash, base tree hash, gate command string, quarantine file hash, TIA map content hash). The TIA component is the sha256 of `.mq/tia/map.json` when present and the sentinel `tia:none` when absent — so the key is stable before D14 ships and invalidates automatically when a map appears/changes.
  - *Full-gate key* = sha256 over (`'full'`, tree hash, command string, quarantine file hash).
  - **Green-only:** red/timeout results are NEVER cached; a flake-retry green is also never cached (only untainted greens seed skips).
  - Cache lives in `.mq/gate-cache.json`, size-capped by `merge_queue.gate_cache_max_entries` (default **200**; `0` disables the cache), pruned oldest-first.
  - Journal event for a hit is named exactly `gate_cached`.
- **D15:** `fs.watch` on the `.mq` journal, debounced, with the existing `poll_seconds` interval as the fallback ceiling; after a landing the daemon directly triggers ONE post-merge poller pass (the D6 scheduler stays the safety net for merges from other machines).
- **D13:** per-PR changed-file sets come from `gh pr diff --name-only` behind the `GhClient` seam, cached in the journal (`pr_files` event keyed by head sha). `composeBatch` partitions so overlapping PRs NEVER share a batch, preserving low-risk-first order. Config: `merge_queue.overlap_zones` (globs, default `[]`) and `merge_queue.overlap_zone_policy: solo | hold` (default **`solo`** — no human bottleneck by default). `hold` parks the PR in the `HELD_HUMAN` state (non-terminal) until `scaffold mq release --pr <N>`; `mq status` surfaces held PRs prominently. An unknown file set (diff fetch failed) conservatively overlaps with everything (solo batch, never held).
- **D14:** `merge_queue.tia.record: scheduled | always | off`, default **`scheduled`** (first green poller pass per UTC day). The coverage map lives at `.mq/tia/map.json`, keyed by content hashes. New command `scaffold tia affected --base <ref>` emits the selected test list (stdout, one per line, most-likely-to-fail-first) + a confidence verdict; exit `0` = run the selection, exit `3` = run the full suite. The R2 gate script consumes it with **full-suite fallback** on staleness / low confidence / any error. The post-merge full suite remains **authoritative** — TIA only accelerates the pre-merge gate. Instrumented-vs-plain full-gate durations are journaled (`full_gate_recorded`) and visible in `mq stats`.
- **Journal event names (fixed):** `gate_cached`, `full_gate_recorded`, `pr_files`, `released`, `tia_recorded` — use these exact strings everywhere (types, reducer, stats, templates, tests).
- **Journal is write-ahead and append-only**; every new event type must be ignored gracefully by older readers (the reducer switch gets explicit no-op cases; `stats` has a `default` arm).
- **Concurrency invariants preserved:** a cache hit still runs every post-gate safety check (withdrawal, base-moved, pre-land validation, NRS tree assertion). `HELD_HUMAN` is excluded from `queuedPrs`, is NOT in `TERMINAL_PR_STATES` (so `mq eject` can still cancel a held PR), and is untouched by `reconcile()` (not a mid-flight state).
- **Poller/template integration is best-effort:** every `scaffold` call in bash templates is feature-detected (`command -v`), overridable via `MQ_SCAFFOLD_BIN` (mirrors the existing `MQ_GH_CMD` pattern), and `|| true`-guarded — an absent or old scaffold degrades to today's behavior, never breaks the poller or gate.
- **Repo gates:** `npm run check` (lint + type-check + vitest) green per TS task; `bats <file>` green per template task; `make check-all` green before the final commit. Commit after every task with a conventional message; do NOT push mid-plan.
- **R2 dependency (D14 only):** Task 16 requires R2's merged gate templates (`content/assets/agent-ops/gate/gate-check-affected.sh.tmpl`, `src/core/agent-ops/gate-ingest.ts`, `tests/agent-ops-gate-affected.bats` — R2 plan Tasks 7–10). Tasks 1–15 and 17–18 have no R2 dependency. If R2 is not yet merged when this plan executes, ship D12/D15/D13 and hold Task 16 (D14 remains shippable without the gate-script consumption, which then lands as a follow-up).
---

## File Structure

| File | Change |
|---|---|
| `src/merge-queue/gate-cache.ts` (+ test) | NEW — D12 keys, lookup, record, cap/prune |
| `src/merge-queue/wake.ts` (+ test) | NEW — D15 `waitForWake` (fs.watch + debounce + poll fallback) |
| `src/merge-queue/types.ts` | 5 new journal events, `HELD_HUMAN`, `PrEntry.files/filesHeadSha/zoneReleased`, 4 new config keys |
| `src/merge-queue/state.ts` (+ test) | reducer cases: `pr_files`, `released`, no-op cases for metrics events |
| `src/merge-queue/batch.ts` (+ test) | D13 conflict-aware `composeBatch` + `touchesOverlapZone` |
| `src/merge-queue/gh.ts` | `GhClient.changedFiles(pr)` (`gh pr diff --name-only`) |
| `src/merge-queue/daemon.ts` (+ test) | D12 cache skip/record, D15 wake + poller kick, D13 file collection + hold policy |
| `src/merge-queue/stats.ts` (+ test) | cache hits/savings, plain-vs-instrumented full-gate medians, TIA map line |
| `src/cli/commands/mq.ts` (+ test) | `gate-cache` + `release` actions, held-PR surfacing in `status`, new stats lines |
| `src/tia/map.ts` (+ test) | NEW — D14 map format + V8 dump ingestion |
| `src/tia/affected.ts` (+ test) | NEW — D14 layered selection engine + ordering |
| `src/cli/commands/tia.ts` (+ test), `src/cli/index.ts` | NEW — `scaffold tia affected\|record-due\|ingest` |
| `src/core/agent-ops/config.ts` (+ test) | validation for the 4 new `merge_queue` keys |
| `content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl` | D12 cache check/record, D14 instrumented recording |
| `content/assets/agent-ops/gate/gate-check-affected.sh.tmpl` (R2) | D14 TIA consumption layer + primary-`.mq` resolution |
| `src/core/agent-ops/gate-ingest.ts` (R2) | `GATE_TIA_INVOCATION` template var |
| `tests/agent-ops-merge-queue.bats`, `tests/agent-ops-gate-affected.bats` | poller + gate template coverage |
| `tests/merge-queue-e2e.test.ts` | gh stub answers `pr diff --name-only` |
| `CLAUDE.md` | command-table rows for `mq release` / `tia affected` |

## Item → task map (with §11 risk mitigations)

| Item | Tasks | R4-scoped risk → mitigation (spec §11) |
|---|---|---|
| D12 gate cache | 1–4 | *Cache staleness/poisoning* → key includes gate command + quarantine hash (+ TIA map hash); green-only; exact tree-hash addressing; cap + prune; `0` disables |
| D15 event wake | 5–7 | (no §11 entry; fallback polling keeps behavior identical when fs.watch is unavailable) |
| D13 overlap batching | 8–11 | *Overlap-zone `hold` starves PRs* → default policy `solo`; `hold` explicit opt-in; `mq status` surfaces held PRs prominently with the release command |
| D14 TIA loop | 12–17 | *TIA false exclusions* → post-merge full suite stays authoritative; staleness/confidence fallback to full; quarantine asymmetry preserved. *Recording overhead degrades the net* → `tia.record` defaults `scheduled`; instrumented-vs-plain durations journaled and shown in `mq stats`; `off` first-class |
| wrap-up | 18 | — |

---

### Task 1: D12 — gate-cache module, journal events, config key

**Files:**
- Create: `src/merge-queue/gate-cache.ts`
- Create: `src/merge-queue/gate-cache.test.ts`
- Modify: `src/merge-queue/types.ts` (journal events + config key)
- Modify: `src/merge-queue/state.ts` (+ `src/merge-queue/state.test.ts`)
- Modify: `src/core/agent-ops/config.ts` (+ `src/core/agent-ops/config.test.ts`)

**Interfaces:**
- Produces: `affectedGateKey(parts: { candidateTree: string; baseTree: string; command: string; quarantineHash: string; tiaMapHash: string }): string`, `fullGateKey(parts: { tree: string; command: string; quarantineHash: string }): string`, `hashFileOrAbsent(file: string, label: string): string`, `lookupGateCache(mqDir: string, key: string): GateCacheEntry | null`, `recordGateCache(mqDir: string, entry: GateCacheEntry, maxEntries: number): void`, `GATE_CACHE_FILE = 'gate-cache.json'`.
- Produces: journal events `{ type: 'gate_cached'; batchId: string; key: string; savedSeconds: number; at: string }` and `{ type: 'full_gate_recorded'; tree: string; seconds: number; instrumented: boolean; at: string }`; config key `merge_queue.gate_cache_max_entries: number` (default 200, `0` disables).
- Consumes: `node:crypto`, `node:fs` only.

**Steps:**

- [ ] Write the failing test `src/merge-queue/gate-cache.test.ts`:

```ts
// src/merge-queue/gate-cache.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  GATE_CACHE_FILE, affectedGateKey, fullGateKey, hashFileOrAbsent,
  lookupGateCache, recordGateCache,
} from './gate-cache.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-cache-')) }

const AT = '2026-07-19T12:00:00.000Z'

const baseParts = {
  candidateTree: 'tree-a', baseTree: 'tree-b', command: 'make check-affected',
  quarantineHash: 'quarantine:none', tiaMapHash: 'tia:none',
}

describe('gate cache keys', () => {
  it('affected key is deterministic and covers every selection input', () => {
    expect(affectedGateKey(baseParts)).toBe(affectedGateKey({ ...baseParts }))
    for (const field of Object.keys(baseParts) as (keyof typeof baseParts)[]) {
      expect(affectedGateKey({ ...baseParts, [field]: 'CHANGED' }))
        .not.toBe(affectedGateKey(baseParts))
    }
  })

  it('full key covers tree + command + quarantine and differs from the affected key', () => {
    const parts = { tree: 'tree-a', command: 'make check', quarantineHash: 'quarantine:none' }
    expect(fullGateKey(parts)).toBe(fullGateKey({ ...parts }))
    expect(fullGateKey({ ...parts, tree: 'X' })).not.toBe(fullGateKey(parts))
    expect(fullGateKey(parts)).not.toBe(affectedGateKey(baseParts))
  })

  it('hashFileOrAbsent yields a labeled sentinel for missing files and a sha for content', () => {
    const dir = tmp()
    expect(hashFileOrAbsent(path.join(dir, 'nope.txt'), 'quarantine')).toBe('quarantine:none')
    const f = path.join(dir, 'q.txt')
    fs.writeFileSync(f, 'flaky.test.ts\n')
    const h = hashFileOrAbsent(f, 'quarantine')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    fs.writeFileSync(f, 'other.test.ts\n')
    expect(hashFileOrAbsent(f, 'quarantine')).not.toBe(h)
  })
})

describe('lookupGateCache / recordGateCache', () => {
  it('records and looks up a green entry', () => {
    const mqDir = tmp()
    expect(lookupGateCache(mqDir, 'k1')).toBeNull()
    recordGateCache(mqDir, { key: 'k1', seconds: 90, at: AT }, 200)
    expect(lookupGateCache(mqDir, 'k1')).toEqual({ key: 'k1', seconds: 90, at: AT })
  })

  it('caps the cache and prunes the oldest entries', () => {
    const mqDir = tmp()
    for (let i = 0; i < 5; i++) {
      recordGateCache(mqDir, { key: `k${i}`, seconds: i, at: AT }, 3)
    }
    expect(lookupGateCache(mqDir, 'k0')).toBeNull()
    expect(lookupGateCache(mqDir, 'k1')).toBeNull()
    expect(lookupGateCache(mqDir, 'k4')).not.toBeNull()
    const raw = JSON.parse(
      fs.readFileSync(path.join(mqDir, GATE_CACHE_FILE), 'utf8'),
    ) as { entries: unknown[] }
    expect(raw.entries).toHaveLength(3)
  })

  it('re-recording a key replaces it instead of duplicating', () => {
    const mqDir = tmp()
    recordGateCache(mqDir, { key: 'k1', seconds: 1, at: AT }, 200)
    recordGateCache(mqDir, { key: 'k1', seconds: 2, at: AT }, 200)
    const raw = JSON.parse(
      fs.readFileSync(path.join(mqDir, GATE_CACHE_FILE), 'utf8'),
    ) as { entries: unknown[] }
    expect(raw.entries).toHaveLength(1)
    expect(lookupGateCache(mqDir, 'k1')?.seconds).toBe(2)
  })

  it('maxEntries 0 disables recording entirely', () => {
    const mqDir = tmp()
    recordGateCache(mqDir, { key: 'k1', seconds: 1, at: AT }, 0)
    expect(fs.existsSync(path.join(mqDir, GATE_CACHE_FILE))).toBe(false)
  })

  it('a corrupt cache file reads as empty and is repaired on the next record', () => {
    const mqDir = tmp()
    fs.writeFileSync(path.join(mqDir, GATE_CACHE_FILE), '{corrupt')
    expect(lookupGateCache(mqDir, 'k1')).toBeNull()
    recordGateCache(mqDir, { key: 'k1', seconds: 5, at: AT }, 200)
    expect(lookupGateCache(mqDir, 'k1')?.seconds).toBe(5)
  })
})
```

- [ ] Run: `npx vitest run src/merge-queue/gate-cache.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/merge-queue/gate-cache.ts`:

```ts
// src/merge-queue/gate-cache.ts — D12: green-only gate-result cache, keyed by
// tree hashes plus every input that selects or scopes tests (spec D12).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const GATE_CACHE_FILE = 'gate-cache.json'

export interface GateCacheEntry {
  key: string
  /** Wall-clock seconds the original green run took (reported as savings on a hit). */
  seconds: number
  at: string
}

interface GateCacheFileShape {
  version: 1
  entries: GateCacheEntry[]
}

/** sha256 of the file's bytes, or "<label>:none" when it does not exist — an
 *  absent quarantine list / TIA map is a stable, distinct key component. */
export function hashFileOrAbsent(file: string, label: string): string {
  if (!fs.existsSync(file)) return `${label}:none`
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function keyOf(fields: string[]): string {
  return crypto.createHash('sha256').update(fields.join('\n')).digest('hex')
}

/** Affected-gate key — covers EVERY input that selects or scopes tests: the
 *  candidate tree, the base tree (affected-selection diffs against
 *  MQ_AFFECTED_BASE), the gate command string, the quarantine file content, and
 *  the TIA map content (when a map exists it changes which tests run). */
export function affectedGateKey(parts: {
  candidateTree: string
  baseTree: string
  command: string
  quarantineHash: string
  tiaMapHash: string
}): string {
  return keyOf([
    'affected', parts.candidateTree, parts.baseTree, parts.command,
    parts.quarantineHash, parts.tiaMapHash,
  ])
}

/** Full-gate key — selection inputs do not apply: tree + command + quarantine. */
export function fullGateKey(parts: {
  tree: string
  command: string
  quarantineHash: string
}): string {
  return keyOf(['full', parts.tree, parts.command, parts.quarantineHash])
}

function readCache(mqDir: string): GateCacheFileShape {
  const file = path.join(mqDir, GATE_CACHE_FILE)
  if (!fs.existsSync(file)) return { version: 1, entries: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as GateCacheFileShape
    if (raw.version !== 1 || !Array.isArray(raw.entries)) return { version: 1, entries: [] }
    return raw
  } catch {
    return { version: 1, entries: [] } // a corrupt cache is an empty cache, never fatal
  }
}

export function lookupGateCache(mqDir: string, key: string): GateCacheEntry | null {
  return readCache(mqDir).entries.find(e => e.key === key) ?? null
}

/** Record a GREEN result. Green-only is enforced by the API — red/timeout results
 *  have no entry point here. Size-capped: oldest entries beyond maxEntries are
 *  pruned; maxEntries <= 0 disables the cache. Atomic write (tmp + rename) so a
 *  concurrent daemon/poller writer never leaves a torn file; a lost write race
 *  drops one entry at worst (this is a cache, not a ledger). */
export function recordGateCache(
  mqDir: string,
  entry: GateCacheEntry,
  maxEntries: number,
): void {
  if (maxEntries <= 0) return
  fs.mkdirSync(mqDir, { recursive: true })
  const cache = readCache(mqDir)
  cache.entries = cache.entries.filter(e => e.key !== entry.key)
  cache.entries.push(entry)
  if (cache.entries.length > maxEntries) {
    cache.entries = cache.entries.slice(cache.entries.length - maxEntries)
  }
  const file = path.join(mqDir, GATE_CACHE_FILE)
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2) + '\n')
  fs.renameSync(tmp, file)
}
```

- [ ] Run: `npx vitest run src/merge-queue/gate-cache.test.ts` — expect all tests pass.
- [ ] In `src/merge-queue/types.ts`, extend the `JournalEvent` union (append after the `gate_metrics` member):

```ts
  | { type: 'gate_cached'; batchId: string; key: string; savedSeconds: number; at: string }
  | { type: 'full_gate_recorded'; tree: string; seconds: number; instrumented: boolean; at: string }
```

- [ ] In `src/merge-queue/types.ts`, add to `MergeQueueConfig` (after `gate_executor`):

```ts
  /** D12: size cap for .mq/gate-cache.json; 0 disables the gate-result cache. */
  gate_cache_max_entries: number
```

  and to `defaultMergeQueueConfig()`:

```ts
    gate_cache_max_entries: 200,
```

- [ ] In `src/merge-queue/state.ts`, add no-op reducer cases next to the existing `case 'gate_metrics': break`:

```ts
    case 'gate_cached':
    case 'full_gate_recorded':
      break
```

- [ ] Add to `src/merge-queue/state.test.ts` (inside the existing `describe('reduceState', …)` block, reusing its `AT`-style timestamp constant — add one if the file names it differently):

```ts
  it('ignores gate_cached and full_gate_recorded events (metrics-only)', () => {
    const state = reduceState([
      { type: 'enqueued', pr: 1, at: '2026-07-19T12:00:00.000Z' },
      { type: 'gate_cached', batchId: 'b', key: 'k', savedSeconds: 60, at: '2026-07-19T12:00:00.000Z' },
      { type: 'full_gate_recorded', tree: 't', seconds: 100, instrumented: false, at: '2026-07-19T12:00:00.000Z' },
    ])
    expect(state.entries.get(1)?.state).toBe('QUEUED')
  })
```

- [ ] In `src/core/agent-ops/config.ts`, add validation inside the `if (raw.merge_queue !== undefined)` block, after the `intKeys` loop (a dedicated block, NOT in `intKeys`, because `0` is valid here):

```ts
    if (mq.gate_cache_max_entries !== undefined) {
      const v = mq.gate_cache_max_entries
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        fail(
          `merge_queue.gate_cache_max_entries must be an integer >= 0 (0 disables the cache), got ${JSON.stringify(v)}`,
        )
      }
      cfg.merge_queue.gate_cache_max_entries = v
    }
```

- [ ] Add to `src/core/agent-ops/config.test.ts` (inside the existing `describe('loadAgentOpsConfig', …)`, using its `tmpProject` helper):

```ts
  it('defaults merge_queue.gate_cache_max_entries to 200 and accepts 0 (disabled)', () => {
    expect(loadAgentOpsConfig(tmpProject()).merge_queue.gate_cache_max_entries).toBe(200)
    const dir = tmpProject(`
project_name: myapp
merge_queue:
  gate_cache_max_entries: 0
`)
    expect(loadAgentOpsConfig(dir).merge_queue.gate_cache_max_entries).toBe(0)
  })

  it('rejects a negative or non-integer gate_cache_max_entries', () => {
    const bad = tmpProject(`
project_name: myapp
merge_queue:
  gate_cache_max_entries: -1
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/gate_cache_max_entries/)
  })
```

- [ ] Run: `npx vitest run src/merge-queue src/core/agent-ops/config.test.ts` — expect all pass.
- [ ] Run: `npm run check` — expect lint + type-check + vitest all green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): gate-result cache module, journal events, config key (D12)"`

---

### Task 2: D12 — daemon skips the gate on a cache hit, records untainted greens

**Files:**
- Modify: `src/merge-queue/daemon.ts` (the gate section of `runBatch`, currently ~lines 255–288)
- Modify: `src/merge-queue/daemon.test.ts` (harness config + new tests)

**Interfaces:**
- Consumes: `affectedGateKey`, `fullGateKey`, `hashFileOrAbsent`, `lookupGateCache`, `recordGateCache` from `./gate-cache.js`; `config.gate_cache_max_entries` (`> 0` enables).
- Produces: journal `gate_cached` events on hits; cache entries under both keys when `gate_command === full_gate_command` (small-project case — seeds the poller's full-gate skip).

**Steps:**

- [ ] In `src/merge-queue/daemon.test.ts`, change the harness default config so the ~35 existing tests are untouched by caching (FakeGit collapses every tree to `'TREE'`, which would otherwise make a bisected red half spuriously hit the green half's cache entry — a fake-only artifact, since real halves have distinct trees). In `harness()`, replace:

```ts
    config: defaultMergeQueueConfig(),
```

  with:

```ts
    // Cache disabled by default: FakeGit collapses all trees to 'TREE', so the
    // D12 cache would conflate distinct batches. Cache tests opt in explicitly.
    config: { ...defaultMergeQueueConfig(), gate_cache_max_entries: 0 },
```

- [ ] Add the failing tests to `src/merge-queue/daemon.test.ts` (inside `describe('MergeQueueDaemon.cycle', …)`). The opt-in tests exploit the collapsed-tree artifact deliberately: identical trees model "identical content re-batched".

```ts
  it('skips the gate on an identical cache key and journals gate_cached (D12)', async () => {
    const h = harness({ config: defaultMergeQueueConfig() }) // cache ON (200)
    h.enqueue(1)
    await h.daemon.cycle()               // green run records the cache entry
    expect(h.gateCalls.length).toBe(1)
    h.enqueue(2)                          // FakeGit collapses every tree to 'TREE',
    await h.daemon.cycle()                // so the key matches — the gate must not run
    expect(h.gateCalls.length).toBe(1)
    expect(h.states()[2]).toBe('LANDED')  // every post-gate safety check still ran
    const cachedEvents = readJournal(h.mqDir).filter(e => e.type === 'gate_cached')
    expect(cachedEvents).toHaveLength(1)
    expect(cachedEvents[0]).toMatchObject({ savedSeconds: 1 })
  })

  it('never caches a red result (D12 green-only)', async () => {
    const h = harness({ config: defaultMergeQueueConfig() })
    h.enqueue(1)
    h.gateResults.push({ result: 'red', seconds: 2, logPath: '/l/r.log', failedTests: [] })
    await h.daemon.cycle()               // red singleton -> ejected, nothing recorded
    h.enqueue(2)
    await h.daemon.cycle()
    expect(h.gateCalls.length).toBe(2)   // the second batch ran the gate — no bogus hit
    expect(h.states()[2]).toBe('LANDED')
  })

  it('a flake-retry green is not cached (only untainted greens seed skips)', async () => {
    const h = harness({ config: defaultMergeQueueConfig() })
    h.enqueue(1)
    h.gateResults.push(
      { result: 'red', seconds: 2, logPath: '/l/a.log', failedTests: ['src/f.test.ts'] },
      { result: 'green', seconds: 1, logPath: '/l/a2.log', failedTests: [] },
    )
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('LANDED')
    h.enqueue(2)
    await h.daemon.cycle()
    expect(h.gateCalls.length).toBe(3)   // gate ran again — the flake green seeded nothing
  })

  it('gate_cache_max_entries 0 disables lookup and record entirely', async () => {
    const h = harness() // harness default: cache off
    h.enqueue(1)
    await h.daemon.cycle()
    h.enqueue(2)
    await h.daemon.cycle()
    expect(h.gateCalls.length).toBe(2)
    expect(readJournal(h.mqDir).filter(e => e.type === 'gate_cached')).toHaveLength(0)
    expect(fs.existsSync(path.join(h.mqDir, 'gate-cache.json'))).toBe(false)
  })
```

- [ ] Run: `npx vitest run src/merge-queue/daemon.test.ts` — expect the 4 new tests FAIL, all existing tests pass.
- [ ] In `src/merge-queue/daemon.ts`, add the import:

```ts
import {
  affectedGateKey, fullGateKey, hashFileOrAbsent, lookupGateCache, recordGateCache,
} from './gate-cache.js'
```

- [ ] In `runBatch`, replace the gate section — everything from `let gate = await this.gateRun(batchId, base)` down to (and including) the closing brace of the flake-protocol `if (gate.result === 'red' && …)` block — with:

```ts
    // D12: gate-result cache. The key covers every input that selects or scopes
    // tests; a hit means this exact combination already ran green, so the gate
    // is skipped — but every post-gate safety check below still runs.
    const cacheEnabled = config.gate_cache_max_entries > 0
    const quarantineHash = hashFileOrAbsent(
      path.join(this.deps.projectRoot, config.quarantine_path), 'quarantine',
    )
    const cacheKey = affectedGateKey({
      candidateTree,
      baseTree: git.treeOf(`origin/${base}`),
      command: config.gate_command,
      quarantineHash,
      tiaMapHash: hashFileOrAbsent(path.join(mqDir, 'tia', 'map.json'), 'tia'),
    })
    const cached = cacheEnabled ? lookupGateCache(mqDir, cacheKey) : null
    let gate: GateResult
    if (cached !== null) {
      appendEvent(mqDir, {
        type: 'gate_cached', batchId, key: cacheKey, savedSeconds: cached.seconds, at: this.at(),
      })
      log(`batch ${batchId}: gate cache hit — skipping the gate (~${cached.seconds}s saved)`)
      gate = { result: 'green', seconds: 0, logPath: '(gate cache hit)', failedTests: [] }
    } else {
      let flakeRetried = false
      gate = await this.gateRun(batchId, base)
      appendEvent(mqDir, {
        type: 'gate_metrics', batchId, seconds: gate.seconds, result: gate.result, at: this.at(),
      })

      // Timeout → infra-vs-test disambiguation: retry the whole batch once (spec §5.3).
      if (gate.result === 'timeout') {
        log(`batch ${batchId}: gate timeout — retrying once`)
        gate = await this.gateRun(batchId, base)
        appendEvent(mqDir, {
          type: 'gate_metrics', batchId, seconds: gate.seconds, result: gate.result, at: this.at(),
        })
        if (gate.result === 'timeout') gate = { ...gate, result: 'red' }
      }

      // Flake protocol (spec D8): rerun failed test files once with identical config.
      if (gate.result === 'red' && gate.failedTests.length > 0) {
        for (const pr of applied) {
          appendEvent(mqDir, { type: 'pr_state', pr, state: 'FLAKE_RETRY', batchId, at: this.at() })
        }
        const retry = await this.gateRun(batchId, base, gate.failedTests)
        if (retry.result === 'green') {
          for (const testId of gate.failedTests) {
            recordFlake(mqDir, testId, this.at())
            const count = recentFlakeCount(this.state(), testId, this.deps.now())
            if (count >= QUARANTINE_THRESHOLD &&
                addToQuarantine(this.deps.projectRoot, config.quarantine_path, testId)) {
              fileQuarantineBead(this.deps.projectRoot, testId)
              log(`quarantined flaky test ${testId} (${count} events/7d)`)
            }
          }
          gate = retry
          flakeRetried = true
        }
      }

      // D12: record only an untainted green — a flake-retry green re-proved just
      // the failed files, not the whole selection, so it must never seed future
      // skips. Red/timeout results are never cached.
      if (cacheEnabled && gate.result === 'green' && !flakeRetried) {
        recordGateCache(
          mqDir, { key: cacheKey, seconds: gate.seconds, at: this.at() },
          config.gate_cache_max_entries,
        )
        // When the merge gate IS the full gate (small projects run `make check`
        // for both), seed the full-gate cache too, so the post-merge poller can
        // skip re-running the identical tree it is about to verify.
        if (config.gate_command === config.full_gate_command) {
          recordGateCache(
            mqDir,
            {
              key: fullGateKey({
                tree: candidateTree, command: config.full_gate_command, quarantineHash,
              }),
              seconds: gate.seconds, at: this.at(),
            },
            config.gate_cache_max_entries,
          )
        }
      }
    }
```

  Note: the pre-existing lines between the flake block and the green branch (the withdrawn-member check, the base-moved check, the land/eject/split logic) are untouched — a cache hit flows through all of them.

- [ ] Run: `npx vitest run src/merge-queue/daemon.test.ts` — expect ALL tests pass (existing + 4 new).
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): daemon gate skip on cache hit, untainted-green recording (D12)"`

---

### Task 3: D12 — `scaffold mq gate-cache` CLI action + cache/full-gate stats

**Files:**
- Modify: `src/cli/commands/mq.ts` (new action + stats lines)
- Modify: `src/cli/commands/mq.test.ts`
- Modify: `src/merge-queue/stats.ts`
- Modify: `src/merge-queue/stats.test.ts`

**Interfaces:**
- Produces: CLI `scaffold mq gate-cache --check-tree <sha>` (exit 0 = hit, exit 1 = miss/disabled) and `scaffold mq gate-cache --record-tree <sha> --seconds <n> [--instrumented]` (writes the full-gate cache entry AND appends a `full_gate_recorded` journal event). `MqArgs` gains `checkTree?: string; recordTree?: string; seconds?: number; instrumented?: boolean`.
- Produces: `MqStats` gains `gateCacheHits: number`, `gateCacheSecondsSaved: number`, `fullGatePlain: { runs: number; medianSeconds: number | null }`, `fullGateInstrumented: { runs: number; medianSeconds: number | null }`.
- Consumes: `fullGateKey`, `hashFileOrAbsent`, `lookupGateCache`, `recordGateCache` from `../../merge-queue/gate-cache.js`; `cfg.merge_queue.full_gate_command`, `quarantine_path`, `gate_cache_max_entries`.

**Steps:**

- [ ] Update `src/merge-queue/stats.test.ts`: the first test's `toEqual` object gains the new fields, and a new test covers the new counters. Updated first expectation:

```ts
    expect(computeStats(events, NOW)).toEqual({
      arrivalsLast24h: 1,
      landedTotal: 1,
      gateRuns: { green: 2, red: 1, timeout: 0 },
      medianGateSeconds: 200,
      flakesLast7d: 1,
      gateCacheHits: 0,
      gateCacheSecondsSaved: 0,
      fullGatePlain: { runs: 0, medianSeconds: null },
      fullGateInstrumented: { runs: 0, medianSeconds: null },
    })
```

  New test (same describe block):

```ts
  it('counts gate-cache hits, savings, and full-gate medians by instrumentation', () => {
    const events: JournalEvent[] = [
      { type: 'gate_cached', batchId: 'a', key: 'k', savedSeconds: 120, at: '2026-07-17T02:00:00.000Z' },
      { type: 'gate_cached', batchId: 'b', key: 'k', savedSeconds: 60, at: '2026-07-17T03:00:00.000Z' },
      { type: 'full_gate_recorded', tree: 't1', seconds: 100, instrumented: false, at: '2026-07-17T02:00:00.000Z' },
      { type: 'full_gate_recorded', tree: 't2', seconds: 300, instrumented: false, at: '2026-07-17T03:00:00.000Z' },
      { type: 'full_gate_recorded', tree: 't3', seconds: 500, instrumented: true, at: '2026-07-17T04:00:00.000Z' },
    ]
    const s = computeStats(events, NOW)
    expect(s.gateCacheHits).toBe(2)
    expect(s.gateCacheSecondsSaved).toBe(180)
    expect(s.fullGatePlain).toEqual({ runs: 2, medianSeconds: 200 })
    expect(s.fullGateInstrumented).toEqual({ runs: 1, medianSeconds: 500 })
  })
```

- [ ] Run: `npx vitest run src/merge-queue/stats.test.ts` — expect FAILURE.
- [ ] Rewrite `src/merge-queue/stats.ts` (extract the median helper; keep the `default: break` arm so future events never break stats):

```ts
import type { JournalEvent } from './types.js'

export interface MqStats {
  arrivalsLast24h: number
  landedTotal: number
  gateRuns: { green: number; red: number; timeout: number }
  medianGateSeconds: number | null
  flakesLast7d: number
  /** D12: gate_cached events — batches that skipped the gate entirely. */
  gateCacheHits: number
  gateCacheSecondsSaved: number
  /** D12/D14: poller full-gate runs, split by coverage instrumentation so the
   *  TIA recording overhead stays visible (spec §11). */
  fullGatePlain: { runs: number; medianSeconds: number | null }
  fullGateInstrumented: { runs: number; medianSeconds: number | null }
}

const DAY_MS = 24 * 60 * 60 * 1000

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  return sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
}

export function computeStats(events: JournalEvent[], now: Date): MqStats {
  const t = now.getTime()
  let arrivalsLast24h = 0
  let landedTotal = 0
  const gateRuns = { green: 0, red: 0, timeout: 0 }
  const gateSeconds: number[] = []
  let flakesLast7d = 0
  let gateCacheHits = 0
  let gateCacheSecondsSaved = 0
  const fullPlain: number[] = []
  const fullInstrumented: number[] = []
  for (const e of events) {
    switch (e.type) {
    case 'enqueued':
      if (Date.parse(e.at) >= t - DAY_MS) arrivalsLast24h += 1
      break
    case 'pr_state':
      if (e.state === 'LANDED') landedTotal += 1
      break
    case 'gate_metrics':
      gateRuns[e.result] += 1
      gateSeconds.push(e.seconds)
      break
    case 'flake':
      if (Date.parse(e.at) >= t - 7 * DAY_MS) flakesLast7d += 1
      break
    case 'gate_cached':
      gateCacheHits += 1
      gateCacheSecondsSaved += e.savedSeconds
      break
    case 'full_gate_recorded':
      (e.instrumented ? fullInstrumented : fullPlain).push(e.seconds)
      break
    default:
      break
    }
  }
  gateSeconds.sort((a, b) => a - b)
  fullPlain.sort((a, b) => a - b)
  fullInstrumented.sort((a, b) => a - b)
  return {
    arrivalsLast24h,
    landedTotal,
    gateRuns,
    medianGateSeconds: median(gateSeconds),
    flakesLast7d,
    gateCacheHits,
    gateCacheSecondsSaved,
    fullGatePlain: { runs: fullPlain.length, medianSeconds: median(fullPlain) },
    fullGateInstrumented: { runs: fullInstrumented.length, medianSeconds: median(fullInstrumented) },
  }
}
```

- [ ] Run: `npx vitest run src/merge-queue/stats.test.ts` — expect all pass.
- [ ] Add the failing CLI tests to `src/cli/commands/mq.test.ts`:

```ts
  it('gate-cache --record-tree then --check-tree round-trips (full-gate key)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'gate-cache', recordTree: 'T1', seconds: 42, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events[0]).toMatchObject({
      type: 'full_gate_recorded', tree: 'T1', seconds: 42, instrumented: false,
    })
    await mqHandler({ action: 'gate-cache', checkTree: 'T1', root })
    expect(process.exitCode ?? 0).toBe(0)
    await mqHandler({ action: 'gate-cache', checkTree: 'T2', root })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })

  it('gate-cache --record-tree --instrumented flags the journal event', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'gate-cache', recordTree: 'T1', seconds: 9, instrumented: true, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events[0]).toMatchObject({ type: 'full_gate_recorded', instrumented: true })
  })

  it('gate-cache with neither flag errors', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'gate-cache', root })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
```

- [ ] Run: `npx vitest run src/cli/commands/mq.test.ts` — expect the 3 new tests FAIL.
- [ ] In `src/cli/commands/mq.ts`:
  - Extend `MqArgs`:

```ts
  checkTree?: string
  recordTree?: string
  seconds?: number
  instrumented?: boolean
```

  - Add the import:

```ts
import {
  fullGateKey, hashFileOrAbsent, lookupGateCache, recordGateCache,
} from '../../merge-queue/gate-cache.js'
```

  - Add the case to the `switch (argv.action)` (before `case 'daemon'`):

```ts
  case 'gate-cache': {
    // Full-gate cache plumbing for the post-merge poller (D12). The key is
    // computed HERE so the hashing logic lives in exactly one place (TS), never
    // re-implemented in bash.
    const cfg = loadAgentOpsConfig(primary).merge_queue
    const quarantineHash = hashFileOrAbsent(path.join(primary, cfg.quarantine_path), 'quarantine')
    if (argv.checkTree) {
      const hit = cfg.gate_cache_max_entries > 0
        ? lookupGateCache(mqDir, fullGateKey({
          tree: argv.checkTree, command: cfg.full_gate_command, quarantineHash,
        }))
        : null
      if (hit !== null) {
        output.success(`full-gate cache hit (recorded ${hit.at}, ${hit.seconds}s)`)
        return
      }
      output.info('full-gate cache miss')
      process.exitCode = 1
      return
    }
    if (argv.recordTree) {
      const at = new Date().toISOString()
      recordGateCache(mqDir, {
        key: fullGateKey({ tree: argv.recordTree, command: cfg.full_gate_command, quarantineHash }),
        seconds: argv.seconds ?? 0,
        at,
      }, cfg.gate_cache_max_entries)
      appendEvent(mqDir, {
        type: 'full_gate_recorded', tree: argv.recordTree, seconds: argv.seconds ?? 0,
        instrumented: argv.instrumented === true, at,
      })
      output.success(`recorded green full gate for tree ${argv.recordTree}`)
      return
    }
    output.error('mq gate-cache: pass --check-tree <sha> or --record-tree <sha>')
    process.exitCode = 1
    return
  }
```

  - In the `stats` case, add after the flake line:

```ts
    output.info(
      `gate cache: ${stats.gateCacheHits} hit(s), ~${stats.gateCacheSecondsSaved} s saved`,
    )
    output.info(
      `full gate (poller): ${stats.fullGatePlain.runs} plain ` +
      `(median ${stats.fullGatePlain.medianSeconds ?? '—'} s) / ` +
      `${stats.fullGateInstrumented.runs} instrumented ` +
      `(median ${stats.fullGateInstrumented.medianSeconds ?? '—'} s)`,
    )
```

  - In the builder, extend the `choices` array with `'gate-cache'` and add the options:

```ts
      .option('check-tree', {
        type: 'string', hidden: true, describe: 'gate-cache: tree sha to look up (full-gate key)',
      })
      .option('record-tree', {
        type: 'string', hidden: true, describe: 'gate-cache: tree sha to record as green',
      })
      .option('seconds', {
        type: 'number', hidden: true, describe: 'gate-cache: wall-clock seconds of the recorded run',
      })
      .option('instrumented', {
        type: 'boolean', default: false, hidden: true,
        describe: 'gate-cache: the recorded run was coverage-instrumented',
      })
```

- [ ] Run: `npx vitest run src/cli/commands/mq.test.ts` — expect all pass.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): gate-cache CLI action + cache/full-gate stats lines (D12)"`

---

### Task 4: D12 — poller uses the full-gate cache (check before running, record on green)

**Files:**
- Modify: `content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl`
- Modify: `tests/agent-ops-merge-queue.bats` (`poller_world` + 3 new tests)

**Interfaces:**
- Consumes: `scaffold mq gate-cache --check-tree/--record-tree` (Task 3), resolved via `MQ_SCAFFOLD_BIN` (default `scaffold`), feature-detected and best-effort.
- Produces: a poller that skips the full gate when the exact `origin/<branch>` tree already ran it green, and records every green run's tree + duration.

**Steps:**

- [ ] Update `poller_world` in `tests/agent-ops-merge-queue.bats` so ALL poller tests are hermetic (a real `scaffold` on PATH must never be invoked). Append to the end of the `poller_world()` function body:

```bash
  # Hermetic scaffold stub (MQ_SCAFFOLD_BIN mirrors the engine's MQ_GH_CMD
  # pattern): cache checks miss, recording is never due, everything else no-ops.
  # Tests that need different behavior rewrite the stub file.
  mkdir -p "$WORK/stub-bin"
  cat > "$WORK/stub-bin/scaffold" <<'STUB'
#!/usr/bin/env bash
echo "$@" >> "${SCAFFOLD_STUB_LOG:-/dev/null}"
case "$*" in
  *"gate-cache --check-tree"*) exit 1 ;;
  *"tia record-due"*) exit 1 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$WORK/stub-bin/scaffold"
  export MQ_SCAFFOLD_BIN="$WORK/stub-bin/scaffold"
```

- [ ] Append the failing tests to `tests/agent-ops-merge-queue.bats`:

```bash
@test "poller: full-gate cache hit skips the gate and records the sha" {
  poller_world "false"   # the gate would FAIL if it ran — a cache hit must skip it
  cat > "$MQ_SCAFFOLD_BIN" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  *"gate-cache --check-tree"*) exit 0 ;;
  *"tia record-due"*) exit 1 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$MQ_SCAFFOLD_BIN"
  SHA="$(git -C "$WORK/clone" rev-parse origin/main)"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"cache hit"* ]]
  [ "$(cat "$WORK/clone/.mq/last-full-suite-sha")" = "$SHA" ]
  [ ! -f "$WORK/clone/.mq/PAUSED" ]
  rm -rf "$WORK"
}

@test "poller: green run records the tree in the full-gate cache" {
  poller_world "true"
  export SCAFFOLD_STUB_LOG="$WORK/stub.log"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  TREE="$(git -C "$WORK/clone" rev-parse 'origin/main^{tree}')"
  grep -q -- "mq gate-cache --record-tree $TREE --seconds" "$WORK/stub.log"
  rm -rf "$WORK"
}

@test "poller: scaffold absent degrades to a normal full run" {
  poller_world "true"
  export MQ_SCAFFOLD_BIN="$WORK/no-such-scaffold"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  SHA="$(git -C "$WORK/clone" rev-parse origin/main)"
  [ "$(cat "$WORK/clone/.mq/last-full-suite-sha")" = "$SHA" ]
  rm -rf "$WORK"
}
```

- [ ] Run: `bats tests/agent-ops-merge-queue.bats` — expect the 3 new tests FAIL, all existing pass.
- [ ] Edit `content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl`. Three surgical edits:

  **(a)** Immediately after the line `HEAD_SHA="$(git rev-parse "origin/$BRANCH")"`, insert:

```bash

# scaffold CLI integration (gate cache; TIA recording arrives with it) — pure
# best-effort: an absent/old scaffold degrades every feature below to the plain
# poller behavior. MQ_SCAFFOLD_BIN mirrors the engine's MQ_GH_CMD override.
SCAFFOLD_BIN="${MQ_SCAFFOLD_BIN:-scaffold}"
command -v "$SCAFFOLD_BIN" >/dev/null 2>&1 || SCAFFOLD_BIN=""
```

  **(b)** Immediately before the line `git worktree prune` (i.e. after the already-paused-red-at-this-sha skip), insert:

```bash
# Gate-result cache (D12): skip the full gate when this exact tree already ran
# it green (recorded by the daemon's pre-land run when gate == full gate, or by
# an earlier poller pass at a different sha with an identical tree, e.g. after a
# revert). Green-only cache; any error here degrades to a normal run.
TREE_SHA="$(git rev-parse "origin/$BRANCH^{tree}")"
if [ -n "$SCAFFOLD_BIN" ] && "$SCAFFOLD_BIN" mq gate-cache --check-tree "$TREE_SHA" >/dev/null 2>&1; then
	echo "$HEAD_SHA" > "$MARKER"
	if grep -q '^post-merge red' "$PAUSE" 2>/dev/null; then
		rm -f "$PAUSE"
		echo "post-merge: cache hit at $HEAD_SHA — full gate already green on tree $TREE_SHA; cleared poller pause"
	else
		echo "post-merge: cache hit at $HEAD_SHA — full gate already green on tree $TREE_SHA"
	fi
	exit 0
fi
```

  **(c)** Replace the two lines

```bash
GATE_RC=0
(cd "$WT" && {{FULL_GATE_COMMAND}}) >"$LOG" 2>&1 || GATE_RC=$?
```

  with

```bash
GATE_START="$(date +%s)"
GATE_RC=0
(cd "$WT" && {{FULL_GATE_COMMAND}}) >"$LOG" 2>&1 || GATE_RC=$?
GATE_SECONDS=$(( $(date +%s) - GATE_START ))
```

  and, inside the green branch, right after `echo "$HEAD_SHA" > "$MARKER"`, insert:

```bash
	if [ -n "$SCAFFOLD_BIN" ]; then
		"$SCAFFOLD_BIN" mq gate-cache --record-tree "$TREE_SHA" --seconds "$GATE_SECONDS" >/dev/null 2>&1 || true
	fi
```

- [ ] Run: `bats tests/agent-ops-merge-queue.bats` — expect ALL tests pass (existing 23 + 3 new).
- [ ] Run: `make lint` — expect ShellCheck green (`.tmpl` files are excluded; the rendered form is exercised by bats).
- [ ] Commit: `git add -A && git commit -m "feat(agent-ops): poller consults and feeds the full-gate cache (D12)"`

**D12 is complete and shippable here.**

---

### Task 5: D15 — `waitForWake` (fs.watch on the journal, debounced, polling fallback)

**Files:**
- Create: `src/merge-queue/wake.ts`
- Create: `src/merge-queue/wake.test.ts`

**Interfaces:**
- Produces: `waitForWake(mqDir: string, timeoutMs: number, debounceMs = 150): Promise<'journal' | 'timeout'>`.
- Consumes: `JOURNAL_FILE` from `./journal.js`; `fs.watch` (no watchman, no new deps).

**Steps:**

- [ ] Write the failing test `src/merge-queue/wake.test.ts`:

```ts
// src/merge-queue/wake.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { waitForWake } from './wake.js'
import { appendEvent } from './journal.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-wake-')) }

describe('waitForWake', () => {
  it('resolves "journal" promptly when the journal is appended', async () => {
    const mqDir = tmp()
    const started = Date.now()
    const p = waitForWake(mqDir, 10_000, 25)
    setTimeout(() => {
      appendEvent(mqDir, { type: 'enqueued', pr: 1, at: new Date().toISOString() })
    }, 50)
    await expect(p).resolves.toBe('journal')
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('falls back to the poll timer when nothing is written', async () => {
    await expect(waitForWake(tmp(), 120, 25)).resolves.toBe('timeout')
  })

  it('ignores writes to unrelated files in .mq', async () => {
    const mqDir = tmp()
    const p = waitForWake(mqDir, 250, 25)
    setTimeout(() => fs.writeFileSync(path.join(mqDir, 'other.txt'), 'x\n'), 40)
    await expect(p).resolves.toBe('timeout')
  })

  it('debounces a burst of appends into one wake (single resolution)', async () => {
    const mqDir = tmp()
    const p = waitForWake(mqDir, 10_000, 50)
    for (let i = 0; i < 5; i++) {
      appendEvent(mqDir, { type: 'enqueued', pr: i + 1, at: new Date().toISOString() })
    }
    await expect(p).resolves.toBe('journal')
  })

  it('a vanished mqDir degrades to the poll timer instead of throwing', async () => {
    const mqDir = tmp()
    const p = waitForWake(mqDir, 200, 25)
    fs.rmSync(mqDir, { recursive: true, force: true })
    await expect(p).resolves.toBe('timeout')
  })
})
```

- [ ] Run: `npx vitest run src/merge-queue/wake.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/merge-queue/wake.ts`:

```ts
// src/merge-queue/wake.ts — D15: event-driven daemon wake. fs.watch on the .mq
// journal (debounced) with the poll interval as the fallback ceiling. No
// watchman, no new dependencies; on filesystems where fs.watch is unavailable
// or dies mid-wait, behavior degrades silently to pure interval polling.
import fs from 'node:fs'
import { JOURNAL_FILE } from './journal.js'

export function waitForWake(
  mqDir: string,
  timeoutMs: number,
  debounceMs = 150,
): Promise<'journal' | 'timeout'> {
  return new Promise(resolve => {
    let watcher: fs.FSWatcher | null = null
    let debounce: NodeJS.Timeout | null = null
    let settled = false
    const finish = (why: 'journal' | 'timeout'): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (debounce !== null) clearTimeout(debounce)
      try { watcher?.close() } catch { /* already closed */ }
      resolve(why)
    }
    const timer = setTimeout(() => finish('timeout'), timeoutMs)
    try {
      fs.mkdirSync(mqDir, { recursive: true })
      // Watch the DIRECTORY, not the file: the journal may not exist yet, and
      // directory watches survive file replacement. A null filename (some
      // platforms omit it) is treated as potentially-the-journal — a spurious
      // wake costs one idle cycle; a missed wake would cost a full poll interval.
      watcher = fs.watch(mqDir, (_event, filename) => {
        if (filename !== null && filename !== JOURNAL_FILE) return
        if (debounce !== null) clearTimeout(debounce)
        debounce = setTimeout(() => finish('journal'), debounceMs)
      })
      watcher.on('error', () => {
        // The watcher died (e.g. the directory was removed) — degrade to the
        // poll timer rather than rejecting; the daemon loop must never crash
        // because a watch backend hiccuped.
        try { watcher?.close() } catch { /* already closed */ }
        watcher = null
      })
    } catch {
      // fs.watch unsupported here — the poll timer alone resolves.
    }
  })
}
```

- [ ] Run: `npx vitest run src/merge-queue/wake.test.ts` — expect all 5 pass.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): waitForWake — debounced fs.watch journal wake with poll fallback (D15)"`

---

### Task 6: D15 — daemon idle path awaits the wake instead of a fixed sleep

**Files:**
- Modify: `src/merge-queue/daemon.ts` (`DaemonDeps`, `run()`, remove the `sleep` helper)
- Modify: `src/merge-queue/daemon.test.ts`

**Interfaces:**
- Produces: `DaemonDeps.wake?: (mqDir: string, timeoutMs: number) => Promise<'journal' | 'timeout'>` (injectable seam; production default `waitForWake`).
- Consumes: `waitForWake` from `./wake.js`.

**Steps:**

- [ ] Add the failing test to `src/merge-queue/daemon.test.ts` (inside `describe('MergeQueueDaemon.run', …)`):

```ts
  it('idle cycles await the journal wake instead of a fixed sleep (D15)', async () => {
    let calls = 0
    const h = harness({
      wake: async () => {
        calls += 1
        if (calls === 2) throw new Error('stop-loop')
        return 'journal' as const
      },
    })
    fs.mkdirSync(h.mqDir, { recursive: true })
    fs.writeFileSync(path.join(h.mqDir, PAUSED_FILE), 'hold\n') // every cycle is idle
    await expect(h.daemon.run()).rejects.toThrow(/stop-loop/)
    expect(calls).toBe(2)
  })
```

- [ ] Run: `npx vitest run src/merge-queue/daemon.test.ts` — expect the new test FAILS (type error / sleep still used).
- [ ] In `src/merge-queue/daemon.ts`:
  - Add the import: `import { waitForWake } from './wake.js'`
  - Add to `DaemonDeps` (after `now`):

```ts
  /** D15 seam: wait for a journal append or the poll timeout while idle.
   *  Production default is waitForWake (fs.watch + debounce). */
  wake?: (mqDir: string, timeoutMs: number) => Promise<'journal' | 'timeout'>
```

  - Delete the now-unused module-level helper `const sleep = (ms: number) => …`.
  - In `run()`, replace:

```ts
      if (outcome === 'idle') await sleep(this.deps.config.poll_seconds * 1000)
```

  with:

```ts
      if (outcome === 'idle') {
        // D15: wake immediately on a journal append (enqueue / eject / release
        // from another process); poll_seconds remains the fallback ceiling.
        await (this.deps.wake ?? waitForWake)(
          this.deps.mqDir, this.deps.config.poll_seconds * 1000,
        )
      }
```

- [ ] Run: `npx vitest run src/merge-queue/daemon.test.ts` — expect ALL pass.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): daemon idle loop wakes on journal appends (D15)"`

---

### Task 7: D15 — daemon kicks one poller pass after a landing

**Files:**
- Modify: `src/merge-queue/daemon.ts` (`DaemonDeps.triggerPoller`, `land()` returns the landed count, green branch of `runBatch`)
- Modify: `src/merge-queue/daemon.test.ts`
- Modify: `src/cli/commands/mq.ts` (production `triggerPoller` wiring)

**Interfaces:**
- Produces: `DaemonDeps.triggerPoller?: () => void` (fire-and-forget seam); `private async land(...): Promise<number>` (count of PRs actually merged).
- Consumes (production wiring): `scripts/ops/post-merge-poller.sh` at the primary root (the agent-ops install dest — `AGENT_OPS_FILE_MAP['merge-queue/post-merge-poller.sh.tmpl'].dest`), spawned detached; only when `config.gate_executor === 'local-poller'`. The poller's own mkdir lock serializes overlapping passes; the D6 scheduler remains the safety net for merges from other machines.

**Steps:**

- [ ] Add the failing tests to `src/merge-queue/daemon.test.ts` (inside `describe('MergeQueueDaemon.cycle', …)`):

```ts
  it('kicks one poller pass after a green landing (D15)', async () => {
    let kicks = 0
    const h = harness({ triggerPoller: () => { kicks += 1 } })
    h.enqueue(1)
    h.enqueue(2)
    await h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'LANDED' })
    expect(kicks).toBe(1)
  })

  it('does not kick the poller when nothing landed', async () => {
    let kicks = 0
    const h = harness({ triggerPoller: () => { kicks += 1 } })
    h.enqueue(1)
    h.gh.failMerge.add(1) // merge fails, PR not merged -> abort + rebuild, zero landed
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('REQUEUED_SPLIT')
    expect(kicks).toBe(0)
  })

  it('a throwing triggerPoller never breaks the landing', async () => {
    const h = harness({ triggerPoller: () => { throw new Error('poller spawn failed') } })
    h.enqueue(1)
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('LANDED')
    expect(h.daemon.paused()).toBeNull()
  })
```

- [ ] Run: `npx vitest run src/merge-queue/daemon.test.ts` — expect the 3 new tests FAIL.
- [ ] In `src/merge-queue/daemon.ts`:
  - Add to `DaemonDeps` (after `wake`):

```ts
  /** D15: fire ONE post-merge poller pass right after a landing (main just
   *  moved). Best-effort; the scheduler remains the cross-machine safety net. */
  triggerPoller?: () => void
```

  - Change `land`'s signature to `private async land(batchId: string, members: number[], base: string, candidateTree: string, testedHeads: Map<number, string>): Promise<number>` and make every return path report how many PRs actually merged:
    - pre-land invalidation (`if (invalidated !== null) { … }`): `return` → `return 0`
    - withdrawal-during-landing with `landed.length === 0` (the abort+rebuild branch): `return` → `return 0`
    - withdrawal-during-landing after some landed (the pause branch): `return` → `return landed.length`
    - lost-ack `continue` path: unchanged (loop continues)
    - indeterminate-merge pause branch: `return` → `return landed.length`
    - merge-failed-before-any-land branch: `return` → `return 0`
    - partial-landing pause branch: `return` → `return landed.length`
    - NRS-violation branch: `return` → `return landed.length`
    - final success path: after the closing `log(...)` line, add `return landed.length`
  - In `runBatch`, replace the green branch:

```ts
    if (gate.result === 'green') {
      const testedHeads = new Map(prs.map(p => [p.pr, p.headSha]))
      const landedCount = await this.land(batchId, applied, base, candidateTree, testedHeads)
      git.deleteCandidate(batchId)
      if (landedCount > 0) {
        // D15: the base just moved — kick one post-merge poller pass directly
        // instead of waiting for the scheduler. Fire-and-forget: a pause set
        // during landing is respected by the poller itself (non-poller pauses
        // make it skip), so kicking unconditionally on any landing is safe.
        try { this.deps.triggerPoller?.() } catch { /* advisory only */ }
      }
      return { kind: 'done' }
    }
```

- [ ] Run: `npx vitest run src/merge-queue/daemon.test.ts` — expect ALL pass.
- [ ] In `src/cli/commands/mq.ts`, inside `case 'daemon'` after `const config = loadAgentOpsConfig(primary).merge_queue`, add the production wiring and pass it to the constructor:

```ts
      const pollerScript = path.join(primary, 'scripts', 'ops', 'post-merge-poller.sh')
      const triggerPoller = (): void => {
        // Only meaningful when the local poller is the gate executor and the
        // script is installed; its own lock serializes overlapping passes.
        if (config.gate_executor !== 'local-poller') return
        if (!fs.existsSync(pollerScript)) return
        const child = spawn('bash', [pollerScript], { detached: true, stdio: 'ignore' })
        child.unref()
      }
```

  and in the `new MergeQueueDaemon({ … })` deps object add `triggerPoller,` after `now: () => new Date(),`.

- [ ] Run: `npm run check` — expect green.
- [ ] Run: `npm run test:e2e` — expect the merge-queue e2e suite still green (wake/trigger are inert there: `run({ once })` never reaches the idle wait, and the worlds have no poller script).
- [ ] Commit: `git add -A && git commit -m "feat(mq): daemon kicks one poller pass after landing (D15)"`

**D15 is complete and shippable here.**

---

### Task 8: D13 — types, reducer, config: `HELD_HUMAN`, `pr_files`, `released`, overlap keys

**Files:**
- Modify: `src/merge-queue/types.ts`
- Modify: `src/merge-queue/state.ts`
- Modify: `src/merge-queue/state.test.ts`
- Modify: `src/core/agent-ops/config.ts` (+ `src/core/agent-ops/config.test.ts`)

**Interfaces:**
- Produces: `PrState` gains `'HELD_HUMAN'` (NOT terminal, NOT batchable); `PrEntry` gains `files?: string[]`, `filesHeadSha?: string`, `zoneReleased?: boolean`; journal events `{ type: 'pr_files'; pr: number; headSha: string; files: string[]; at: string }` and `{ type: 'released'; pr: number; at: string }`; config `merge_queue.overlap_zones: string[]` (default `[]`) and `merge_queue.overlap_zone_policy: 'solo' | 'hold'` (default `'solo'`).
- Consumes: nothing new.

**Steps:**

- [ ] Add the failing reducer tests to `src/merge-queue/state.test.ts` (inside the existing describe; import `TERMINAL_PR_STATES` and `queuedPrs` from `./state.js` if not already imported; `AT` is any ISO timestamp constant the file already uses — add `const AT = '2026-07-19T12:00:00.000Z'` if absent):

```ts
  it('caches pr_files on the entry (files + the head sha they were fetched at)', () => {
    const state = reduceState([
      { type: 'enqueued', pr: 1, at: AT },
      { type: 'pr_files', pr: 1, headSha: 'sha1', files: ['a.ts', 'b.ts'], at: AT },
    ])
    expect(state.entries.get(1)?.files).toEqual(['a.ts', 'b.ts'])
    expect(state.entries.get(1)?.filesHeadSha).toBe('sha1')
  })

  it('pr_files for an unknown PR is ignored', () => {
    const state = reduceState([
      { type: 'pr_files', pr: 9, headSha: 's', files: ['a.ts'], at: AT },
    ])
    expect(state.entries.size).toBe(0)
  })

  it('released flips HELD_HUMAN back to QUEUED and marks zoneReleased', () => {
    const state = reduceState([
      { type: 'enqueued', pr: 1, at: AT },
      { type: 'pr_state', pr: 1, state: 'HELD_HUMAN', at: AT },
      { type: 'released', pr: 1, at: AT },
    ])
    expect(state.entries.get(1)?.state).toBe('QUEUED')
    expect(state.entries.get(1)?.zoneReleased).toBe(true)
  })

  it('released on a non-held PR is a no-op', () => {
    const state = reduceState([
      { type: 'enqueued', pr: 1, at: AT },
      { type: 'released', pr: 1, at: AT },
    ])
    expect(state.entries.get(1)?.state).toBe('QUEUED')
    expect(state.entries.get(1)?.zoneReleased).toBeUndefined()
  })

  it('HELD_HUMAN is neither terminal nor batchable', () => {
    const state = reduceState([
      { type: 'enqueued', pr: 1, at: AT },
      { type: 'pr_state', pr: 1, state: 'HELD_HUMAN', at: AT },
    ])
    expect(TERMINAL_PR_STATES.has('HELD_HUMAN')).toBe(false)
    expect(queuedPrs(state)).toEqual([])
  })
```

- [ ] Run: `npx vitest run src/merge-queue/state.test.ts` — expect FAILURE (type errors on the new event/state names).
- [ ] In `src/merge-queue/types.ts`:
  - Extend `PrState`:

```ts
export type PrState =
  | 'QUEUED' | 'IN_BATCH' | 'TESTING' | 'FLAKE_RETRY' | 'PASSED' | 'LANDING' | 'LANDED'
  | 'REQUEUED_SPLIT' | 'EJECTED' | 'NEEDS_REBASE' | 'CANCELLED'
  /** D13: parked by overlap_zone_policy=hold until `scaffold mq release --pr N`.
   *  Deliberately NOT terminal: `mq eject` can still cancel a held PR, and
   *  queuedPrs never selects it, so it sits outside batching until released. */
  | 'HELD_HUMAN'
```

  - Extend `PrEntry` (after `queueFailures`):

```ts
  /** D13: changed-file set cached from `gh pr diff --name-only` (pr_files event). */
  files?: string[]
  /** Head sha the cached file set was fetched at; a moved head invalidates it. */
  filesHeadSha?: string
  /** D13: a human released this PR from an overlap-zone hold — never re-hold it
   *  (it still only ever lands solo-gated, which is what the zone protects). */
  zoneReleased?: boolean
```

  - Extend the `JournalEvent` union (after the Task 1 additions):

```ts
  | { type: 'pr_files'; pr: number; headSha: string; files: string[]; at: string }
  | { type: 'released'; pr: number; at: string }
```

  - Extend `MergeQueueConfig` (after `gate_cache_max_entries`):

```ts
  /** D13: minimatch globs; a PR touching a zone never shares a batch. */
  overlap_zones: string[]
  /** D13: zone-touching PR handling — land it solo-gated (default) or hold it
   *  for `scaffold mq release`. */
  overlap_zone_policy: 'solo' | 'hold'
```

  and `defaultMergeQueueConfig()` gains:

```ts
    overlap_zones: [],
    overlap_zone_policy: 'solo',
```

- [ ] In `src/merge-queue/state.ts`, add the reducer cases (before the `gate_metrics` no-op group):

```ts
    case 'pr_files': {
      const entry = state.entries.get(e.pr)
      if (!entry) break
      entry.files = e.files
      entry.filesHeadSha = e.headSha
      break
    }
    case 'released': {
      const entry = state.entries.get(e.pr)
      if (!entry || entry.state !== 'HELD_HUMAN') break // only a hold can be released
      entry.state = 'QUEUED'
      entry.zoneReleased = true
      break
    }
```

- [ ] Run: `npx vitest run src/merge-queue/state.test.ts` — expect all pass.
- [ ] In `src/core/agent-ops/config.ts`, add validation inside the `merge_queue` block (after the Task 1 `gate_cache_max_entries` block):

```ts
    if (mq.overlap_zones !== undefined) {
      if (!Array.isArray(mq.overlap_zones)) {
        fail('merge_queue.overlap_zones must be a list of glob strings')
      }
      cfg.merge_queue.overlap_zones = mq.overlap_zones.map(z => {
        if (typeof z !== 'string' || z.trim() === '') {
          fail('merge_queue.overlap_zones entries must be non-empty strings')
        }
        return z
      })
    }
    if (mq.overlap_zone_policy !== undefined) {
      if (mq.overlap_zone_policy !== 'solo' && mq.overlap_zone_policy !== 'hold') {
        fail(
          `merge_queue.overlap_zone_policy must be "solo" or "hold", got ${JSON.stringify(mq.overlap_zone_policy)}`,
        )
      }
      cfg.merge_queue.overlap_zone_policy = mq.overlap_zone_policy
    }
```

- [ ] Add to `src/core/agent-ops/config.test.ts`:

```ts
  it('parses overlap zones + policy and applies the solo default', () => {
    expect(loadAgentOpsConfig(tmpProject()).merge_queue.overlap_zone_policy).toBe('solo')
    expect(loadAgentOpsConfig(tmpProject()).merge_queue.overlap_zones).toEqual([])
    const dir = tmpProject(`
project_name: myapp
merge_queue:
  overlap_zones: ["migrations/**", "index.html"]
  overlap_zone_policy: hold
`)
    const cfg = loadAgentOpsConfig(dir)
    expect(cfg.merge_queue.overlap_zones).toEqual(['migrations/**', 'index.html'])
    expect(cfg.merge_queue.overlap_zone_policy).toBe('hold')
  })

  it('rejects a bad overlap_zone_policy and empty zone globs', () => {
    const badPolicy = tmpProject(`
project_name: myapp
merge_queue:
  overlap_zone_policy: ask
`)
    expect(() => loadAgentOpsConfig(badPolicy)).toThrow(/overlap_zone_policy/)
    const badZone = tmpProject(`
project_name: myapp
merge_queue:
  overlap_zones: [""]
`)
    expect(() => loadAgentOpsConfig(badZone)).toThrow(/overlap_zones/)
  })
```

- [ ] Run: `npx vitest run src/core/agent-ops/config.test.ts src/merge-queue` — expect all pass.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): HELD_HUMAN state, pr_files/released events, overlap-zone config (D13)"`

---

### Task 9: D13 — conflict-aware `composeBatch` + overlap-zone matching

**Files:**
- Modify: `src/merge-queue/batch.ts`
- Modify: `src/merge-queue/batch.test.ts`

**Interfaces:**
- Produces: `composeBatch(queued: PrEntry[], infos: Map<number, DiffSize>, cap: number, opts?: ComposeOpts): number[]` where `ComposeOpts = { files?: Map<number, string[] | null>; overlapZones?: string[] }`; `touchesOverlapZone(files: string[], zones: string[]): boolean`. Omitting `opts.files` preserves the legacy no-partitioning behavior exactly (existing callers/tests unchanged).
- Consumes: `minimatch` (existing dependency), `{ dot: true }` so dotfiles match.

**Steps:**

- [ ] Add the failing tests to `src/merge-queue/batch.test.ts`:

```ts
describe('composeBatch — conflict-aware partitioning (D13)', () => {
  const infos = new Map([
    [1, { additions: 1, deletions: 0 }],
    [2, { additions: 2, deletions: 0 }],
    [3, { additions: 3, deletions: 0 }],
  ])

  it('overlapping PRs never share a batch; disjoint later PRs still join', () => {
    const files = new Map<number, string[] | null>([
      [1, ['src/a.ts']], [2, ['src/a.ts', 'src/b.ts']], [3, ['src/c.ts']],
    ])
    expect(composeBatch([entry(1), entry(2), entry(3)], infos, 5, { files })).toEqual([1, 3])
  })

  it('preserves low-risk-first anchoring', () => {
    const files = new Map<number, string[] | null>([[1, ['x.ts']], [2, ['x.ts']]])
    // 1 is lower risk -> anchors the batch; 2 overlaps and waits its turn.
    expect(composeBatch([entry(2), entry(1)], infos, 5, { files })).toEqual([1])
  })

  it('an unknown file set (null) is solo-only: anchors alone, never joins', () => {
    const files = new Map<number, string[] | null>([
      [1, ['a.ts']], [2, null], [3, ['c.ts']],
    ])
    expect(composeBatch([entry(1), entry(2), entry(3)], infos, 5, { files })).toEqual([1, 3])
    expect(composeBatch([entry(2), entry(3)], infos, 5, { files })).toEqual([2])
  })

  it('a PR absent from a provided files map is treated as unknown (solo-only)', () => {
    const files = new Map<number, string[] | null>([[1, ['a.ts']]])
    expect(composeBatch([entry(1), entry(2)], infos, 5, { files })).toEqual([1])
  })

  it('a zone-touching PR is batched alone even against disjoint peers', () => {
    const files = new Map<number, string[] | null>([
      [1, ['migrations/001.sql']], [2, ['src/b.ts']],
    ])
    expect(composeBatch([entry(1), entry(2)], infos, 5, {
      files, overlapZones: ['migrations/**'],
    })).toEqual([1])
    // ...and it cannot JOIN a batch anchored by someone else
    expect(composeBatch([entry(2), entry(1)], infos, 5, {
      files, overlapZones: ['migrations/**'],
    })).toEqual([2])
  })

  it('omitting the files map preserves the legacy no-partitioning behavior', () => {
    expect(composeBatch([entry(1), entry(2), entry(3)], infos, 2)).toEqual([1, 2])
  })
})

describe('touchesOverlapZone', () => {
  it('matches minimatch globs including dotfiles', () => {
    expect(touchesOverlapZone(['migrations/001.sql'], ['migrations/**'])).toBe(true)
    expect(touchesOverlapZone(['index.html'], ['index.html'])).toBe(true)
    expect(touchesOverlapZone(['.github/workflows/ci.yml'], ['.github/**'])).toBe(true)
    expect(touchesOverlapZone(['src/a.ts'], ['migrations/**'])).toBe(false)
    expect(touchesOverlapZone(['src/a.ts'], [])).toBe(false)
  })
})
```

  (import `touchesOverlapZone` alongside the existing `composeBatch` import.)

- [ ] Run: `npx vitest run src/merge-queue/batch.test.ts` — expect FAILURE.
- [ ] Rewrite `src/merge-queue/batch.ts`:

```ts
import { minimatch } from 'minimatch'
import type { PrEntry } from './types.js'

interface DiffSize { additions: number; deletions: number }

export function riskScore(entry: PrEntry, info: DiffSize): number {
  return info.additions + info.deletions + entry.queueFailures * 1000
}

export interface ComposeOpts {
  /** pr -> changed files. A pr mapped to (or defaulting to) null has an UNKNOWN
   *  file set and conservatively conflicts with everything (solo batch only).
   *  Omit the map entirely to disable conflict partitioning (legacy behavior). */
  files?: Map<number, string[] | null>
  /** minimatch globs (dot:true); a PR touching a zone is only ever batched solo. */
  overlapZones?: string[]
}

export function touchesOverlapZone(files: string[], zones: string[]): boolean {
  return files.some(f => zones.some(z => minimatch(f, z, { dot: true })))
}

/** D13: greedy conflict-aware batch composition, preserving low-risk-first
 *  order. The lowest-risk PR anchors the batch; each later PR joins only if its
 *  file set is known and disjoint from every member so far. Skipped PRs stay
 *  QUEUED for a later cycle — overlapping PRs NEVER share a batch (bisection
 *  cannot separate entangled diffs, and a mid-batch merge conflict would wedge
 *  the candidate). */
export function composeBatch(
  queued: PrEntry[],
  infos: Map<number, DiffSize>,
  cap: number,
  opts: ComposeOpts = {},
): number[] {
  const scored = queued.map(e => {
    const info = infos.get(e.pr)
    return { pr: e.pr, score: info ? riskScore(e, info) : Number.MAX_SAFE_INTEGER }
  }).sort((a, b) => a.score - b.score)
  const zones = opts.overlapZones ?? []
  // No files map at all -> every file set counts as known-empty (legacy path).
  const filesOf = (pr: number): string[] | null =>
    opts.files === undefined ? [] : opts.files.get(pr) ?? null
  const members: number[] = []
  const taken = new Set<string>()
  for (const { pr } of scored) {
    if (members.length >= cap) break
    const files = filesOf(pr)
    if (files === null || (zones.length > 0 && touchesOverlapZone(files, zones))) {
      // Unknown file set or overlap zone: this PR is only ever gated alone. It
      // can anchor an empty batch (and closes it) — otherwise it waits.
      if (members.length === 0) {
        members.push(pr)
        return members
      }
      continue
    }
    if (members.length === 0) {
      members.push(pr)
      for (const f of files) taken.add(f)
      continue
    }
    if (files.some(f => taken.has(f))) continue // overlaps a member — next cycle
    members.push(pr)
    for (const f of files) taken.add(f)
  }
  return members
}

export function splitBatch(members: number[]): [number[], number[]] {
  if (members.length < 2) throw new Error('cannot split a singleton batch — eject it instead')
  const mid = Math.floor(members.length / 2)
  return [members.slice(0, mid), members.slice(mid)]
}
```

- [ ] Run: `npx vitest run src/merge-queue/batch.test.ts` — expect ALL pass (legacy tests included, untouched).
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): conflict-aware composeBatch with overlap zones (D13)"`

---

### Task 10: D13 — gh `changedFiles` seam + daemon file collection, hold policy, partitioned compose

**Files:**
- Modify: `src/merge-queue/gh.ts` (`GhClient.changedFiles`)
- Modify: `src/merge-queue/daemon.ts` (collection loop + compose call)
- Modify: `src/merge-queue/daemon.test.ts` (`FakeGh` + new tests)
- Modify: `tests/merge-queue-e2e.test.ts` (gh stub answers `pr diff`)

**Interfaces:**
- Produces: `GhClient.changedFiles(pr: number): string[]` (runs `gh pr diff <pr> --name-only`); daemon journals `pr_files` keyed by head sha and passes `{ files, overlapZones }` into `composeBatch`; `hold` policy transitions zone-touching PRs to `HELD_HUMAN` (skipping `zoneReleased` entries).
- Consumes: `touchesOverlapZone` from `./batch.js`; `config.overlap_zones` / `config.overlap_zone_policy` (Task 8).

**Steps:**

- [ ] In `src/merge-queue/daemon.test.ts`, extend `FakeGh` with the new seam (add the fields next to `infos` and the method next to `listLabeled`):

```ts
  files = new Map<number, string[]>()
  failFiles = new Set<number>()
  filesCalls: number[] = []
  changedFiles(pr: number): string[] {
    this.filesCalls.push(pr)
    if (this.failFiles.has(pr)) throw new Error('diff unavailable')
    return this.files.get(pr) ?? []
  }
```

  (Unset PRs default to `[]` = known-empty, so every existing test batches exactly as before.)

- [ ] Add the failing tests (inside `describe('MergeQueueDaemon.cycle', …)`):

```ts
  it('overlapping PRs land in successive cycles, never one batch (D13)', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.gh.files.set(1, ['src/shared.ts'])
    h.gh.files.set(2, ['src/shared.ts'])
    await h.daemon.cycle()
    expect(h.git.constructed.map(c => c.prs)).toEqual([[1]])
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'QUEUED' })
    await h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'LANDED' })
  })

  it('journals pr_files and skips refetching while the head is unchanged', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.gh.files.set(1, ['src/shared.ts'])
    h.gh.files.set(2, ['src/shared.ts'])
    await h.daemon.cycle()               // PR2 skipped (overlap) — files journaled
    await h.daemon.cycle()               // PR2 lands; its files come from the journal
    expect(h.states()[2]).toBe('LANDED')
    expect(h.gh.filesCalls.filter(pr => pr === 2)).toHaveLength(1)
    const filesEvents = readJournal(h.mqDir).filter(e => e.type === 'pr_files')
    expect(filesEvents.some(e => e.type === 'pr_files' && e.pr === 2 && e.headSha === 'sha2')).toBe(true)
  })

  it('a failed file listing degrades to a solo batch (unknown = overlaps everything)', async () => {
    const h = harness()
    h.enqueue(1)
    h.enqueue(2)
    h.gh.files.set(1, ['a.ts'])
    h.gh.failFiles.add(2)
    await h.daemon.cycle()
    expect(h.git.constructed.map(c => c.prs)).toEqual([[1]])
    expect(h.states()[2]).toBe('QUEUED')
  })

  it('solo policy gates a zone PR alone without holding it (D13 default)', async () => {
    const h = harness({
      config: {
        ...defaultMergeQueueConfig(), gate_cache_max_entries: 0,
        overlap_zones: ['migrations/**'],
      },
    })
    h.enqueue(1)
    h.enqueue(2)
    h.gh.files.set(1, ['migrations/001.sql'])
    h.gh.files.set(2, ['src/b.ts'])
    await h.daemon.cycle()
    expect(h.git.constructed.map(c => c.prs)).toEqual([[1]]) // zone PR solo (lowest risk anchors)
    await h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'LANDED', 2: 'LANDED' })
  })

  it('hold policy parks a zone PR in HELD_HUMAN with the release hint', async () => {
    const h = harness({
      config: {
        ...defaultMergeQueueConfig(), gate_cache_max_entries: 0,
        overlap_zones: ['migrations/**'], overlap_zone_policy: 'hold',
      },
    })
    h.enqueue(1)
    h.enqueue(2)
    h.gh.files.set(1, ['migrations/001.sql'])
    h.gh.files.set(2, ['src/b.ts'])
    await h.daemon.cycle()
    expect(h.states()).toEqual({ 1: 'HELD_HUMAN', 2: 'LANDED' })
    const entry = reduceState(readJournal(h.mqDir)).entries.get(1)
    expect(entry?.note).toContain('mq release --pr 1')
    await h.daemon.cycle() // held PR is untouched by later cycles
    expect(h.states()[1]).toBe('HELD_HUMAN')
  })

  it('a released PR is never re-held and lands solo-gated', async () => {
    const h = harness({
      config: {
        ...defaultMergeQueueConfig(), gate_cache_max_entries: 0,
        overlap_zones: ['migrations/**'], overlap_zone_policy: 'hold',
      },
    })
    h.enqueue(1)
    h.gh.files.set(1, ['migrations/001.sql'])
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('HELD_HUMAN')
    appendEvent(h.mqDir, { type: 'released', pr: 1, at: AT })
    await h.daemon.cycle()
    expect(h.states()[1]).toBe('LANDED')
  })
```

- [ ] Run: `npx vitest run src/merge-queue/daemon.test.ts` — expect the 6 new tests FAIL (`changedFiles` missing on the interface).
- [ ] In `src/merge-queue/gh.ts`, add to the `GhClient` interface (after `listLabeled`):

```ts
  /** D13: changed-file paths of the PR (`gh pr diff --name-only`). */
  changedFiles(pr: number): string[]
```

  and to the implementation object in `createGhClient` (after `listLabeled`):

```ts
    changedFiles(pr) {
      return gh(['pr', 'diff', String(pr), '--name-only'])
        .split('\n').map(l => l.trim()).filter(l => l !== '')
    },
```

- [ ] In `src/merge-queue/daemon.ts`:
  - Extend the batch import: `import { composeBatch, splitBatch, touchesOverlapZone } from './batch.js'`
  - In `cycle()`, inside the collection loop, right after `infos.set(entry.pr, info)` (before the `yieldToLoop` call), add:

```ts
      // D13: refresh the changed-file set when the head moved (or was never
      // fetched). Journaled so restarts and later cycles reuse it for free.
      if (entry.filesHeadSha !== info.headSha) {
        try {
          const files = gh.changedFiles(entry.pr)
          appendEvent(mqDir, {
            type: 'pr_files', pr: entry.pr, headSha: info.headSha, files, at: this.at(),
          })
          entry.files = files
          entry.filesHeadSha = info.headSha
        } catch (err) {
          // Unknown files conservatively overlap with everything (solo batch).
          log(`warn: could not list changed files for PR #${entry.pr}: ${String(err)}`)
          entry.files = undefined
          entry.filesHeadSha = undefined
        }
      }
```

  - Replace the compose call (`const members = composeBatch(eligible, infos, config.batch_cap)`) with:

```ts
    // D13: hold policy — a zone-touching PR is parked for a human instead of
    // being gated solo. Positive zone match only: unknown file sets go the
    // conservative SOLO route (never a silent human bottleneck), and a PR a
    // human already released is never re-held.
    const zones = config.overlap_zones
    let batchable = eligible
    if (zones.length > 0 && config.overlap_zone_policy === 'hold') {
      batchable = []
      for (const e of eligible) {
        const known = e.filesHeadSha !== undefined ? e.files ?? [] : null
        if (!e.zoneReleased && known !== null && touchesOverlapZone(known, zones)) {
          appendEvent(mqDir, {
            type: 'pr_state', pr: e.pr, state: 'HELD_HUMAN', at: this.at(),
            note: `touches an overlap zone — release with: scaffold mq release --pr ${e.pr}`,
          })
          continue
        }
        batchable.push(e)
      }
      if (batchable.length === 0) return 'idle'
    }
    const files = new Map<number, string[] | null>()
    for (const e of batchable) {
      files.set(e.pr, e.filesHeadSha !== undefined ? e.files ?? [] : null)
    }
    const members = composeBatch(batchable, infos, config.batch_cap, {
      files, overlapZones: zones,
    })
```

- [ ] Run: `npx vitest run src/merge-queue/daemon.test.ts` — expect ALL pass.
- [ ] In `tests/merge-queue-e2e.test.ts`, teach the `GH_STUB` python registry about `pr diff` (insert before the final `else:` arm):

```python
elif args[:2] == ['pr', 'diff']:
    pr = load()[args[2]]
    for f in pr.get('files', []):
        print(f)
```

  (Registry entries carry no `files` key, so every e2e PR reports a known-empty set — batching behavior in the e2e worlds is unchanged.)

- [ ] Run: `npm run test:e2e` — expect the e2e suite green.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): daemon collects changed-file sets, partitions batches, hold policy (D13)"`

---

### Task 11: D13 — `scaffold mq release` + held-PR surfacing in `mq status`

**Files:**
- Modify: `src/cli/commands/mq.ts`
- Modify: `src/cli/commands/mq.test.ts`

**Interfaces:**
- Produces: CLI action `scaffold mq release --pr <N>` (appends the `released` journal event, autostarts the daemon like `enqueue` — and the Task 6 journal wake picks it up immediately); `mq status` prints a prominent `HELD` warn line per held PR (text mode) and a `held: number[]` field (json mode).
- Consumes: `released` event + `zoneReleased` reducer semantics (Task 8).

**Steps:**

- [ ] Add the failing tests to `src/cli/commands/mq.test.ts` (add `vi` to the vitest import):

```ts
  it('release flips a HELD_HUMAN PR back to QUEUED (zoneReleased)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    await mqHandler({ action: 'enqueue', pr: 4, root })
    appendEvent(mqDir, {
      type: 'pr_state', pr: 4, state: 'HELD_HUMAN', at: new Date().toISOString(),
    })
    await mqHandler({ action: 'release', pr: 4, root })
    const entry = reduceState(readJournal(mqDir)).entries.get(4)
    expect(entry?.state).toBe('QUEUED')
    expect(entry?.zoneReleased).toBe(true)
  })

  it('release on a PR that is not held appends nothing', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', pr: 4, root })
    await mqHandler({ action: 'release', pr: 4, root })
    await mqHandler({ action: 'release', pr: 99, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events.filter(e => e.type === 'released')).toHaveLength(0)
  })

  it('eject still works on a HELD_HUMAN PR (held is not terminal)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    await mqHandler({ action: 'enqueue', pr: 5, root })
    appendEvent(mqDir, {
      type: 'pr_state', pr: 5, state: 'HELD_HUMAN', at: new Date().toISOString(),
    })
    await mqHandler({ action: 'eject', pr: 5, root })
    expect(reduceState(readJournal(mqDir)).entries.get(5)?.state).toBe('CANCELLED')
  })

  it('status surfaces held PRs with the release hint', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    await mqHandler({ action: 'enqueue', pr: 9, root })
    appendEvent(mqDir, {
      type: 'pr_state', pr: 9, state: 'HELD_HUMAN', at: new Date().toISOString(),
      note: 'touches an overlap zone',
    })
    const lines: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')) })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')) })
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')) })
    try {
      await mqHandler({ action: 'status', root })
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      errSpy.mockRestore()
    }
    const out = lines.join('\n')
    expect(out).toContain('HELD')
    expect(out).toContain('release --pr 9')
  })
```

- [ ] Run: `npx vitest run src/cli/commands/mq.test.ts` — expect the 4 new tests FAIL.
- [ ] In `src/cli/commands/mq.ts`:
  - Add `'release'` to the builder's `choices` array.
  - Add the case (next to `eject`):

```ts
  case 'release': {
    const pr = needPr()
    if (pr === null) return
    const entry = reduceState(readJournal(mqDir)).entries.get(pr)
    if (!entry) {
      output.warn(`PR #${pr} is not in the queue — nothing to release`)
      return
    }
    if (entry.state !== 'HELD_HUMAN') {
      output.warn(`PR #${pr} is ${entry.state}, not HELD_HUMAN — nothing to release`)
      return
    }
    appendEvent(mqDir, { type: 'released', pr, at: new Date().toISOString() })
    if (process.env.MQ_NO_AUTOSTART !== '1' && !daemonAlive(mqDir)) autostartDaemon(primary)
    output.success(
      `released PR #${pr} — it will be gated SOLO on the next cycle (overlap-zone PRs never batch)`,
    )
    return
  }
```

  - In the `status` case, after `entries` is computed, add the held surfacing (json result gains `held`; text mode warns before the listing):

```ts
    const held = entries.filter(e => e.state === 'HELD_HUMAN')
    if (argv.format === 'json') {
      output.result({
        paused, daemonAlive: daemonAlive(mqDir), held: held.map(e => e.pr), entries,
      })
      return
    }
    if (paused !== null) output.warn(`QUEUE PAUSED: ${paused}`)
    for (const e of held) {
      output.warn(
        `HELD for human review: #${e.pr}${e.note ? ` — ${e.note}` : ''} ` +
        `(run: scaffold mq release --pr ${e.pr})`,
      )
    }
```

    (replacing the existing json-result and paused-banner lines — the remainder of the case is unchanged.)

- [ ] Run: `npx vitest run src/cli/commands/mq.test.ts` — expect ALL pass.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): mq release action + held-PR surfacing in status (D13)"`

**D13 is complete and shippable here.**

---

### Task 12: D14 — `tia.record` config, `tia_recorded` event, coverage-map module

**Files:**
- Create: `src/tia/map.ts`
- Create: `src/tia/map.test.ts`
- Modify: `src/merge-queue/types.ts` (config + event)
- Modify: `src/merge-queue/state.ts` (no-op case)
- Modify: `src/core/agent-ops/config.ts` (+ `src/core/agent-ops/config.test.ts`)

**Interfaces:**
- Produces: `TiaMap { version: 1; head_sha: string; recorded_at: string; instrumented_seconds: number; file_hashes: Record<string, string>; tests: Record<string, string[]> }`; `TIA_DIR = 'tia'`, `TIA_MAP_FILE = 'map.json'`, `TIA_LAST_RECORDED_DAY_FILE = 'last-recorded-day'`; `isTestPath(rel)`, `tiaMapPath(mqDir)`, `readTiaMap(mqDir)`, `writeTiaMap(mqDir, map)`, `hashContent(buf)`, `buildTiaMap(opts)`.
- Produces: journal event `{ type: 'tia_recorded'; headSha: string; seconds: number; tests: number; files: number; at: string }`; config `merge_queue.tia: { record: 'scheduled' | 'always' | 'off' }` (default `{ record: 'scheduled' }`).
- Consumes: `NODE_V8_COVERAGE` dump format (`{ result: [{ url, … }] }`, one JSON per exited process).

**Steps:**

- [ ] In `src/merge-queue/types.ts`:
  - Extend the `JournalEvent` union:

```ts
  | { type: 'tia_recorded'; headSha: string; seconds: number; tests: number; files: number; at: string }
```

  - Extend `MergeQueueConfig` (after `overlap_zone_policy`):

```ts
  /** D14: coverage-map recording cadence for the poller's full runs.
   *  scheduled = first green pass per UTC day (default); always; off. */
  tia: { record: 'scheduled' | 'always' | 'off' }
```

  and `defaultMergeQueueConfig()` gains:

```ts
    tia: { record: 'scheduled' },
```

- [ ] In `src/merge-queue/state.ts`, extend the no-op group:

```ts
    case 'gate_cached':
    case 'full_gate_recorded':
    case 'tia_recorded':
      break
```

- [ ] In `src/core/agent-ops/config.ts`, add validation (after the Task 8 blocks):

```ts
    if (mq.tia !== undefined) {
      if (mq.tia === null || typeof mq.tia !== 'object' || Array.isArray(mq.tia)) {
        fail('merge_queue.tia must be a mapping')
      }
      const tia = mq.tia as Record<string, unknown>
      if (tia.record !== undefined) {
        if (tia.record !== 'scheduled' && tia.record !== 'always' && tia.record !== 'off') {
          fail(
            `merge_queue.tia.record must be "scheduled", "always", or "off", got ${JSON.stringify(tia.record)}`,
          )
        }
        cfg.merge_queue.tia.record = tia.record
      }
    }
```

- [ ] Add to `src/core/agent-ops/config.test.ts`:

```ts
  it('defaults tia.record to scheduled and parses explicit values', () => {
    expect(loadAgentOpsConfig(tmpProject()).merge_queue.tia.record).toBe('scheduled')
    const dir = tmpProject(`
project_name: myapp
merge_queue:
  tia:
    record: "off"
`)
    expect(loadAgentOpsConfig(dir).merge_queue.tia.record).toBe('off')
  })

  it('rejects an unknown tia.record value', () => {
    const bad = tmpProject(`
project_name: myapp
merge_queue:
  tia:
    record: sometimes
`)
    expect(() => loadAgentOpsConfig(bad)).toThrow(/tia\.record/)
  })
```

- [ ] Write the failing test `src/tia/map.test.ts`:

```ts
// src/tia/map.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildTiaMap, isTestPath, readTiaMap, writeTiaMap } from './map.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'tia-map-')) }

const AT = '2026-07-19T12:00:00.000Z'

function writeDump(
  dir: string, name: string, projectRoot: string, rels: string[], extras: string[] = [],
): void {
  const urls = [
    ...rels.map(r => pathToFileURL(path.join(projectRoot, r)).href),
    ...extras,
  ]
  fs.writeFileSync(path.join(dir, name), JSON.stringify({ result: urls.map(url => ({ url })) }))
}

describe('isTestPath', () => {
  it('recognizes the built-in test-file conventions', () => {
    expect(isTestPath('src/foo.test.ts')).toBe(true)
    expect(isTestPath('src/foo.spec.tsx')).toBe(true)
    expect(isTestPath('tests/e2e.bats')).toBe(true)
    expect(isTestPath('test/unit.py')).toBe(true)
    expect(isTestPath('src/foo.ts')).toBe(false)
    expect(isTestPath('contest/foo.ts')).toBe(false)
  })
})

describe('buildTiaMap', () => {
  it('attributes each dump to its test files and hashes referenced content', () => {
    const root = tmp()
    const cov = path.join(root, 'cov')
    fs.mkdirSync(cov)
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(root, 'src/a.test.ts'), 'import "./a"\n')
    writeDump(cov, 'coverage-1.json', root, ['src/a.test.ts', 'src/a.ts'], [
      pathToFileURL(path.join(root, 'node_modules/x/index.js')).href,
      'node:internal/modules',
      'https://example.invalid/x.js',
    ])
    const map = buildTiaMap({ coverageDir: cov, projectRoot: root, headSha: 'H', seconds: 30, now: AT })
    expect(map.tests).toEqual({ 'src/a.test.ts': ['src/a.ts'] })
    expect(Object.keys(map.file_hashes).sort()).toEqual(['src/a.test.ts', 'src/a.ts'])
    expect(map.file_hashes['src/a.ts']).toMatch(/^[0-9a-f]{64}$/)
    expect(map.head_sha).toBe('H')
    expect(map.instrumented_seconds).toBe(30)
  })

  it('unions sources across dumps that share a test file', () => {
    const root = tmp()
    const cov = path.join(root, 'cov')
    fs.mkdirSync(cov)
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    for (const f of ['src/a.ts', 'src/b.ts', 'src/a.test.ts']) {
      fs.writeFileSync(path.join(root, f), `// ${f}\n`)
    }
    writeDump(cov, 'coverage-1.json', root, ['src/a.test.ts', 'src/a.ts'])
    writeDump(cov, 'coverage-2.json', root, ['src/a.test.ts', 'src/b.ts'])
    const map = buildTiaMap({ coverageDir: cov, projectRoot: root, headSha: 'H', seconds: 1, now: AT })
    expect(map.tests['src/a.test.ts']).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('tolerates torn or foreign dumps and a missing coverage dir', () => {
    const root = tmp()
    const cov = path.join(root, 'cov')
    fs.mkdirSync(cov)
    fs.writeFileSync(path.join(cov, 'coverage-bad.json'), '{torn')
    expect(buildTiaMap({
      coverageDir: cov, projectRoot: root, headSha: 'H', seconds: 1, now: AT,
    }).tests).toEqual({})
    expect(buildTiaMap({
      coverageDir: path.join(root, 'missing'), projectRoot: root, headSha: 'H', seconds: 1, now: AT,
    }).tests).toEqual({})
  })
})

describe('readTiaMap / writeTiaMap', () => {
  it('round-trips through .mq/tia/map.json and rejects corruption', () => {
    const mqDir = tmp()
    expect(readTiaMap(mqDir)).toBeNull()
    const map = {
      version: 1 as const, head_sha: 'H', recorded_at: AT, instrumented_seconds: 5,
      file_hashes: { 'src/a.ts': 'x' }, tests: { 'src/a.test.ts': ['src/a.ts'] },
    }
    writeTiaMap(mqDir, map)
    expect(readTiaMap(mqDir)).toEqual(map)
    fs.writeFileSync(path.join(mqDir, 'tia', 'map.json'), '{nope')
    expect(readTiaMap(mqDir)).toBeNull()
  })
})
```

- [ ] Run: `npx vitest run src/tia/map.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/tia/map.ts`:

```ts
// src/tia/map.ts — D14: testmon-style test→files coverage map, built from
// NODE_V8_COVERAGE dumps of the poller's green full runs, keyed by content
// hashes so staleness is detectable without git archaeology.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TIA_DIR = 'tia'
export const TIA_MAP_FILE = 'map.json'
export const TIA_LAST_RECORDED_DAY_FILE = 'last-recorded-day'

export interface TiaMap {
  version: 1
  head_sha: string
  recorded_at: string
  instrumented_seconds: number
  /** repo-relative path -> sha256 of its content at record time */
  file_hashes: Record<string, string>
  /** test file (repo-relative) -> source files it executed */
  tests: Record<string, string[]>
}

/** Built-in convention for what counts as a test file. */
export function isTestPath(rel: string): boolean {
  if (/(^|\/)tests?\//.test(rel)) return true
  return /\.(test|spec)\.[^/]+$/.test(rel)
}

export function tiaMapPath(mqDir: string): string {
  return path.join(mqDir, TIA_DIR, TIA_MAP_FILE)
}

export function readTiaMap(mqDir: string): TiaMap | null {
  const file = tiaMapPath(mqDir)
  if (!fs.existsSync(file)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as TiaMap
    if (raw.version !== 1 || typeof raw.tests !== 'object' || raw.tests === null ||
        typeof raw.file_hashes !== 'object' || raw.file_hashes === null) {
      return null
    }
    return raw
  } catch {
    return null // a corrupt map is no map — selection falls back to the full suite
  }
}

export function writeTiaMap(mqDir: string, map: TiaMap): void {
  const file = tiaMapPath(mqDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

export function hashContent(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/** Parse NODE_V8_COVERAGE dumps. Attribution model: vitest/jest with an
 *  isolating pool run each test FILE in its own process, so each per-process
 *  dump containing test file T maps T to every project source the process
 *  loaded. Coarser pools (many test files per process) degrade to
 *  OVER-selection — never under-selection. */
export function buildTiaMap(opts: {
  coverageDir: string
  projectRoot: string
  headSha: string
  seconds: number
  now: string
}): TiaMap {
  const tests: Record<string, Set<string>> = {}
  const referenced = new Set<string>()
  const dumps = fs.existsSync(opts.coverageDir)
    ? fs.readdirSync(opts.coverageDir).filter(f => f.endsWith('.json'))
    : []
  for (const dump of dumps) {
    let urls: string[] = []
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(opts.coverageDir, dump), 'utf8'),
      ) as { result?: { url?: string }[] }
      urls = (raw.result ?? []).map(r => r.url ?? '')
    } catch {
      continue // a torn/foreign dump never poisons the map
    }
    const rels: string[] = []
    for (const url of urls) {
      if (!url.startsWith('file://')) continue
      let abs: string
      try { abs = fileURLToPath(url) } catch { continue }
      const rel = path.relative(opts.projectRoot, abs)
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue
      if (rel.split(path.sep).includes('node_modules')) continue
      rels.push(rel.split(path.sep).join('/'))
    }
    const testFiles = rels.filter(isTestPath)
    const sources = rels.filter(r => !isTestPath(r))
    for (const t of testFiles) {
      tests[t] ??= new Set()
      referenced.add(t)
      for (const s of sources) {
        tests[t].add(s)
        referenced.add(s)
      }
    }
  }
  const file_hashes: Record<string, string> = {}
  for (const rel of [...referenced].sort()) {
    const abs = path.join(opts.projectRoot, rel)
    if (fs.existsSync(abs)) file_hashes[rel] = hashContent(fs.readFileSync(abs))
  }
  return {
    version: 1,
    head_sha: opts.headSha,
    recorded_at: opts.now,
    instrumented_seconds: opts.seconds,
    file_hashes,
    tests: Object.fromEntries(
      Object.entries(tests).map(([t, s]) => [t, [...s].sort()]),
    ),
  }
}
```

- [ ] Run: `npx vitest run src/tia/map.test.ts src/core/agent-ops/config.test.ts src/merge-queue` — expect all pass.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(tia): coverage-map module, tia.record config, tia_recorded event (D14)"`

---

### Task 13: D14 — layered selection engine (`selectAffected`)

**Files:**
- Create: `src/tia/affected.ts`
- Create: `src/tia/affected.test.ts`

**Interfaces:**
- Produces: `selectAffected(opts: { map: TiaMap | null; changedFiles: string[]; commitDistance: number | null; hashOf: (rel: string) => string | null; flakeCounts?: Map<string, number> }): TiaSelection` where `TiaSelection = { verdict: 'selected' | 'full'; confidence: 'high' | 'low'; reason: string; tests: string[] }`; constants `TIA_MAX_COMMIT_DISTANCE = 50`, `TIA_MAX_HASH_MISS_RATIO = 0.2`, `FORCE_FULL_GLOBS` (mirrors the R2 gate script / knowledge-entry force-full list).
- Consumes: `isTestPath`, `TiaMap` from `./map.js`; `minimatch`.
- Layer model (spec D14): (1) infra-change ⇒ full + convention siblings; (2) the runner's own static selection stays the gate script's no-map path; (3) the coverage map drives selection here; the always-run smoke set remains a gate-script/template concern (`GATE_TIA_INVOCATION` may append it).

**Steps:**

- [ ] Write the failing test `src/tia/affected.test.ts`:

```ts
// src/tia/affected.test.ts
import { describe, expect, it } from 'vitest'
import { TIA_MAX_COMMIT_DISTANCE, selectAffected } from './affected.js'
import type { TiaMap } from './map.js'

const AT = '2026-07-19T12:00:00.000Z'

function mkMap(over: Partial<TiaMap> = {}): TiaMap {
  return {
    version: 1, head_sha: 'H', recorded_at: AT, instrumented_seconds: 10,
    file_hashes: {
      'src/a.ts': 'hash-a', 'src/b.ts': 'hash-b',
      'src/a.test.ts': 'hash-at', 'src/b.test.ts': 'hash-bt',
    },
    tests: {
      'src/a.test.ts': ['src/a.ts'],
      'src/b.test.ts': ['src/b.ts'],
    },
    ...over,
  }
}

/** hashOf faking current disk state: everything matches the map by default;
 *  overrides simulate edits (new hash) or deletions (null). */
function hashOf(map: TiaMap, changed: Record<string, string | null> = {}) {
  return (rel: string): string | null => {
    if (rel in changed) return changed[rel]
    return map.file_hashes[rel] ?? null
  }
}

describe('selectAffected — full-suite fallbacks', () => {
  const map = mkMap()

  it('empty diff cannot be classified', () => {
    const s = selectAffected({ map, changedFiles: [], commitDistance: 0, hashOf: hashOf(map) })
    expect(s).toMatchObject({ verdict: 'full', confidence: 'low' })
    expect(s.tests).toEqual([])
  })

  it('infra changes force the full suite', () => {
    for (const f of [
      'package-lock.json', '.github/workflows/ci.yml', 'migrations/001.sql',
      'vitest.config.ts', 'Makefile', 'packages/x/package.json',
    ]) {
      const s = selectAffected({ map, changedFiles: [f], commitDistance: 0, hashOf: hashOf(map) })
      expect(s.verdict).toBe('full')
      expect(s.reason).toContain('infra')
    }
  })

  it('no map / unknown map head / excessive commit distance are stale', () => {
    expect(selectAffected({
      map: null, changedFiles: ['src/a.ts'], commitDistance: 0, hashOf: () => null,
    }).verdict).toBe('full')
    expect(selectAffected({
      map, changedFiles: ['src/a.ts'], commitDistance: null, hashOf: hashOf(map),
    }).verdict).toBe('full')
    expect(selectAffected({
      map, changedFiles: ['src/a.ts'],
      commitDistance: TIA_MAX_COMMIT_DISTANCE + 1, hashOf: hashOf(map),
    }).verdict).toBe('full')
  })

  it('a high hash-miss ratio OUTSIDE the diff means the map is stale', () => {
    // The diff's own files are expected to drift — only unexplained drift counts.
    const s = selectAffected({
      map, changedFiles: ['src/a.ts'], commitDistance: 0,
      hashOf: hashOf(map, {
        'src/a.ts': 'edited',                       // expected (it changed)
        'src/b.ts': 'drifted', 'src/b.test.ts': 'drifted', // 2/3 unexplained > 0.2
      }),
    })
    expect(s.verdict).toBe('full')
    expect(s.reason).toContain('hash-miss')
  })

  it('a changed source with no coverage evidence fails closed', () => {
    const s = selectAffected({
      map, changedFiles: ['src/never-imported.ts'], commitDistance: 0, hashOf: hashOf(map),
    })
    expect(s.verdict).toBe('full')
    expect(s.reason).toContain('no coverage evidence')
  })
})

describe('selectAffected — selection and ordering', () => {
  it('selects covering tests plus convention siblings, high confidence', () => {
    const map = mkMap()
    const s = selectAffected({
      map, changedFiles: ['src/a.ts'], commitDistance: 3,
      hashOf: hashOf(map, { 'src/a.ts': 'edited' }),
    })
    expect(s).toMatchObject({ verdict: 'selected', confidence: 'high' })
    expect(s.tests).toEqual(['src/a.test.ts'])
  })

  it('a changed test file selects itself; a fully-deleted selection falls back to full', () => {
    const map = mkMap()
    const s = selectAffected({
      map, changedFiles: ['src/b.test.ts'], commitDistance: 0,
      hashOf: hashOf(map, { 'src/b.test.ts': 'edited' }),
    })
    expect(s.tests).toEqual(['src/b.test.ts'])
    const gone = selectAffected({
      map, changedFiles: ['src/b.test.ts'], commitDistance: 0,
      hashOf: hashOf(map, { 'src/b.test.ts': null }), // the test file was deleted
    })
    expect(gone.verdict).toBe('full')
  })

  it('orders most-likely-to-fail-first: flake count, then diff-churn overlap', () => {
    const map = mkMap({
      tests: {
        'src/a.test.ts': ['src/a.ts'],
        'src/b.test.ts': ['src/b.ts'],
        'src/wide.test.ts': ['src/a.ts', 'src/b.ts'],
      },
      file_hashes: {
        'src/a.ts': 'hash-a', 'src/b.ts': 'hash-b',
        'src/a.test.ts': 'hash-at', 'src/b.test.ts': 'hash-bt', 'src/wide.test.ts': 'hash-wt',
      },
    })
    const s = selectAffected({
      map, changedFiles: ['src/a.ts', 'src/b.ts'], commitDistance: 0,
      hashOf: hashOf(map, { 'src/a.ts': 'e', 'src/b.ts': 'e' }),
      flakeCounts: new Map([['src/b.test.ts', 2]]),
    })
    // flakiest first, then the test covering MORE of the diff, then lexicographic
    expect(s.tests).toEqual(['src/b.test.ts', 'src/wide.test.ts', 'src/a.test.ts'])
  })
})
```

- [ ] Run: `npx vitest run src/tia/affected.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/tia/affected.ts`:

```ts
// src/tia/affected.ts — D14: layered TIA selection. Pure core — every git fact
// (changed files, commit distance, current content hashes) is injected; the CLI
// wrapper (src/cli/commands/tia.ts) gathers them. Fail-closed design: every
// path that cannot be explained by recorded evidence routes to the full suite.
import { minimatch } from 'minimatch'
import { isTestPath, type TiaMap } from './map.js'

export const TIA_MAX_COMMIT_DISTANCE = 50
export const TIA_MAX_HASH_MISS_RATIO = 0.2

/** Force-full triggers — mirrors the R2 gate script and
 *  content/knowledge/core/test-impact-analysis.md. Keep the three lists in sync. */
export const FORCE_FULL_GLOBS = [
  'package.json', '**/package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  'pyproject.toml', 'uv.lock', 'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum',
  'Makefile', 'tsconfig*.json', '.swcrc', 'vitest.config.*', 'vite.config.*',
  'playwright.config.*', 'turbo.json', 'pytest.ini', '.github/workflows/**',
  'scripts/gate-check.sh', 'scripts/gate-check-affected.sh',
  'src/test-utils/**', 'conftest.py', '.env*', 'migrations/**', '**/*.sql', '**/*.proto',
]

export interface TiaSelection {
  verdict: 'selected' | 'full'
  confidence: 'high' | 'low'
  reason: string
  /** Selected test files, most-likely-to-fail-first. Empty when verdict=full. */
  tests: string[]
}

export function selectAffected(opts: {
  map: TiaMap | null
  changedFiles: string[]
  /** Commits between the map's head and HEAD; null = map head unknown to this repo. */
  commitDistance: number | null
  /** Current sha256 of a repo-relative file, or null when it does not exist. */
  hashOf: (rel: string) => string | null
  /** testId -> recent flake-event count (ordering signal); optional. */
  flakeCounts?: Map<string, number>
}): TiaSelection {
  const { map, changedFiles } = opts
  const full = (reason: string, confidence: 'high' | 'low' = 'high'): TiaSelection =>
    ({ verdict: 'full', confidence, reason, tests: [] })

  if (changedFiles.length === 0) return full('empty diff — cannot classify', 'low')
  for (const f of changedFiles) {
    if (FORCE_FULL_GLOBS.some(g => minimatch(f, g, { dot: true }))) {
      return full(`infra change: ${f}`)
    }
  }
  if (map === null) return full('no coverage map recorded yet', 'low')
  if (opts.commitDistance === null) return full('map head unknown to this repo (stale)', 'low')
  if (opts.commitDistance > TIA_MAX_COMMIT_DISTANCE) {
    return full(
      `map is ${opts.commitDistance} commits old (> ${TIA_MAX_COMMIT_DISTANCE})`, 'low',
    )
  }
  const hashedPaths = Object.keys(map.file_hashes)
  if (hashedPaths.length === 0) return full('coverage map is empty', 'low')
  // Hash-miss ratio: unexplained drift only. The current diff's own files are
  // EXPECTED to differ from the recorded hashes (that is what a diff is).
  const changedSet = new Set(changedFiles)
  let misses = 0
  let considered = 0
  for (const rel of hashedPaths) {
    if (changedSet.has(rel)) continue
    considered += 1
    if (opts.hashOf(rel) !== map.file_hashes[rel]) misses += 1
  }
  const missRatio = considered === 0 ? 0 : misses / considered
  if (missRatio > TIA_MAX_HASH_MISS_RATIO) {
    return full(
      `hash-miss ratio ${missRatio.toFixed(2)} exceeds ${TIA_MAX_HASH_MISS_RATIO} — map stale`,
      'low',
    )
  }

  const selected = new Set<string>()
  const churn = new Map<string, number>() // test -> DISTINCT changed files it covers
  for (const f of changedFiles) {
    if (isTestPath(f)) {
      if (opts.hashOf(f) !== null) selected.add(f) // a deleted test cannot run
      continue
    }
    // Collect this file's hits as a SET first so a test reached via both the
    // map and the sibling convention counts f's churn once, not twice.
    const hits = new Set<string>()
    let evidence = false
    for (const [test, sources] of Object.entries(map.tests)) {
      if (sources.includes(f)) {
        evidence = true
        if (opts.hashOf(test) !== null) hits.add(test)
      }
    }
    // Convention layer: src/foo.ts -> src/foo.test.ts sibling (covers brand-new
    // edges the recorded map cannot know about yet).
    const sibling = f.replace(/\.([^./]+)$/, '.test.$1')
    if (sibling !== f && opts.hashOf(sibling) !== null) {
      evidence = true
      hits.add(sibling)
    }
    if (!evidence) {
      // A changed source with no covering test, no sibling, and no map entry is
      // an unknown edge — fail closed.
      return full(`no coverage evidence for changed file: ${f}`, 'low')
    }
    for (const test of hits) {
      selected.add(test)
      churn.set(test, (churn.get(test) ?? 0) + 1)
    }
  }
  if (selected.size === 0) return full('selection is empty — refusing a zero-test gate', 'low')
  const flakes = opts.flakeCounts ?? new Map<string, number>()
  const tests = [...selected].sort((a, b) =>
    (flakes.get(b) ?? 0) - (flakes.get(a) ?? 0) ||
    (churn.get(b) ?? 0) - (churn.get(a) ?? 0) ||
    a.localeCompare(b))
  return {
    verdict: 'selected',
    confidence: 'high',
    reason: `selected ${tests.length} test file(s)`,
    tests,
  }
}
```

- [ ] Run: `npx vitest run src/tia/affected.test.ts` — expect all pass.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(tia): layered affected-test selection engine with fail-closed fallbacks (D14)"`

---

### Task 14: D14 — `scaffold tia` CLI (`affected` | `record-due` | `ingest`)

**Files:**
- Create: `src/cli/commands/tia.ts`
- Create: `src/cli/commands/tia.test.ts`
- Modify: `src/cli/index.ts` (register the command)

**Interfaces:**
- Produces: `scaffold tia affected --base <ref>` — stdout = selected test files one per line (most-likely-to-fail-first); exit `0` = run the selection; exit `3` = run the full suite (stale/low-confidence/infra/error); `--format json` prints the full `TiaSelection`. `scaffold tia record-due` — exit `0` = record this run (per `tia.record` + the per-day marker), exit `1` = don't. `scaffold tia ingest --coverage-dir <dir> --head <sha> --seconds <n>` — builds + writes the map, appends `tia_recorded`, stamps `last-recorded-day`, removes the dump dir.
- Consumes: `selectAffected` (Task 13), `buildTiaMap`/`readTiaMap`/`writeTiaMap`/`hashContent` (Task 12), `createGitOps().primaryRoot()` for `.mq` resolution (works from the gate worktree), journal `flake` events for the ordering signal.

**Steps:**

- [ ] Write the failing test `src/cli/commands/tia.test.ts`:

```ts
// src/cli/commands/tia.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { tiaHandler } from './tia.js'
import { readJournal } from '../../merge-queue/journal.js'
import { hashContent, writeTiaMap } from '../../tia/map.js'

function scratchRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tia-cli-'))
  execFileSync('git', ['init', '-b', 'main', dir])
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't'])
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t.invalid'])
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src/a.ts'), 'export const a = 1\n')
  fs.writeFileSync(path.join(dir, 'src/a.test.ts'), 'import "./a"\n')
  execFileSync('git', ['-C', dir, 'add', '.'])
  execFileSync('git', ['-C', dir, 'commit', '-m', 'base'])
  return dir
}

function mapFor(root: string, headSha: string) {
  return {
    version: 1 as const,
    head_sha: headSha,
    recorded_at: new Date().toISOString(),
    instrumented_seconds: 5,
    file_hashes: {
      'src/a.ts': hashContent(fs.readFileSync(path.join(root, 'src/a.ts'))),
      'src/a.test.ts': hashContent(fs.readFileSync(path.join(root, 'src/a.test.ts'))),
    },
    tests: { 'src/a.test.ts': ['src/a.ts'] },
  }
}

function branchEdit(root: string): void {
  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'feat'])
  fs.appendFileSync(path.join(root, 'src/a.ts'), '// edit\n')
  execFileSync('git', ['-C', root, 'commit', '-qam', 'edit'])
}

afterEach(() => { process.exitCode = 0 })

describe('scaffold tia affected', () => {
  it('emits the selected tests on stdout and exits 0', async () => {
    const root = scratchRepo()
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeTiaMap(path.join(root, '.mq'), mapFor(root, head))
    branchEdit(root)
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write')
      .mockImplementation((s: unknown) => { writes.push(String(s)); return true })
    try {
      await tiaHandler({ action: 'affected', base: 'main', root })
    } finally {
      spy.mockRestore()
    }
    expect(process.exitCode ?? 0).toBe(0)
    expect(writes.join('')).toContain('src/a.test.ts')
  })

  it('exits 3 when there is no map (full-suite fallback)', async () => {
    const root = scratchRepo()
    branchEdit(root)
    await tiaHandler({ action: 'affected', base: 'main', root })
    expect(process.exitCode).toBe(3)
  })

  it('exits 3 on an unresolvable base ref', async () => {
    const root = scratchRepo()
    await tiaHandler({ action: 'affected', base: 'origin/does-not-exist', root })
    expect(process.exitCode).toBe(3)
  })

  it('requires --base', async () => {
    const root = scratchRepo()
    await tiaHandler({ action: 'affected', root })
    expect(process.exitCode).toBe(1)
  })
})

describe('scaffold tia record-due', () => {
  it('scheduled: due when never recorded, not due twice the same day, off disables', async () => {
    const root = scratchRepo()
    await tiaHandler({ action: 'record-due', root })
    expect(process.exitCode ?? 0).toBe(0)
    fs.mkdirSync(path.join(root, '.mq', 'tia'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.mq', 'tia', 'last-recorded-day'),
      new Date().toISOString().slice(0, 10) + '\n',
    )
    process.exitCode = 0
    await tiaHandler({ action: 'record-due', root })
    expect(process.exitCode).toBe(1)
    fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.scaffold', 'agent-ops.yaml'),
      'project_name: t\nmerge_queue:\n  tia:\n    record: "off"\n',
    )
    process.exitCode = 0
    await tiaHandler({ action: 'record-due', root })
    expect(process.exitCode).toBe(1)
  })

  it('always: due even when already recorded today', async () => {
    const root = scratchRepo()
    fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.scaffold', 'agent-ops.yaml'),
      'project_name: t\nmerge_queue:\n  tia:\n    record: always\n',
    )
    fs.mkdirSync(path.join(root, '.mq', 'tia'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.mq', 'tia', 'last-recorded-day'),
      new Date().toISOString().slice(0, 10) + '\n',
    )
    await tiaHandler({ action: 'record-due', root })
    expect(process.exitCode ?? 0).toBe(0)
  })
})

describe('scaffold tia ingest', () => {
  it('builds the map, journals tia_recorded, stamps the day marker, clears the dumps', async () => {
    const root = scratchRepo()
    const cov = path.join(root, 'cov')
    fs.mkdirSync(cov)
    fs.writeFileSync(path.join(cov, 'coverage-1.json'), JSON.stringify({
      result: [
        { url: pathToFileURL(path.join(root, 'src/a.test.ts')).href },
        { url: pathToFileURL(path.join(root, 'src/a.ts')).href },
      ],
    }))
    await tiaHandler({ action: 'ingest', coverageDir: cov, head: 'HEADSHA', seconds: 77, root })
    const mqDir = path.join(root, '.mq')
    const map = JSON.parse(
      fs.readFileSync(path.join(mqDir, 'tia', 'map.json'), 'utf8'),
    ) as { tests: Record<string, string[]> }
    expect(map.tests).toEqual({ 'src/a.test.ts': ['src/a.ts'] })
    const events = readJournal(mqDir)
    expect(events[0]).toMatchObject({
      type: 'tia_recorded', headSha: 'HEADSHA', seconds: 77, tests: 1,
    })
    expect(fs.readFileSync(path.join(mqDir, 'tia', 'last-recorded-day'), 'utf8').trim())
      .toBe(new Date().toISOString().slice(0, 10))
    expect(fs.existsSync(cov)).toBe(false)
  })
})
```

- [ ] Run: `npx vitest run src/cli/commands/tia.test.ts` — expect FAILURE (module missing).
- [ ] Create `src/cli/commands/tia.ts`:

```ts
// src/cli/commands/tia.ts — D14: test-impact analysis CLI.
//   tia affected --base <ref>  -> stdout: selected tests (one per line); exit 0
//                                 run them / exit 3 run the FULL suite instead
//   tia record-due             -> exit 0 when the poller should instrument this run
//   tia ingest ...             -> build .mq/tia/map.json from NODE_V8_COVERAGE dumps
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadAgentOpsConfig } from '../../core/agent-ops/config.js'
import { createGitOps } from '../../merge-queue/git.js'
import { appendEvent, readJournal } from '../../merge-queue/journal.js'
import {
  TIA_DIR, TIA_LAST_RECORDED_DAY_FILE, buildTiaMap, hashContent, readTiaMap, writeTiaMap,
} from '../../tia/map.js'
import { selectAffected } from '../../tia/affected.js'

export interface TiaArgs {
  action: string
  base?: string
  coverageDir?: string
  head?: string
  seconds?: number
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

export async function tiaHandler(argv: TiaArgs): Promise<void> {
  const output = createOutputContext(resolveOutputMode(argv))
  const cwd = argv.root ?? process.cwd()
  const git = createGitOps(cwd)
  const primary = git.primaryRoot()
  const mqDir = path.join(primary, '.mq')

  switch (argv.action) {
  case 'affected': {
    if (!argv.base) {
      output.error('tia affected: --base <ref> is required')
      process.exitCode = 1
      return
    }
    const sh = (args: string[]): string =>
      execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 120_000 }).trim()
    let changedFiles: string[]
    try {
      changedFiles = sh(['diff', '--name-only', `${argv.base}...HEAD`])
        .split('\n').map(l => l.trim()).filter(l => l !== '')
    } catch {
      output.error(`tia affected: cannot diff against ${argv.base} — run the full suite`)
      process.exitCode = 3
      return
    }
    const map = readTiaMap(mqDir)
    let commitDistance: number | null = null
    if (map !== null) {
      try {
        commitDistance = Number(sh(['rev-list', '--count', `${map.head_sha}..HEAD`]))
        if (!Number.isFinite(commitDistance)) commitDistance = null
      } catch {
        commitDistance = null // map head not in this repo's history -> stale
      }
    }
    const flakeCounts = new Map<string, number>()
    for (const e of readJournal(mqDir)) {
      if (e.type === 'flake') flakeCounts.set(e.testId, (flakeCounts.get(e.testId) ?? 0) + 1)
    }
    const selection = selectAffected({
      map,
      changedFiles,
      commitDistance,
      hashOf: rel => {
        const abs = path.join(cwd, rel)
        return fs.existsSync(abs) ? hashContent(fs.readFileSync(abs)) : null
      },
      flakeCounts,
    })
    if (argv.format === 'json') {
      output.result(selection)
    } else if (selection.verdict === 'selected') {
      process.stdout.write(selection.tests.join('\n') + '\n')
    } else {
      process.stderr.write(`tia: full suite recommended — ${selection.reason}\n`)
    }
    if (selection.verdict !== 'selected') process.exitCode = 3
    return
  }
  case 'record-due': {
    const record = loadAgentOpsConfig(primary).merge_queue.tia.record
    if (record === 'off') {
      process.exitCode = 1
      return
    }
    if (record === 'always') return
    // scheduled: first pass per UTC day.
    const marker = path.join(mqDir, TIA_DIR, TIA_LAST_RECORDED_DAY_FILE)
    const today = new Date().toISOString().slice(0, 10)
    const last = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : ''
    if (last === today) process.exitCode = 1
    return
  }
  case 'ingest': {
    if (!argv.coverageDir || !argv.head) {
      output.error('tia ingest: --coverage-dir <dir> and --head <sha> are required')
      process.exitCode = 1
      return
    }
    const at = new Date().toISOString()
    const map = buildTiaMap({
      coverageDir: argv.coverageDir,
      projectRoot: cwd,
      headSha: argv.head,
      seconds: argv.seconds ?? 0,
      now: at,
    })
    writeTiaMap(mqDir, map)
    fs.writeFileSync(
      path.join(mqDir, TIA_DIR, TIA_LAST_RECORDED_DAY_FILE), at.slice(0, 10) + '\n',
    )
    appendEvent(mqDir, {
      type: 'tia_recorded', headSha: argv.head, seconds: argv.seconds ?? 0,
      tests: Object.keys(map.tests).length, files: Object.keys(map.file_hashes).length, at,
    })
    fs.rmSync(argv.coverageDir, { recursive: true, force: true })
    output.success(
      `tia: recorded ${Object.keys(map.tests).length} test file(s) covering ` +
      `${Object.keys(map.file_hashes).length} file(s)`,
    )
    return
  }
  default:
    output.error(`unknown tia action "${argv.action}"`)
    process.exitCode = 1
  }
}

const tiaCommand: CommandModule<Record<string, unknown>, TiaArgs> = {
  command: 'tia <action>',
  describe: 'Test-impact analysis: coverage-map recording and affected-test selection',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['affected', 'record-due', 'ingest'] as const,
        type: 'string',
        demandOption: true,
      })
      .option('base', { type: 'string', describe: 'Base ref to diff against (affected)' })
      .option('coverage-dir', {
        type: 'string', hidden: true, describe: 'NODE_V8_COVERAGE dump directory (ingest)',
      })
      .option('head', {
        type: 'string', hidden: true, describe: 'Head sha the map was recorded at (ingest)',
      })
      .option('seconds', {
        type: 'number', hidden: true, describe: 'Instrumented run wall-clock seconds (ingest)',
      })
      // Same rationale as mq: the poller invokes `tia ... --root` indirectly via
      // worktrees; declaring it per-command keeps the strict parser happy.
      .option('root', { type: 'string', hidden: true, describe: 'Project root directory' })
  },
  handler: tiaHandler,
}

export default tiaCommand
```

- [ ] In `src/cli/index.ts`, add `import tiaCommand from './commands/tia.js'` (after the `mqCommand` import) and `.command(tiaCommand)` (after `.command(mqCommand)`).
- [ ] Run: `npx vitest run src/cli/commands/tia.test.ts` — expect all pass.
- [ ] Run: `npm run check` — expect green. (If `process.stdout.write` trips a lint rule, keep the raw-stdout contract — the bash consumer needs unprefixed lines — and add a scoped `// eslint-disable-next-line` with a comment explaining why, rather than switching to output.info.)
- [ ] Commit: `git add -A && git commit -m "feat(tia): scaffold tia CLI — affected / record-due / ingest (D14)"`

---

### Task 15: D14 — poller records coverage on scheduled green runs

**Files:**
- Modify: `content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl`
- Modify: `tests/agent-ops-merge-queue.bats`

**Interfaces:**
- Consumes: `scaffold tia record-due` / `scaffold tia ingest` (Task 14), `scaffold mq gate-cache --record-tree … --instrumented` (Task 3); `NODE_V8_COVERAGE` (native Node).
- Produces: instrumented full runs (when due) that refresh `.mq/tia/map.json` and journal `tia_recorded` + an `instrumented: true` `full_gate_recorded` event, keeping the overhead visible in `mq stats` (spec §11 mitigation).

**Steps:**

- [ ] Append the failing tests to `tests/agent-ops-merge-queue.bats`:

```bash
@test "poller: due recording instruments the gate and ingests on green" {
  poller_world 'printf "%s" "${NODE_V8_COVERAGE:-}" > cov-env.txt'
  cat > "$MQ_SCAFFOLD_BIN" <<'STUB'
#!/usr/bin/env bash
echo "$@" >> "${SCAFFOLD_STUB_LOG:?}"
case "$*" in
  *"gate-cache --check-tree"*) exit 1 ;;
  *"tia record-due"*) exit 0 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$MQ_SCAFFOLD_BIN"
  export SCAFFOLD_STUB_LOG="$WORK/stub.log"
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  # the gate ran with NODE_V8_COVERAGE pointing into .mq/tia
  grep -q ".mq/tia/v8" "$WORK/clone/.mq/post-merge/cov-env.txt"
  grep -q -- "tia ingest --coverage-dir" "$WORK/stub.log"
  grep -q -- "--instrumented" "$WORK/stub.log"
  rm -rf "$WORK"
}

@test "poller: recording not due leaves the gate uninstrumented" {
  poller_world 'printf "%s" "${NODE_V8_COVERAGE:-}" > cov-env.txt'
  run "$WORK/clone/scripts/ops/post-merge-poller.sh"
  [ "$status" -eq 0 ]
  [ ! -s "$WORK/clone/.mq/post-merge/cov-env.txt" ]   # empty: env var was not set
  rm -rf "$WORK"
}
```

  (`poller_world`'s default stub answers `tia record-due` with exit 1 — Task 4.)

- [ ] Run: `bats tests/agent-ops-merge-queue.bats` — expect the 2 new tests FAIL.
- [ ] Edit `content/assets/agent-ops/merge-queue/post-merge-poller.sh.tmpl`. Three surgical edits:

  **(a)** Immediately after the Task 4 `SCAFFOLD_BIN` block, insert:

```bash
# TIA coverage recording (D14; merge_queue.tia.record: scheduled|always|off,
# default scheduled = first green pass per UTC day). When due, the full gate
# runs under NODE_V8_COVERAGE so a green run refreshes .mq/tia/map.json.
# Instrumentation slows the run — the cost is journaled (--instrumented) and
# visible in `scaffold mq stats` as instrumented-vs-plain medians.
INSTRUMENTED=0
if [ -n "$SCAFFOLD_BIN" ] && "$SCAFFOLD_BIN" tia record-due >/dev/null 2>&1; then
	INSTRUMENTED=1
	rm -rf "$MQ_DIR/tia/v8"
	mkdir -p "$MQ_DIR/tia/v8"
fi
```

  **(b)** Replace the Task 4 gate invocation lines

```bash
GATE_START="$(date +%s)"
GATE_RC=0
(cd "$WT" && {{FULL_GATE_COMMAND}}) >"$LOG" 2>&1 || GATE_RC=$?
GATE_SECONDS=$(( $(date +%s) - GATE_START ))
```

  with

```bash
GATE_START="$(date +%s)"
GATE_RC=0
if [ "$INSTRUMENTED" = "1" ]; then
	# export (not a prefix assignment) so a compound gate command — pipelines,
	# &&-chains — sees the variable in every stage.
	(cd "$WT" && export NODE_V8_COVERAGE="$MQ_DIR/tia/v8" && {{FULL_GATE_COMMAND}}) >"$LOG" 2>&1 || GATE_RC=$?
else
	(cd "$WT" && {{FULL_GATE_COMMAND}}) >"$LOG" 2>&1 || GATE_RC=$?
fi
GATE_SECONDS=$(( $(date +%s) - GATE_START ))
```

  **(c)** Replace the Task 4 green-branch record block

```bash
	if [ -n "$SCAFFOLD_BIN" ]; then
		"$SCAFFOLD_BIN" mq gate-cache --record-tree "$TREE_SHA" --seconds "$GATE_SECONDS" >/dev/null 2>&1 || true
	fi
```

  with

```bash
	if [ -n "$SCAFFOLD_BIN" ]; then
		RECORD_ARGS=(mq gate-cache --record-tree "$TREE_SHA" --seconds "$GATE_SECONDS")
		if [ "$INSTRUMENTED" = "1" ]; then
			RECORD_ARGS+=(--instrumented)
		fi
		"$SCAFFOLD_BIN" "${RECORD_ARGS[@]}" >/dev/null 2>&1 || true
		if [ "$INSTRUMENTED" = "1" ]; then
			# Ingest from the gated worktree so content hashing sees the exact
			# tree the suite ran against.
			(cd "$WT" && "$SCAFFOLD_BIN" tia ingest --coverage-dir "$MQ_DIR/tia/v8" --head "$HEAD_SHA" --seconds "$GATE_SECONDS") >/dev/null 2>&1 || true
		fi
	fi
```

- [ ] Run: `bats tests/agent-ops-merge-queue.bats` — expect ALL tests pass.
- [ ] Run: `make lint` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(agent-ops): poller records V8 coverage on scheduled green runs (D14)"`

---

### Task 16: D14 — the R2 affected-gate script consumes `scaffold tia affected`

> **Precondition:** R2 (ops last mile) is merged — `content/assets/agent-ops/gate/gate-check-affected.sh.tmpl`, `src/core/agent-ops/gate-ingest.ts`, and `tests/agent-ops-gate-affected.bats` exist (R2 plan Tasks 7–10). If they do not, STOP this task, note it in the PR description, and continue with Task 17 (D14 ships without gate-script consumption; this task becomes the follow-up).

**Files:**
- Modify: `content/assets/agent-ops/gate/gate-check-affected.sh.tmpl`
- Modify: `src/core/agent-ops/gate-ingest.ts` (+ its colocated test)
- Modify: `tests/agent-ops-gate-affected.bats`

**Interfaces:**
- Produces: a TIA layer in the generated affected gate — when `scaffold` is available AND a coverage map exists, `scaffold tia affected --base "$BASE"` picks the test set; exit 3 / error / empty output falls back to the FULL suite (`full()`); no map leaves the existing runner-selection layer (`{{GATE_AFFECTED_INVOCATION}}`) in charge. New template marker `{{GATE_TIA_INVOCATION}}` (receives the selection in `$TIA_TESTS`, newline-separated) resolved by gate-ingest.
- Produces: primary-`.mq` resolution via the git common dir, so the quarantine list and the TIA map are found from the daemon's gate worktree too (in a plain checkout it resolves to the same local `.mq`, so R2's bats fixtures keep passing).
- Consumes: `scaffold tia affected` (Task 14) via `MQ_SCAFFOLD_BIN`-overridable lookup.

**Steps:**

- [ ] Read `src/core/agent-ops/gate-ingest.ts` and `content/assets/agent-ops/gate/gate-check-affected.sh.tmpl` as actually merged. The edits below are written against the R2 plan's published interfaces (`GateSeed`, `gateTemplateVars(seed)`, the template's quarantine/`{{GATE_AFFECTED_INVOCATION}}` tail); if merged names drifted, apply the same change to the merged names.
- [ ] Append the failing bats tests to `tests/agent-ops-gate-affected.bats`, and add one line to its `setup()` sed pipeline so the new marker is rendered:

```bash
      -e 's|{{GATE_TIA_INVOCATION}}|printf "%s" "$TIA_TESTS" > .tia-tests; touch .tia-ran|g' \
```

  New tests:

```bash
@test "TIA layer: a selection runs the TIA invocation, not the runner selection" {
  mkdir -p stub-bin .mq/tia
  echo '{}' > .mq/tia/map.json
  cat > stub-bin/scaffold <<'STUB'
#!/usr/bin/env bash
if [ "$1 $2" = "tia affected" ]; then echo tests/picked.test.ts; exit 0; fi
exit 0
STUB
  chmod +x stub-bin/scaffold
  export MQ_SCAFFOLD_BIN="$PWD/stub-bin/scaffold"
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .tia-ran ]
  grep -q 'tests/picked.test.ts' .tia-tests
  [ ! -f .affected-ran ]
  [ ! -f .full-ran ]
}

@test "TIA layer: exit 3 (stale / low confidence) falls back to the FULL suite" {
  mkdir -p stub-bin .mq/tia
  echo '{}' > .mq/tia/map.json
  cat > stub-bin/scaffold <<'STUB'
#!/usr/bin/env bash
if [ "$1 $2" = "tia affected" ]; then exit 3; fi
exit 0
STUB
  chmod +x stub-bin/scaffold
  export MQ_SCAFFOLD_BIN="$PWD/stub-bin/scaffold"
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .full-ran ]
  [ ! -f .tia-ran ]
  [ ! -f .affected-ran ]
  [[ "$output" == *"TIA recommends the full suite"* ]]
}

@test "TIA layer: no coverage map leaves the runner-selection layer in charge" {
  mkdir -p stub-bin
  printf '#!/usr/bin/env bash\nexit 0\n' > stub-bin/scaffold
  chmod +x stub-bin/scaffold
  export MQ_SCAFFOLD_BIN="$PWD/stub-bin/scaffold"
  echo change >> app.txt && git commit -qam change
  MQ_AFFECTED_BASE=main run scripts/gate-check-affected.sh
  [ "$status" -eq 0 ]
  [ -f .affected-ran ]
  [ ! -f .tia-ran ]
}
```

- [ ] Run: `bats tests/agent-ops-gate-affected.bats` — expect the 3 new tests FAIL, existing 7 pass.
- [ ] In `content/assets/agent-ops/gate/gate-check-affected.sh.tmpl`, replace the tail — from the quarantine comment block through the final `{{GATE_AFFECTED_INVOCATION}}` line — with:

```bash
# Quarantine: mute for the MERGE gate only (asymmetry is deliberate — the
# post-merge full gate does NOT read this list). The quarantine file and the
# TIA map live in the PRIMARY checkout's .mq — resolve it via the git common
# dir so this also works from the merge-queue daemon's gate worktree, where a
# cwd-relative .mq does not exist. In a plain checkout this resolves to ./.mq.
PRIMARY_MQ="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/.mq"
QUARANTINE="$PRIMARY_MQ/quarantine.txt"
[ -f "$QUARANTINE" ] || QUARANTINE=".mq/quarantine.txt"
EXCLUDE_ARGS=()
if [ -f "$QUARANTINE" ]; then
	while IFS= read -r id || [ -n "$id" ]; do
		[ -n "$id" ] || continue
		EXCLUDE_ARGS+=(--exclude "$id")
	done <"$QUARANTINE"
fi

# Layered TIA (D14): when a coverage map exists, `scaffold tia affected` picks
# the test set (most-likely-to-fail-first, exit 0) or recommends the full suite
# (exit 3 on staleness / low confidence / unknown edges — and ANY error is
# treated the same way: fail closed). Without a map, the runner's own static
# selection below stays in charge. The always-run smoke set belongs in the
# invocation seeds, not here.
SCAFFOLD_BIN="${MQ_SCAFFOLD_BIN:-scaffold}"
if command -v "$SCAFFOLD_BIN" >/dev/null 2>&1 && [ -f "$PRIMARY_MQ/tia/map.json" ]; then
	if TIA_TESTS="$("$SCAFFOLD_BIN" tia affected --base "$BASE" 2>/dev/null)" && [ -n "$TIA_TESTS" ]; then
		echo "gate-check-affected: TIA selected $(printf '%s\n' "$TIA_TESTS" | grep -c .) test file(s)"
		{{GATE_TIA_INVOCATION}}
		exit $?
	else
		full "TIA recommends the full suite (stale map, low confidence, or unknown edge)"
	fi
fi

{{GATE_AFFECTED_INVOCATION}}
```

- [ ] In `src/core/agent-ops/gate-ingest.ts`: add `tiaInvocation: string` to `GateSeed`; in `ingestGateSeed`, seed it next to `affectedInvocation` — for a vitest-detected project:

```ts
    tiaInvocation:
      'printf \'%s\\n\' "$TIA_TESTS" | xargs npx vitest run "${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}"',
```

  and for stacks without a seeded runner invocation:

```ts
    tiaInvocation: 'full "no TIA invocation configured for this stack"',
```

  In `gateTemplateVars`, add `GATE_TIA_INVOCATION: seed.tiaInvocation`. Extend the colocated `gate-ingest.test.ts` expectations accordingly (the vars object now carries `GATE_TIA_INVOCATION`; assert the vitest seed contains `xargs npx vitest run` and the fallback contains `full "no TIA invocation`).
- [ ] Run: `bats tests/agent-ops-gate-affected.bats` — expect ALL pass (7 existing + 3 new; the existing tests never hit the TIA branch because their fixtures have no `map.json`, and `PRIMARY_MQ` resolves to the fixture-local `.mq` in a plain checkout).
- [ ] Run: `npx vitest run src/core/agent-ops` and `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(agent-ops): affected gate consumes scaffold tia affected with full-suite fallback (D14)"`

---

### Task 17: D14 — TIA visibility in `mq stats`

**Files:**
- Modify: `src/merge-queue/stats.ts` (+ `src/merge-queue/stats.test.ts`)
- Modify: `src/cli/commands/mq.ts` (stats print)

**Interfaces:**
- Produces: `MqStats.tiaLastRecorded: { at: string; tests: number; files: number } | null` (from the LAST `tia_recorded` event) and a `TIA map:` line in text stats. Together with Task 3's instrumented-vs-plain medians this completes the D14 "durations logged and visible in mq stats" requirement.

**Steps:**

- [ ] Update `src/merge-queue/stats.test.ts`: add `tiaLastRecorded: null` to the first test's `toEqual` object, and add:

```ts
  it('reports the last TIA recording', () => {
    const events: JournalEvent[] = [
      { type: 'tia_recorded', headSha: 'H1', seconds: 100, tests: 10, files: 40, at: '2026-07-16T02:00:00.000Z' },
      { type: 'tia_recorded', headSha: 'H2', seconds: 90, tests: 12, files: 44, at: '2026-07-17T02:00:00.000Z' },
    ]
    expect(computeStats(events, NOW).tiaLastRecorded)
      .toEqual({ at: '2026-07-17T02:00:00.000Z', tests: 12, files: 44 })
  })
```

- [ ] Run: `npx vitest run src/merge-queue/stats.test.ts` — expect FAILURE.
- [ ] In `src/merge-queue/stats.ts`: add the field to `MqStats`:

```ts
  /** D14: the most recent coverage-map recording, or null when none exists. */
  tiaLastRecorded: { at: string; tests: number; files: number } | null
```

  in `computeStats`, add `let tiaLastRecorded: MqStats['tiaLastRecorded'] = null` before the loop, the case:

```ts
    case 'tia_recorded':
      tiaLastRecorded = { at: e.at, tests: e.tests, files: e.files }
      break
```

  and `tiaLastRecorded,` in the returned object.
- [ ] In `src/cli/commands/mq.ts` (stats case), after the Task 3 full-gate line:

```ts
    output.info(
      stats.tiaLastRecorded === null
        ? 'TIA map: none recorded'
        : `TIA map: recorded ${stats.tiaLastRecorded.at} ` +
          `(${stats.tiaLastRecorded.tests} test files / ${stats.tiaLastRecorded.files} files)`,
    )
```

- [ ] Run: `npx vitest run src/merge-queue/stats.test.ts src/cli/commands/mq.test.ts` — expect all pass.
- [ ] Run: `npm run check` — expect green.
- [ ] Commit: `git add -A && git commit -m "feat(mq): TIA recording visibility in mq stats (D14)"`

**D14 is complete and shippable here.**

---

### Task 18: docs + full quality gates

**Files:**
- Modify: `CLAUDE.md` (Key Commands table)

**Steps:**

- [ ] Add two rows to the Key Commands table in `CLAUDE.md`, after the `scaffold mq stats` row:

```markdown
| `scaffold mq release --pr <N>` | Release a `HELD_HUMAN` (overlap-zone) PR back into the queue; it lands solo-gated |
| `scaffold tia affected --base <ref>` | Emit the TIA-selected test list + confidence verdict (exit 3 = run the full suite) |
```

- [ ] Update the `scaffold mq stats` row's description to: `Calibration metrics: arrivals, gate outcomes, median gate time, flakes, gate-cache hits, instrumented-vs-plain full-gate medians, TIA map age`.
- [ ] Do NOT touch `CHANGELOG.md` here — the maintainer release flow (operations runbook) owns it at tag time; the PR description should list the four D-items and the new config keys (`gate_cache_max_entries`, `overlap_zones`, `overlap_zone_policy`, `tia.record`) for that write-up.
- [ ] Run: `npm run test:e2e` — expect the merge-queue e2e suite green.
- [ ] Run: `make check-all` — expect every gate green (bash: lint + validate + test + eval; TypeScript: lint + type-check + vitest; mmr/agent-integration/knowledge/guides checks). A `git push` after this plan will re-run the suite via the pre-push hook — with `make check-all` green on the exact commit, `git push --no-verify` is the sanctioned shortcut (see CLAUDE.md).
- [ ] Commit: `git add -A && git commit -m "docs: mq release + tia affected command rows (brownfield R4)"`
- [ ] Final self-check before opening the PR:
  - `git log --oneline main..HEAD` shows one commit per task (18 commits).
  - `grep -rn "gate_cached\|full_gate_recorded\|pr_files\|released\|tia_recorded" src/merge-queue/types.ts` — all five event types present.
  - `grep -n "HELD_HUMAN" src/merge-queue/types.ts src/merge-queue/state.ts src/cli/commands/mq.ts` — state, reducer, and CLI agree.
  - Spec cross-check (§9 + §11, R4 scope): D12 keys/green-only/`gate_cached`/cap ✓ (Tasks 1–4); D15 fs.watch/debounce/poll fallback/poller kick ✓ (Tasks 5–7); D13 partitioning/zones/`HELD_HUMAN`/`mq release`/status surfacing/solo default ✓ (Tasks 8–11); D14 layers/`tia.record` scheduled default/`scaffold tia affected`/gate-script consumption/full-suite fallback/ordering/stats visibility ✓ (Tasks 12–17).

**Plan complete.** Open the PR (`gh pr create`), run the mandatory MMR review (`scaffold run review-pr`), fix blocking findings, and merge per the standard flow.
