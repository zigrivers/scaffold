# Eligible-Step Cache v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three latent bugs in the eligible-step cache infrastructure (service-scope leakage in saveState, stale cache on pipeline edits, cross-file staleness between root and service state) and wire `scaffold next`/`scaffold status` to trust the cache.

**Architecture:** Graph-based hash invalidation for pipeline-YAML edits; monotonic root `save_counter` + `next_eligible_root_counter` on service state files for cross-file invalidation; counter captured at `loadState` time to avoid TOCTOU. `readEligible()` free function in `core/pipeline/` checks hash + (for service scope) counter, falls back to live compute on any mismatch.

**Tech Stack:** TypeScript, vitest, Node.js `fs` + `crypto`.

**Spec:** `docs/superpowers/specs/2026-04-20-eligible-cache-v2-design.md`

**Pre-flight:** Already on a dedicated feature branch (`feat/next-eligible-cache-v2`). Each task ends with a commit.

---

## Task Map

| # | Title | Files | Risk |
|---|-------|-------|------|
| 1 | Add 3 optional state fields to `PipelineState` | 2 | — |
| 2 | `computePipelineHash()` helper + tests | 2 | order + scope normalization |
| 3 | `readRootSaveCounter()` helper + tests | 2 | file edge cases |
| 4 | `getPipelineHash(scope)` on `ResolvedPipeline` | 3 | memoization correctness |
| 5 | StateManager constructor + `loadedRootCounter` capture | 2 | TOCTOU safety |
| 6 | StateManager `saveState` scope + counter writes | 2 | existing-test regressions |
| 7 | `readEligible()` helper + tests | 2 | boundary conditions |
| 8 | `next.ts` switches to `readEligible` | 2 | many existing test mocks |
| 9 | `status.ts` switches to `readEligible` (interactive + JSON) | 2 | JSON-format compat |
| 10 | Thread pipelineHash through run/skip/reset/rework/complete | 5 | mechanical threading |
| 11 | Thread pipelineHash through info/dashboard | 2 | read-only paths |
| 12 | Thread pipelineHash through adopt/wizard | 2 | init paths (pre-first-save) |
| 13 | Update lingering test fixtures | 1–5 | catch any missed call sites |
| 14 | E2E: cross-file invalidation + pipeline-edit invalidation | 1 | integration |
| 15 | Final verification + cleanup | 0 | — |

---

## Task 1: Add 3 optional state fields to `PipelineState`

**Files:**
- Modify: `src/types/state.ts` (add 3 new optional fields)
- Create: `src/types/state.test.ts` (new test file — does not currently exist)

**Goal:** Introduce the cache-version fields without behavioral change. Type-only.

- [ ] **Step 1: Create `src/types/state.test.ts` with failing test**

The file does NOT exist today. Create it with the test below — this is the red-test step for TDD. The test proves the new optional fields compile, and will fail initially because the fields are not yet on the interface.

- [ ] **Step 2: Write failing test (create the file)**

Create `src/types/state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { PipelineState } from './state.js'

describe('PipelineState cache-version fields (Eligible-Cache v2)', () => {
  it('PipelineState literal accepts save_counter, next_eligible_hash, next_eligible_root_counter as optional', () => {
    const state: PipelineState = {
      'schema-version': 3,
      'scaffold-version': '1.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-20T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
      // NEW optional fields — must compile:
      save_counter: 5,
      next_eligible_hash: 'abc123',
      next_eligible_root_counter: 4,
    }
    expect(state.save_counter).toBe(5)
    expect(state.next_eligible_hash).toBe('abc123')
    expect(state.next_eligible_root_counter).toBe(4)
  })

  it('PipelineState literal compiles without the new fields (backward compat)', () => {
    const state: PipelineState = {
      'schema-version': 3,
      'scaffold-version': '1.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-20T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    }
    expect(state.save_counter).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run tsc (and tests if added) to confirm failure**

Run: `npx tsc --noEmit`
Expected: FAIL with "Object literal may only specify known properties, and 'save_counter' does not exist in type 'PipelineState'" (or similar).

- [ ] **Step 4: Add the 3 optional fields to `PipelineState` in `src/types/state.ts`**

Find the `PipelineState` interface (grep `export interface PipelineState`). Append the 3 new fields AFTER `next_eligible`:

```typescript
export interface PipelineState {
  // ... existing fields ...
  next_eligible: string[]

  /**
   * Monotonic counter bumped on every root-state saveState. Used by service
   * state files to detect when root has mutated since the service cached
   * next_eligible. Present only in root state (service state files never
   * carry a save_counter of their own). Absent on legacy files.
   */
  save_counter?: number

  /**
   * Pipeline-graph hash recorded when `next_eligible` was written. Absent on
   * legacy files → treated as "always stale" on read → triggers live recompute.
   */
  next_eligible_hash?: string

  /**
   * SERVICE state only: root state's save_counter at cache-write time. If this
   * no longer matches the current root save_counter, the service cache is
   * invalidated (root mutation invalidates service eligibility because service
   * steps depend on global step completion through the merged state view).
   */
  next_eligible_root_counter?: number

  // ... other existing fields (extra-steps etc.) remain after ...
}
```

- [ ] **Step 5: Run tsc to verify pass**

Run: `npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 6: Commit**

```bash
git add src/types/state.ts src/types/state.test.ts 2>/dev/null
git commit -m "feat(state): add save_counter + next_eligible_hash + next_eligible_root_counter to PipelineState"
```

---

## Task 2: `computePipelineHash()` helper

**Files:**
- Create: `src/core/pipeline/graph-hash.ts` (new file)
- Test: `src/core/pipeline/graph-hash.test.ts` (new file)

**Goal:** Deterministic, scope-normalized hash of the pipeline graph covering all inputs to `computeEligible`.

- [ ] **Step 1: Write the failing tests (7 total)**

Create `src/core/pipeline/graph-hash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computePipelineHash } from './graph-hash.js'
import type { DependencyGraph } from '../../types/index.js'

function mkGraph(
  nodes: Array<{ slug: string; enabled: boolean; deps: string[]; order?: number }>,
): DependencyGraph {
  const nodeMap = new Map<string, {
    slug: string; phase: string | null; order: number | null;
    dependencies: string[]; enabled: boolean;
  }>()
  for (const n of nodes) {
    nodeMap.set(n.slug, {
      slug: n.slug,
      phase: null,
      order: n.order ?? null,
      dependencies: n.deps,
      enabled: n.enabled,
    })
  }
  return { nodes: nodeMap, edges: new Map() }
}

describe('computePipelineHash', () => {
  it('same graph + same scope produces same hash (determinism)', () => {
    const g = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: ['a'] },
    ])
    const h1 = computePipelineHash(g, new Set(), 'global')
    const h2 = computePipelineHash(g, new Set(), 'global')
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)  // SHA-256 hex
  })

  it('different scope produces different hash', () => {
    const g = mkGraph([{ slug: 'a', enabled: true, deps: [] }])
    const hGlobal = computePipelineHash(g, new Set(), 'global')
    const hService = computePipelineHash(g, new Set(), 'service')
    expect(hGlobal).not.toBe(hService)
  })

  it('null scope normalizes to global (Round-2 P2 fix)', () => {
    const g = mkGraph([{ slug: 'a', enabled: true, deps: [] }])
    const hNull = computePipelineHash(g, new Set(), null)
    const hGlobal = computePipelineHash(g, new Set(), 'global')
    expect(hNull).toBe(hGlobal)
  })

  it('different dependencies produce different hash', () => {
    const g1 = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: ['a'] },
    ])
    const g2 = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: [] },  // dep removed
    ])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .not.toBe(computePipelineHash(g2, new Set(), 'global'))
  })

  it('different enabled flag produces different hash', () => {
    const g1 = mkGraph([{ slug: 'a', enabled: true, deps: [] }])
    const g2 = mkGraph([{ slug: 'a', enabled: false, deps: [] }])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .not.toBe(computePipelineHash(g2, new Set(), 'global'))
  })

  it('different order produces different hash (Round-1 P1 lock)', () => {
    const g1 = mkGraph([
      { slug: 'a', enabled: true, deps: [], order: 1 },
      { slug: 'b', enabled: true, deps: [], order: 2 },
    ])
    const g2 = mkGraph([
      { slug: 'a', enabled: true, deps: [], order: 2 },
      { slug: 'b', enabled: true, deps: [], order: 1 },
    ])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .not.toBe(computePipelineHash(g2, new Set(), 'global'))
  })

  it('node-insertion order does not affect hash (stability)', () => {
    const g1 = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: ['a'] },
    ])
    const g2 = mkGraph([
      { slug: 'b', enabled: true, deps: ['a'] },
      { slug: 'a', enabled: true, deps: [] },
    ])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .toBe(computePipelineHash(g2, new Set(), 'global'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/pipeline/graph-hash.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `computePipelineHash` in `src/core/pipeline/graph-hash.ts`**

Create `src/core/pipeline/graph-hash.ts`:

```typescript
import crypto from 'node:crypto'
import type { DependencyGraph } from '../../types/index.js'

/**
 * Stable SHA-256 hash of the pipeline graph for cache invalidation.
 *
 * Inputs included (all affect `computeEligible` output or ordering):
 * - slug presence
 * - `enabled` flag
 * - `order` (computeEligible sorts by order)
 * - dependencies list
 * - global-ness (affects scope filtering)
 * - scope ('global' vs 'service'; `null` normalized to 'global')
 *
 * Inputs deliberately excluded (cosmetic / orthogonal):
 * - phase (affects display grouping, not eligibility)
 * - cross-reads (orthogonal to eligibility)
 */
export function computePipelineHash(
  graph: DependencyGraph,
  globalSteps: Set<string>,
  scope: 'global' | 'service' | null,
): string {
  const lines: string[] = []
  // Round-2 P2 fix: normalize null → 'global' so non-service callers that
  // pass undefined/null hash the same as explicit 'global'.
  const normalizedScope = scope === 'service' ? 'service' : 'global'
  lines.push(`scope:${normalizedScope}`)
  // Canonical ordering by slug for stability across map insertion order.
  const slugs = [...graph.nodes.keys()].sort()
  for (const slug of slugs) {
    const node = graph.nodes.get(slug)!
    const deps = [...node.dependencies].sort().join(',')
    const order = node.order ?? 'null'
    const isGlobal = globalSteps.has(slug) ? '1' : '0'
    const enabled = node.enabled ? '1' : '0'
    lines.push(`${slug}|${enabled}|${isGlobal}|${order}|${deps}`)
  }
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex')
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/pipeline/graph-hash.test.ts && npx tsc --noEmit`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline/graph-hash.ts src/core/pipeline/graph-hash.test.ts
git commit -m "feat(core): computePipelineHash — scope-normalized graph hash for cache invalidation"
```

---

## Task 3: `readRootSaveCounter()` helper

**Files:**
- Create: `src/state/root-counter-reader.ts` (new file)
- Test: `src/state/root-counter-reader.test.ts` (new file)

**Goal:** READ-path-only helper that service-scope consumers use to verify cross-file freshness.

- [ ] **Step 1: Write failing tests (4 total)**

Create `src/state/root-counter-reader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readRootSaveCounter } from './root-counter-reader.js'

describe('readRootSaveCounter', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rcr-'))
    fs.mkdirSync(path.join(tmpRoot, '.scaffold'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('returns null when root state file is missing', () => {
    expect(readRootSaveCounter(tmpRoot)).toBeNull()
  })

  it('returns the counter when state file has a valid save_counter', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'state.json'),
      JSON.stringify({ save_counter: 42, 'schema-version': 3 }),
    )
    expect(readRootSaveCounter(tmpRoot)).toBe(42)
  })

  it('returns null when state file has invalid JSON', () => {
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), '{ not valid json')
    expect(readRootSaveCounter(tmpRoot)).toBeNull()
  })

  it('returns null when state file lacks save_counter (legacy file)', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'state.json'),
      JSON.stringify({ 'schema-version': 3 }),
    )
    expect(readRootSaveCounter(tmpRoot)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/root-counter-reader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `readRootSaveCounter` in `src/state/root-counter-reader.ts`**

Create `src/state/root-counter-reader.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'

/**
 * Reads `.scaffold/state.json` and returns the `save_counter` field.
 * Returns null on any failure (missing file, invalid JSON, missing field).
 *
 * Used by service-scope cache readers (readEligible) to verify that the
 * service's cached next_eligible was written against the current root state
 * (spec §6). Not used at cache WRITE time — StateManager captures the counter
 * internally during loadState to avoid TOCTOU.
 */
export function readRootSaveCounter(projectRoot: string): number | null {
  const rootStatePath = path.join(projectRoot, '.scaffold', 'state.json')
  try {
    if (!fs.existsSync(rootStatePath)) return null
    const raw = JSON.parse(fs.readFileSync(rootStatePath, 'utf8')) as Record<string, unknown>
    const counter = raw['save_counter']
    return typeof counter === 'number' ? counter : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/state/root-counter-reader.test.ts && npx tsc --noEmit`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/state/root-counter-reader.ts src/state/root-counter-reader.test.ts
git commit -m "feat(state): readRootSaveCounter helper for cross-file cache invalidation"
```

---

## Task 4: `getPipelineHash(scope)` on `ResolvedPipeline`

**Files:**
- Modify: `src/core/pipeline/types.ts` (add method to interface)
- Modify: `src/core/pipeline/resolver.ts` (compute memoized closure)
- Test: `src/core/pipeline/resolver.test.ts` (append tests)

**Goal:** Expose a memoized hash getter on the pipeline context so commands don't recompute the hash per call.

- [ ] **Step 1: Write failing tests in `src/core/pipeline/resolver.test.ts`**

Append to `src/core/pipeline/resolver.test.ts` (ensure `makeCtx` helper from Task 10 of v3.18.0 exists; otherwise create a minimal PipelineContext inline):

```typescript
import { computePipelineHash } from './graph-hash.js'
// ... existing imports ...

describe('resolvePipeline getPipelineHash', () => {
  it('exposes getPipelineHash(scope) that returns a deterministic hash', () => {
    const metaPrompts = new Map<string, MetaPromptFile>([
      ['step-a', {
        stepName: 'step-a',
        filePath: '/fake/a.md',
        frontmatter: {
          name: 'step-a', description: '', summary: null,
          phase: 'architecture', order: 100,
          dependencies: [], outputs: [], conditional: null,
          knowledgeBase: [], reads: [], crossReads: [],
          stateless: false, category: 'pipeline',
        },
        body: '', sections: {},
      }],
    ])
    const pipeline = resolvePipeline(makeCtx({ metaPrompts }), { output: makeOutput() })
    const h1 = pipeline.getPipelineHash('global')
    const h2 = pipeline.getPipelineHash('global')
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns different hashes for different scopes', () => {
    const metaPrompts = new Map<string, MetaPromptFile>([
      ['step-a', {
        stepName: 'step-a',
        filePath: '/fake/a.md',
        frontmatter: {
          name: 'step-a', description: '', summary: null,
          phase: 'architecture', order: 100,
          dependencies: [], outputs: [], conditional: null,
          knowledgeBase: [], reads: [], crossReads: [],
          stateless: false, category: 'pipeline',
        },
        body: '', sections: {},
      }],
    ])
    const pipeline = resolvePipeline(makeCtx({ metaPrompts }), { output: makeOutput() })
    expect(pipeline.getPipelineHash('global')).not.toBe(pipeline.getPipelineHash('service'))
  })

  it('normalizes null to global (same hash)', () => {
    const metaPrompts = new Map<string, MetaPromptFile>([
      ['step-a', {
        stepName: 'step-a',
        filePath: '/fake/a.md',
        frontmatter: {
          name: 'step-a', description: '', summary: null,
          phase: 'architecture', order: 100,
          dependencies: [], outputs: [], conditional: null,
          knowledgeBase: [], reads: [], crossReads: [],
          stateless: false, category: 'pipeline',
        },
        body: '', sections: {},
      }],
    ])
    const pipeline = resolvePipeline(makeCtx({ metaPrompts }), { output: makeOutput() })
    expect(pipeline.getPipelineHash(null)).toBe(pipeline.getPipelineHash('global'))
  })

  it('memoizes per scope — same scope twice does not recompute', async () => {
    // Spy on the underlying hash function to verify memoization behavior.
    const ghMod = await import('./graph-hash.js')
    const spy = vi.spyOn(ghMod, 'computePipelineHash')
    spy.mockClear()
    const metaPrompts = new Map<string, MetaPromptFile>([
      ['step-a', {
        stepName: 'step-a',
        filePath: '/fake/a.md',
        frontmatter: {
          name: 'step-a', description: '', summary: null,
          phase: 'architecture', order: 100,
          dependencies: [], outputs: [], conditional: null,
          knowledgeBase: [], reads: [], crossReads: [],
          stateless: false, category: 'pipeline',
        },
        body: '', sections: {},
      }],
    ])
    const pipeline = resolvePipeline(makeCtx({ metaPrompts }), { output: makeOutput() })
    pipeline.getPipelineHash('global')
    pipeline.getPipelineHash('global')
    pipeline.getPipelineHash('global')
    expect(spy).toHaveBeenCalledTimes(1)
    // Different scope forces another compute
    pipeline.getPipelineHash('service')
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})
```

**REQUIRED refactor for the memoization test (apply in Step 4 below):** `vi.spyOn(ghMod, 'computePipelineHash')` cannot intercept an ESM named-import binding — direct named imports create a frozen read-only binding in the caller. To make the spy work, `resolver.ts` MUST import `computePipelineHash` via namespace import and call it via the namespace. This is non-negotiable: leaving the named import in place will make the memoization test fail regardless of implementation correctness.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/pipeline/resolver.test.ts -t "getPipelineHash"`
Expected: FAIL — `pipeline.getPipelineHash` is not a function.

- [ ] **Step 3: Add `getPipelineHash` to `ResolvedPipeline` interface**

In `src/core/pipeline/types.ts`, find the `ResolvedPipeline` interface and add:

```typescript
export interface ResolvedPipeline {
  graph: DependencyGraph
  preset: MethodologyPreset
  overlay: OverlayState
  stepMeta: Map<string, MetaPromptFrontmatter>
  computeEligible: (
    steps: Record<string, StepStateEntry>,
    options?: { scope?: 'global' | 'service'; globalSteps?: Set<string> },
  ) => string[]
  globalSteps: Set<string>
  /**
   * Memoized pipeline-graph hash for cache invalidation. Spec §5.
   * `null` scope normalizes to `'global'` per spec §2.
   */
  getPipelineHash: (scope: 'global' | 'service' | null) => string
}
```

- [ ] **Step 4: Implement memoized getter in `src/core/pipeline/resolver.ts`**

At the top of the file, add the import — it MUST be a namespace import so the memoization test's `vi.spyOn` can intercept the call (see note above):

```typescript
import * as graphHash from './graph-hash.js'
```

Inside `resolvePipeline`, before the `return` statement, add:

```typescript
// 8. Memoized pipeline-graph hash (spec §5).
// Call computePipelineHash via the namespace import so ESM spying works
// (test in graph-hash.test.ts / resolver.test.ts depends on this).
const hashCache = new Map<string, string>()
const getPipelineHash = (scope: 'global' | 'service' | null): string => {
  // Normalize null → 'global' for the cache key (spec §2 normalization).
  const key = scope === 'service' ? 'service' : 'global'
  let hash = hashCache.get(key)
  if (hash === undefined) {
    hash = graphHash.computePipelineHash(graph, globalSteps, scope)
    hashCache.set(key, hash)
  }
  return hash
}
```

Update the `return` statement to include `getPipelineHash`:

```typescript
return {
  graph,
  preset: resolvedPreset,
  overlay,
  stepMeta,
  computeEligible: computeEligibleFn,
  globalSteps,
  getPipelineHash,
}
```

- [ ] **Step 5: Run tests to verify pass + tsc**

Run: `npx vitest run src/core/pipeline/resolver.test.ts && npx tsc --noEmit`
Expected: PASS.

If tsc fails at other `ResolvedPipeline` construction sites in tests (mocks), fix them by adding `getPipelineHash: vi.fn(() => 'fake-hash-for-test')` or similar. List each failure and apply the minimum fix.

- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline/types.ts src/core/pipeline/resolver.ts src/core/pipeline/resolver.test.ts
git commit -m "feat(pipeline): ResolvedPipeline.getPipelineHash(scope) — memoized per-scope hash"
```

---

## Task 5: `StateManager` constructor + `loadedRootCounter` capture

**Files:**
- Modify: `src/state/state-manager.ts` (constructor signature + loadState capture)
- Test: `src/state/state-manager.test.ts`

**Goal:** Extend `StateManager` with a new optional trailing `pipelineHash?` param, align the injected `computeEligible` type with the existing options-aware `ResolvedPipeline.computeEligible` contract (the underlying function in `src/core/dependency/eligibility.ts` already accepts options — we're only updating the class's field type so callers can pass the real `pipeline.computeEligible`), and capture root's `save_counter` during service-mode `loadState` for TOCTOU-safe later use in `saveState`.

- [ ] **Step 1: Write failing tests**

Append to `src/state/state-manager.test.ts`:

```typescript
describe('StateManager — pipelineHash + loadedRootCounter (Eligible-Cache v2)', () => {
  it('constructor accepts optional pipelineHash parameter', () => {
    const sm = new StateManager(
      '/fake/project',
      (_steps, _opts) => [],
      () => undefined,
      new StatePathResolver('/fake/project'),
      undefined,
      'test-hash-abc',  // NEW param
    )
    expect(sm).toBeDefined()
  })

  it('service-mode loadState captures root save_counter into loadedRootCounter', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-capture-'))
    try {
      fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
      // Write root state with save_counter
      fs.writeFileSync(
        path.join(tmpRoot, '.scaffold', 'state.json'),
        JSON.stringify({
          'schema-version': 3,
          'scaffold-version': '1.0.0',
          init_methodology: 'deep',
          config_methodology: 'deep',
          'init-mode': 'greenfield',
          created: '2026-04-20T00:00:00.000Z',
          in_progress: null,
          steps: {},
          next_eligible: [],
          'extra-steps': [],
          save_counter: 7,
        }),
      )
      fs.writeFileSync(
        path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
        JSON.stringify({
          'schema-version': 3,
          'scaffold-version': '1.0.0',
          init_methodology: 'deep',
          config_methodology: 'deep',
          'init-mode': 'greenfield',
          created: '2026-04-20T00:00:00.000Z',
          in_progress: null,
          steps: {},
          next_eligible: [],
          'extra-steps': [],
        }),
      )
      const sm = new StateManager(
        tmpRoot,
        (_s, _o) => [],
        () => undefined,
        new StatePathResolver(tmpRoot, 'api'),
        new Set(),  // empty globalSteps
        'test-hash',
      )
      sm.loadState()
      // Access private field via cast — the value must be 7.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((sm as any).loadedRootCounter).toBe(7)
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('service-mode loadState sets loadedRootCounter to null when root is missing save_counter', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-capture-null-'))
    try {
      fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
      fs.writeFileSync(
        path.join(tmpRoot, '.scaffold', 'state.json'),
        JSON.stringify({
          'schema-version': 3,
          'scaffold-version': '1.0.0',
          init_methodology: 'deep',
          config_methodology: 'deep',
          'init-mode': 'greenfield',
          created: '2026-04-20T00:00:00.000Z',
          in_progress: null,
          steps: {},
          next_eligible: [],
          'extra-steps': [],
          // no save_counter — legacy root state
        }),
      )
      fs.writeFileSync(
        path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
        JSON.stringify({
          'schema-version': 3,
          'scaffold-version': '1.0.0',
          init_methodology: 'deep',
          config_methodology: 'deep',
          'init-mode': 'greenfield',
          created: '2026-04-20T00:00:00.000Z',
          in_progress: null,
          steps: {},
          next_eligible: [],
          'extra-steps': [],
        }),
      )
      const sm = new StateManager(
        tmpRoot,
        (_s, _o) => [],
        () => undefined,
        new StatePathResolver(tmpRoot, 'api'),
        new Set(),
        'test-hash',
      )
      sm.loadState()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((sm as any).loadedRootCounter).toBeNull()
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})
```

Ensure imports at the top of the test file include `fs`, `path`, `os`, `StatePathResolver`, `StepStateEntry`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/state-manager.test.ts -t "pipelineHash \\+ loadedRootCounter"`
Expected: FAIL — constructor rejects the 6th arg.

- [ ] **Step 3: Update `StateManager` constructor and loadState**

In `src/state/state-manager.ts`, find the class and update.

**3a — Constructor signature** — preserve EXACT modifiers on existing params. Only changes: (i) broaden the `computeEligible` field type so callers can pass the real options-aware `pipeline.computeEligible`, and (ii) append a new trailing optional `pipelineHash?: string` param. Do NOT change `configProvider` modifiers, do NOT add `private` to `pathResolver` (it is already a class field initialized in the body), do NOT drop `private` from `projectRoot`.

**Current** (state-manager.ts lines 12-25 — READ verbatim before editing):

```typescript
export class StateManager {
  private statePath: string
  private pathResolver: StatePathResolver

  constructor(
    private projectRoot: string,
    private computeEligible: (steps: Record<string, StepStateEntry>) => string[],
    private configProvider?: () => { project?: { services?: unknown[] } } | undefined,
    pathResolver?: StatePathResolver,
    private globalSteps?: Set<string>,
  ) {
    this.pathResolver = pathResolver ?? new StatePathResolver(projectRoot)
    this.statePath = this.pathResolver.statePath
  }
```

**After** (only two deltas: expand `computeEligible` type, append `pipelineHash?`):

```typescript
export class StateManager {
  private statePath: string
  private pathResolver: StatePathResolver
  /**
   * Captured during service-mode loadState. Used by saveState to stamp
   * next_eligible_root_counter TOCTOU-safely (spec §3). `undefined` = never
   * loaded; `null` = loaded but root file had no save_counter (legacy).
   */
  private loadedRootCounter: number | null | undefined = undefined

  constructor(
    private projectRoot: string,
    private computeEligible: (
      steps: Record<string, StepStateEntry>,
      options?: { scope?: 'global' | 'service'; globalSteps?: Set<string> },
    ) => string[],
    private configProvider?: () => { project?: { services?: unknown[] } } | undefined,
    pathResolver?: StatePathResolver,
    private globalSteps?: Set<string>,
    /**
     * Pipeline-graph hash for the manager's scope. If omitted, saveState writes
     * `next_eligible_hash: undefined`, which consumers treat as invalid cache
     * (live recompute). Legacy-safe default.
     */
    private pipelineHash?: string,
  ) {
    this.pathResolver = pathResolver ?? new StatePathResolver(projectRoot)
    this.statePath = this.pathResolver.statePath
  }
```

**Do NOT** import `ScaffoldConfig` — keep the existing inline `configProvider` shape.

**3b — loadState capture** — extend the EXISTING service-scope root-state read. `loadState()` currently reads the root state file and stores the parsed object in a local variable `globalParsed` (state-manager.ts lines 64-74). Reuse that variable — do NOT add a second `fs.readFileSync` call; a second read would break TOCTOU safety by decoupling the counter from the merged-steps snapshot.

**Current** (state-manager.ts lines 64-74):

```typescript
// If service-scoped, merge global steps as read-only base
if (this.pathResolver.isServiceScoped) {
  const globalStatePath = path.join(this.pathResolver.rootScaffoldDir, 'state.json')
  if (fs.existsSync(globalStatePath)) {
    const globalRaw = fs.readFileSync(globalStatePath, 'utf8')
    const globalParsed = JSON.parse(globalRaw) as Record<string, unknown>
    const globalState = globalParsed as unknown as PipelineState
    // Merge: global steps as base, service steps override
    state.steps = { ...globalState.steps, ...state.steps }
  }
}
```

**After** (add counter capture using the SAME `globalParsed` object; also handle the root-missing branch):

```typescript
// If service-scoped, merge global steps as read-only base AND capture
// root save_counter for TOCTOU-safe cache stamping in saveState (spec §3).
if (this.pathResolver.isServiceScoped) {
  const globalStatePath = path.join(this.pathResolver.rootScaffoldDir, 'state.json')
  if (fs.existsSync(globalStatePath)) {
    const globalRaw = fs.readFileSync(globalStatePath, 'utf8')
    const globalParsed = JSON.parse(globalRaw) as Record<string, unknown>
    const globalState = globalParsed as unknown as PipelineState
    // Merge: global steps as base, service steps override
    state.steps = { ...globalState.steps, ...state.steps }
    // NEW — capture root's save_counter at the SAME read moment (TOCTOU-safe)
    this.loadedRootCounter =
      typeof globalParsed['save_counter'] === 'number'
        ? (globalParsed['save_counter'] as number)
        : null
  } else {
    // Root state file missing — treat as legacy (null counter). saveState will
    // still write next_eligible_root_counter = undefined, triggering stale-read
    // fallback until root is created.
    this.loadedRootCounter = null
  }
}
```

Do NOT remove, rename, or reorder the existing merge statements. Add only the `this.loadedRootCounter = ...` assignment inside the existing `if (fs.existsSync(...))` branch and the companion `else` branch that sets it to `null`.

- [ ] **Step 4: Run the 3 new tests**

Run: `npx vitest run src/state/state-manager.test.ts -t "pipelineHash \\+ loadedRootCounter"`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Run the full state-manager test file to catch regressions**

Run: `npx vitest run src/state/state-manager.test.ts && npx tsc --noEmit`
Expected: PASS — all tests green, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/state/state-manager.ts src/state/state-manager.test.ts
git commit -m "feat(state): StateManager accepts pipelineHash?; captures root save_counter during service loadState (TOCTOU-safe)"
```

---

## Task 6: StateManager `saveState` writes scope-correct eligibility + counters

**Files:**
- Modify: `src/state/state-manager.ts` (saveState method)
- Test: `src/state/state-manager.test.ts`

**Goal:** Make `saveState` (a) compute `next_eligible` with proper scope options (fixing original P0 service-leakage), (b) write `next_eligible_hash` + (root only) `save_counter` + (service only) `next_eligible_root_counter`.

- [ ] **Step 1: Write failing tests**

Append to `src/state/state-manager.test.ts`:

```typescript
describe('StateManager.saveState — scope-correct eligibility + cache counters', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-save-'))
    fs.mkdirSync(path.join(tmpRoot, '.scaffold'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('root-mode saveState bumps save_counter + stamps next_eligible_hash', () => {
    const computeEligible = vi.fn(() => ['a', 'b'])
    const sm = new StateManager(
      tmpRoot,
      computeEligible,
      () => undefined,
      new StatePathResolver(tmpRoot),
      undefined,
      'pipeline-hash-v1',
    )
    const state: PipelineState = {
      'schema-version': 3,
      'scaffold-version': '1.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-20T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
      // no save_counter yet
    }
    sm.saveState(state)
    const written = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(written.save_counter).toBe(1)
    expect(written.next_eligible_hash).toBe('pipeline-hash-v1')
    expect(written.next_eligible).toEqual(['a', 'b'])
    expect(written.next_eligible_root_counter).toBeUndefined()  // root state — no root-counter stamp
  })

  it('root-mode saveState increments save_counter on each save (monotonic)', () => {
    const sm = new StateManager(
      tmpRoot,
      () => [],
      () => undefined,
      new StatePathResolver(tmpRoot),
      undefined,
      'hash',
    )
    const state: PipelineState = {
      'schema-version': 3,
      'scaffold-version': '1.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-20T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    }
    sm.saveState(state)
    sm.saveState(state)
    sm.saveState(state)
    const written = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(written.save_counter).toBe(3)
  })

  it('service-mode saveState passes {scope: "service", globalSteps} to computeEligible', () => {
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'state.json'),
      JSON.stringify({
        'schema-version': 3, 'scaffold-version': '1.0.0',
        init_methodology: 'deep', config_methodology: 'deep',
        'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
        in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
        save_counter: 10,
      }),
    )
    const globalSteps = new Set(['global-a'])
    const computeEligible = vi.fn(() => ['svc-b'])
    const sm = new StateManager(
      tmpRoot,
      computeEligible,
      () => undefined,
      new StatePathResolver(tmpRoot, 'api'),
      globalSteps,
      'svc-hash',
    )
    // Must loadState first so loadedRootCounter is populated
    sm.loadState()
    sm.saveState({
      'schema-version': 3, 'scaffold-version': '1.0.0',
      init_methodology: 'deep', config_methodology: 'deep',
      'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
      in_progress: null, steps: { 'svc-a': { status: 'pending', source: 'pipeline', produces: [] } },
      next_eligible: [], 'extra-steps': [],
    })
    expect(computeEligible).toHaveBeenCalled()
    const call = computeEligible.mock.calls[0]
    expect(call[1]).toEqual({ scope: 'service', globalSteps })
  })

  it('service-mode saveState stamps next_eligible_root_counter from loadedRootCounter', () => {
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'state.json'),
      JSON.stringify({
        'schema-version': 3, 'scaffold-version': '1.0.0',
        init_methodology: 'deep', config_methodology: 'deep',
        'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
        in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
        save_counter: 42,
      }),
    )
    const sm = new StateManager(
      tmpRoot,
      () => [],
      () => undefined,
      new StatePathResolver(tmpRoot, 'api'),
      new Set(),
      'svc-hash',
    )
    sm.loadState()  // captures root counter = 42
    sm.saveState({
      'schema-version': 3, 'scaffold-version': '1.0.0',
      init_methodology: 'deep', config_methodology: 'deep',
      'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
      in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
    })
    const written = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'), 'utf8'),
    )
    expect(written.next_eligible_root_counter).toBe(42)
    expect(written.next_eligible_hash).toBe('svc-hash')
    expect(written.save_counter).toBeUndefined()  // service state — no own counter
  })

  it('omitted pipelineHash produces next_eligible_hash: undefined (legacy-safe)', () => {
    const sm = new StateManager(
      tmpRoot,
      () => [],
      () => undefined,
      new StatePathResolver(tmpRoot),
      undefined,
      // no pipelineHash
    )
    sm.saveState({
      'schema-version': 3, 'scaffold-version': '1.0.0',
      init_methodology: 'deep', config_methodology: 'deep',
      'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
      in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
    })
    const written = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), 'utf8'),
    )
    expect(written.next_eligible_hash).toBeUndefined()
    expect(written.save_counter).toBe(1)  // counter still bumps
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/state-manager.test.ts -t "scope-correct eligibility"`
Expected: FAIL — saveState doesn't pass scope options and doesn't write counters.

- [ ] **Step 3: Update `saveState` in `src/state/state-manager.ts`**

Find the current `saveState` method (around lines 80-92). Current code likely looks like:

```typescript
saveState(state: PipelineState): void {
  state.next_eligible = this.computeEligible(state.steps)
  // existing global-steps stripping logic for service mode...
  let stateToWrite: PipelineState = state
  if (this.pathResolver.isServiceScoped && this.globalSteps) {
    const filteredSteps: Record<string, StepStateEntry> = {}
    for (const [name, entry] of Object.entries(state.steps)) {
      if (!this.globalSteps.has(name)) filteredSteps[name] = entry
    }
    stateToWrite = { ...state, steps: filteredSteps }
  }
  atomicWriteFile(this.statePath, JSON.stringify(stateToWrite, null, 2))
}
```

Replace with:

```typescript
saveState(state: PipelineState): void {
  const isService = this.pathResolver.isServiceScoped && this.globalSteps
  const scopeOptions = isService
    ? { scope: 'service' as const, globalSteps: this.globalSteps }
    : undefined

  // FIXES ORIGINAL P0: compute with proper scope so service state only caches
  // service-eligible steps.
  state.next_eligible = this.computeEligible(state.steps, scopeOptions)
  state.next_eligible_hash = this.pipelineHash

  if (isService) {
    // Cross-file invalidation stamp: capture root counter at load time,
    // reuse at save time (TOCTOU-safe per spec §3). Only stamp when a concrete
    // counter value was captured; under strict `exactOptionalPropertyTypes`,
    // omitting the key (via delete) is safer than assigning `undefined`.
    if (typeof this.loadedRootCounter === 'number') {
      state.next_eligible_root_counter = this.loadedRootCounter
    } else {
      delete state.next_eligible_root_counter
    }
  } else {
    // Root state: bump the monotonic counter.
    state.save_counter = (state.save_counter ?? 0) + 1
  }

  // Existing global-step stripping for service-mode persisted steps
  let stateToWrite: PipelineState = state
  if (isService) {
    const filteredSteps: Record<string, StepStateEntry> = {}
    for (const [name, entry] of Object.entries(state.steps)) {
      if (!this.globalSteps!.has(name)) filteredSteps[name] = entry
    }
    stateToWrite = { ...state, steps: filteredSteps }
  }
  atomicWriteFile(this.statePath, JSON.stringify(stateToWrite, null, 2))
}
```

- [ ] **Step 4: Run the 5 new tests**

Run: `npx vitest run src/state/state-manager.test.ts -t "scope-correct eligibility"`
Expected: PASS.

- [ ] **Step 5: Run the full state-manager test file**

Run: `npx vitest run src/state/state-manager.test.ts && npx tsc --noEmit`
Expected: PASS — existing tests + 5 new tests all green.

Any existing test that directly asserts `state.next_eligible` equal to a specific list may need updating if the scope-filtering changes the output. Investigate and fix individually.

- [ ] **Step 6: Commit**

```bash
git add src/state/state-manager.ts src/state/state-manager.test.ts
git commit -m "feat(state): saveState writes scope-correct next_eligible + hash + counter fields"
```

---

## Task 7: `readEligible()` helper

**Files:**
- Create: `src/core/pipeline/read-eligible.ts` (new file)
- Test: `src/core/pipeline/read-eligible.test.ts` (new file)

**Goal:** Free function in `core/pipeline/` that validates cache then reads or falls back.

- [ ] **Step 1: Write failing tests (7 total)**

Create `src/core/pipeline/read-eligible.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { readEligible } from './read-eligible.js'
import type { PipelineState } from '../../types/index.js'
import type { ResolvedPipeline } from './types.js'

function mkState(overrides: Partial<PipelineState>): PipelineState {
  return {
    'schema-version': 3,
    'scaffold-version': '1.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-04-20T00:00:00.000Z',
    in_progress: null,
    steps: {},
    next_eligible: [],
    'extra-steps': [],
    ...overrides,
  }
}

function mkPipeline(
  hashGlobal: string,
  hashService: string,
  liveEligible: string[] = ['live-step'],
): ResolvedPipeline {
  return {
    graph: { nodes: new Map(), edges: new Map() },
    preset: { name: 'deep', description: 'test', default_depth: 3, steps: {} },
    overlay: { steps: {}, knowledge: {}, reads: {}, dependencies: {}, crossReads: {} },
    stepMeta: new Map(),
    computeEligible: vi.fn(() => liveEligible) as unknown as ResolvedPipeline['computeEligible'],
    globalSteps: new Set(),
    getPipelineHash: (scope) => scope === 'service' ? hashService : hashGlobal,
  }
}

describe('readEligible', () => {
  it('returns cached list when hash matches (global scope)', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1')
    const state = mkState({
      next_eligible: ['cached-a', 'cached-b'],
      next_eligible_hash: 'hash-global-v1',
    })
    expect(readEligible(state, pipeline, undefined, undefined)).toEqual(['cached-a', 'cached-b'])
    expect(pipeline.computeEligible).not.toHaveBeenCalled()
  })

  it('falls back to live compute when hash is absent', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1', ['fallback'])
    const state = mkState({
      next_eligible: ['stale'],
      // no next_eligible_hash
    })
    expect(readEligible(state, pipeline, undefined, undefined)).toEqual(['fallback'])
    expect(pipeline.computeEligible).toHaveBeenCalled()
  })

  it('falls back to live compute when hash mismatches', () => {
    const pipeline = mkPipeline('hash-global-v2', 'hash-service-v2', ['fallback'])
    const state = mkState({
      next_eligible: ['stale'],
      next_eligible_hash: 'hash-global-v1',  // old hash
    })
    expect(readEligible(state, pipeline, undefined, undefined)).toEqual(['fallback'])
  })

  it('service scope: uses cache when hash matches AND root counter matches', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1')
    const state = mkState({
      next_eligible: ['svc-cached'],
      next_eligible_hash: 'hash-service-v1',
      next_eligible_root_counter: 5,
    })
    const rootReader = () => 5
    expect(readEligible(
      state,
      pipeline,
      { scope: 'service', globalSteps: new Set() },
      rootReader,
    )).toEqual(['svc-cached'])
    expect(pipeline.computeEligible).not.toHaveBeenCalled()
  })

  it('service scope: falls back when root counter mismatches', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1', ['fallback'])
    const state = mkState({
      next_eligible: ['svc-stale'],
      next_eligible_hash: 'hash-service-v1',
      next_eligible_root_counter: 5,
    })
    const rootReader = () => 6  // root moved to 6
    expect(readEligible(
      state,
      pipeline,
      { scope: 'service', globalSteps: new Set() },
      rootReader,
    )).toEqual(['fallback'])
  })

  it('service scope: matches when both counters are null (legacy root, no counter yet)', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1')
    const state = mkState({
      next_eligible: ['svc-cached'],
      next_eligible_hash: 'hash-service-v1',
      // no next_eligible_root_counter (undefined === null check is strict; read as null)
    })
    const rootReader = () => null
    // `undefined !== null` so this would NOT match — falls through to recompute.
    // This is the correct behavior: if the cache doesn't stamp a counter, treat as stale.
    expect(readEligible(
      state,
      pipeline,
      { scope: 'service', globalSteps: new Set() },
      rootReader,
    )).not.toEqual(['svc-cached'])
  })

  it('scope: undefined normalizes to global (uses global hash)', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1')
    const state = mkState({
      next_eligible: ['g-cached'],
      next_eligible_hash: 'hash-global-v1',
    })
    // Scope undefined should still use the global hash for cache match.
    expect(readEligible(state, pipeline, undefined, undefined)).toEqual(['g-cached'])
    expect(readEligible(state, pipeline, { scope: undefined }, undefined)).toEqual(['g-cached'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/pipeline/read-eligible.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `readEligible` in `src/core/pipeline/read-eligible.ts`**

Create `src/core/pipeline/read-eligible.ts`:

```typescript
import type { PipelineState, StepStateEntry } from '../../types/index.js'
import type { ResolvedPipeline } from './types.js'

/**
 * Read the eligible-step list, preferring the cached list when valid for the
 * current pipeline graph, scope, and (for service scope) root state version.
 * Falls back to live `pipeline.computeEligible()` when any validity check
 * fails. Spec §4.
 *
 * @param state Loaded PipelineState (with optional cache fields)
 * @param pipeline ResolvedPipeline exposing getPipelineHash + computeEligible
 * @param scopeOptions Pass `{ scope: 'service', globalSteps }` for service-
 *        scoped queries; pass `undefined` (or `{ scope: 'global' }`) for global
 * @param rootCounterReader For service scope only: reads the current root
 *        save_counter on demand (spec §6). Absent for global scope.
 */
export function readEligible(
  state: PipelineState,
  pipeline: ResolvedPipeline,
  scopeOptions: { scope?: 'global' | 'service'; globalSteps?: Set<string> } | undefined,
  rootCounterReader: (() => number | null) | undefined,
): string[] {
  // Normalize scope: `undefined` / null / 'global' all map to 'global'.
  const scope = scopeOptions?.scope === 'service' ? 'service' : 'global'
  const currentHash = pipeline.getPipelineHash(scope)
  if (state.next_eligible_hash !== currentHash) {
    return pipeline.computeEligible(
      state.steps as Record<string, StepStateEntry>,
      scopeOptions,
    )
  }
  if (scope === 'service') {
    const currentRootCounter = rootCounterReader?.() ?? null
    if (state.next_eligible_root_counter !== currentRootCounter) {
      return pipeline.computeEligible(
        state.steps as Record<string, StepStateEntry>,
        scopeOptions,
      )
    }
  }
  return state.next_eligible
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/pipeline/read-eligible.test.ts && npx tsc --noEmit`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline/read-eligible.ts src/core/pipeline/read-eligible.test.ts
git commit -m "feat(pipeline): readEligible — cache-validating reader with scope + counter checks"
```

---

## Task 8: `next.ts` switches to `readEligible`

**Files:**
- Modify: `src/cli/commands/next.ts`
- Modify: `src/cli/commands/next.test.ts`

**Goal:** Replace the live recompute at next.ts lines 88-91 with `readEligible()`. Thread `pipelineHash` through the StateManager constructor.

- [ ] **Step 1: Write failing test in `src/cli/commands/next.test.ts`**

Append inside the main `describe('next command', ...)` block:

```typescript
it('uses readEligible cache when hash+counter match (skips live computeEligible)', async () => {
  // Mock state with populated cache + matching hash
  const cachedEligible = ['cached-step-x', 'cached-step-y']
  type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
  MockStateManager.mockImplementation(() => ({
    loadState: vi.fn(() => makeState({
      steps: {
        'cached-step-x': { status: 'pending', source: 'pipeline', produces: [] },
      },
      next_eligible: cachedEligible,
      next_eligible_hash: 'test-hash-v1',
    }) as unknown as LoadReturn),
    reconcileWithPipeline: vi.fn(() => false),
  }) as unknown as InstanceType<typeof StateManager>)
  // If readEligible calls computeEligible, this mock would fire:
  mockComputeEligible.mockReturnValue(['should-not-appear'])

  // Override the default resolvePipeline mock to return matching hash
  vi.mocked(resolvePipeline).mockReturnValueOnce({
    graph: { nodes: new Map(), edges: new Map() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preset: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overlay: {} as any,
    stepMeta: new Map([
      ['cached-step-x', makeFrontmatter('cached-step-x', 'desc', 'pre', 1).frontmatter],
      ['cached-step-y', makeFrontmatter('cached-step-y', 'desc', 'pre', 2).frontmatter],
    ]),
    computeEligible: mockComputeEligible,
    globalSteps: new Set(),
    getPipelineHash: vi.fn((_scope) => 'test-hash-v1'),
  })

  const metaPrompts = new Map([
    ['cached-step-x', makeFrontmatter('cached-step-x', 'desc X', 'pre', 1)],
    ['cached-step-y', makeFrontmatter('cached-step-y', 'desc Y', 'pre', 2)],
  ])
  mockDiscoverMetaPrompts.mockReturnValue(
    metaPrompts as unknown as ReturnType<typeof discoverMetaPrompts>,
  )

  await nextCommand.handler(defaultArgv())

  const allOutput = writtenLines.join('')
  expect(allOutput).toContain('scaffold run cached-step-x')
  expect(allOutput).toContain('scaffold run cached-step-y')
  expect(allOutput).not.toContain('should-not-appear')
  // Cache was preferred — no live recompute.
  expect(mockComputeEligible).not.toHaveBeenCalled()
})

it('falls back to live compute when hash mismatches', async () => {
  type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
  MockStateManager.mockImplementation(() => ({
    loadState: vi.fn(() => makeState({
      steps: {
        'any-step': { status: 'pending', source: 'pipeline', produces: [] },
      },
      next_eligible: ['stale-cached'],
      next_eligible_hash: 'OLD-HASH',
    }) as unknown as LoadReturn),
    reconcileWithPipeline: vi.fn(() => false),
  }) as unknown as InstanceType<typeof StateManager>)
  mockComputeEligible.mockReturnValue(['fresh-step'])
  vi.mocked(resolvePipeline).mockReturnValueOnce({
    graph: { nodes: new Map(), edges: new Map() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preset: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overlay: {} as any,
    stepMeta: new Map([
      ['fresh-step', makeFrontmatter('fresh-step', 'desc', 'pre', 1).frontmatter],
    ]),
    computeEligible: mockComputeEligible,
    globalSteps: new Set(),
    getPipelineHash: vi.fn(() => 'NEW-HASH'),
  })
  mockDiscoverMetaPrompts.mockReturnValue(new Map([
    ['fresh-step', makeFrontmatter('fresh-step', 'desc', 'pre', 1)],
  ]) as unknown as ReturnType<typeof discoverMetaPrompts>)

  await nextCommand.handler(defaultArgv())

  const allOutput = writtenLines.join('')
  expect(allOutput).toContain('scaffold run fresh-step')
  expect(allOutput).not.toContain('stale-cached')
  expect(mockComputeEligible).toHaveBeenCalled()
})
```

Ensure `resolvePipeline` is imported and mocked at the top of the test file if not already (for the default mock).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cli/commands/next.test.ts -t "readEligible cache|falls back to live compute"`
Expected: FAIL — `next.ts` still calls computeEligible always.

- [ ] **Step 3: Update `next.ts`**

In `src/cli/commands/next.ts`:

**3a.** Add imports at the top:

```typescript
import { readEligible } from '../../core/pipeline/read-eligible.js'
import { readRootSaveCounter } from '../../state/root-counter-reader.js'
```

**3b.** Replace the lines 88-91 (`const eligible = pipeline.computeEligible(...)`) with:

```typescript
const state = stateManager.loadState()
const scopeOptions = service
  ? { scope: 'service' as const, globalSteps: pipeline.globalSteps }
  : undefined
const eligible = readEligible(
  state,
  pipeline,
  scopeOptions,
  service ? () => readRootSaveCounter(projectRoot) : undefined,
)
```

**3c.** Thread `pipelineHash` to StateManager constructor. Find the existing StateManager construction (around line 68-75) and add `pipeline.getPipelineHash(service ? 'service' : 'global')` as the 6th arg:

```typescript
const pathResolver = new StatePathResolver(projectRoot, service)
const stateManager = new StateManager(
  projectRoot,
  pipeline.computeEligible,
  () => context.config ?? undefined,
  pathResolver,
  pipeline.globalSteps,
  pipeline.getPipelineHash(service ? 'service' : 'global'),  // NEW
)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/cli/commands/next.test.ts && npx tsc --noEmit`
Expected: PASS — existing 12 tests + 2 new tests all green.

If tests fail, the most likely causes:
- Existing tests mock `resolvePipeline` without `getPipelineHash` → add to those mocks
- Existing tests expect computeEligible to always be called → update to account for cache-hit path

Fix each by inspecting the failure and either (a) extending the mock to include `getPipelineHash: vi.fn(() => 'any-hash')`, or (b) updating the state fixture to NOT set `next_eligible_hash`, which forces fallback.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/next.ts src/cli/commands/next.test.ts
git commit -m "feat(next): switch to readEligible + thread pipelineHash to StateManager"
```

---

## Task 9: `status.ts` switches to `readEligible`

**Files:**
- Modify: `src/cli/commands/status.ts`
- Modify: `src/cli/commands/status.test.ts`

**Goal:** Two consumer-site changes in `status.ts` — the interactive live-recompute (line ~271) AND the JSON emitter (line ~221). Thread `pipelineHash` through the StateManager constructor.

- [ ] **Step 1: Write failing test**

Append to `src/cli/commands/status.test.ts`:

```typescript
it('JSON nextEligible comes from readEligible (hash-validated)', async () => {
  mockResolveOutputMode.mockReturnValue('json')
  type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
  MockStateManager.mockImplementation(() => ({
    loadState: vi.fn(() => makeState({
      steps: {
        'step-x': { status: 'pending', source: 'pipeline', produces: [] },
      },
      next_eligible: ['cached-next'],
      next_eligible_hash: 'test-hash',
    }) as unknown as LoadReturn),
    reconcileWithPipeline: vi.fn(() => false),
  }) as unknown as InstanceType<typeof StateManager>)
  mockComputeEligible.mockReturnValue(['should-not-appear'])  // would appear if cache-bypassed
  vi.mocked(resolvePipeline).mockReturnValueOnce({
    graph: { nodes: new Map(), edges: new Map() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preset: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overlay: {} as any,
    stepMeta: new Map(),
    computeEligible: mockComputeEligible,
    globalSteps: new Set(),
    getPipelineHash: vi.fn(() => 'test-hash'),
  })
  mockDiscoverMetaPrompts.mockReturnValue(new Map([
    ['step-x', makeFrontmatter('step-x', 'desc', 'pre', 1)],
  ]) as unknown as ReturnType<typeof discoverMetaPrompts>)

  await statusCommand.handler(defaultArgv())
  const envelope = JSON.parse(writtenLines.join(''))
  expect(envelope.data.nextEligible).toEqual(['cached-next'])
  // Cache-hit path: live compute never fires.
  expect(mockComputeEligible).not.toHaveBeenCalled()
})
```

(Test helpers `makeState`, `mockResolveOutputMode`, `MockStateManager`, `mockComputeEligible`, `resolvePipeline`, `defaultArgv`, `statusCommand`, `mockDiscoverMetaPrompts`, `makeFrontmatter` should already exist — similar to next.test.ts. Add imports if any are missing.)

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/cli/commands/status.test.ts -t "JSON nextEligible comes from readEligible"`
Expected: FAIL — status.ts still emits `state.next_eligible` directly.

- [ ] **Step 3: Update `status.ts`**

In `src/cli/commands/status.ts`:

**3a.** Add imports:

```typescript
import { readEligible } from '../../core/pipeline/read-eligible.js'
import { readRootSaveCounter } from '../../state/root-counter-reader.js'
```

**3b.** Thread pipelineHash through the StateManager constructor (find the existing `new StateManager(...)` call and add the hash arg as the 6th positional):

```typescript
const stateManager = new StateManager(
  projectRoot,
  pipeline.computeEligible,
  () => context.config ?? undefined,
  pathResolver,
  pipeline.globalSteps,
  pipeline.getPipelineHash(service ? 'service' : 'global'),  // NEW
)
```

**3c.** Replace the JSON emit at line ~221. Find `nextEligible: state.next_eligible` and replace:

```typescript
// Before:
//   nextEligible: state.next_eligible,
// After:
const scopeOptionsForRead = service
  ? { scope: 'service' as const, globalSteps: pipeline.globalSteps }
  : undefined
const validatedEligible = readEligible(
  state,
  pipeline,
  scopeOptionsForRead,
  service ? () => readRootSaveCounter(projectRoot) : undefined,
)
// ... later in the envelope:
  nextEligible: validatedEligible,
```

Note: compute `validatedEligible` ONCE, before both the JSON emit AND the interactive recompute path — reuse the single result.

**3d.** Replace the interactive-mode live recompute at line ~271 (`const liveEligible = pipeline.computeEligible(state.steps)`) with the same `validatedEligible`:

```typescript
// Before:
//   const liveEligible = pipeline.computeEligible(state.steps)
// After:
const liveEligible = validatedEligible
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/cli/commands/status.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/status.ts src/cli/commands/status.test.ts
git commit -m "feat(status): switch JSON + interactive recompute to readEligible"
```

---

## Task 10: Thread pipelineHash through run/skip/reset/rework/complete

**Files:**
- Modify: `src/cli/commands/run.ts`
- Modify: `src/cli/commands/skip.ts`
- Modify: `src/cli/commands/reset.ts`
- Modify: `src/cli/commands/rework.ts`
- Modify: `src/cli/commands/complete.ts`
- Tests: corresponding `*.test.ts` files if tsc breaks on mock StateManager construction

**Goal:** Pure threading — these commands mutate state via saveState; without the hash they'd write `next_eligible_hash: undefined`, invalidating every subsequent cache read.

- [ ] **Step 1: Run grep to locate each StateManager construction**

```
grep -n "new StateManager(" src/cli/commands/run.ts src/cli/commands/skip.ts src/cli/commands/reset.ts src/cli/commands/rework.ts src/cli/commands/complete.ts
```

Expected: one match per file (or possibly multiple in run.ts; inspect).

- [ ] **Step 2: Update each file to thread the hash**

For each of the 5 files, update the StateManager construction. The pattern is identical in every command:

```typescript
const stateManager = new StateManager(
  projectRoot,
  pipeline.computeEligible,
  () => context.config ?? undefined,
  pathResolver,
  pipeline.globalSteps,
  pipeline.getPipelineHash(service ? 'service' : 'global'),  // NEW
)
```

Apply this edit to:
- `src/cli/commands/run.ts` (around line ~170, after `const pathResolver = new StatePathResolver(...)`)
- `src/cli/commands/skip.ts` (similar location)
- `src/cli/commands/reset.ts`
- `src/cli/commands/rework.ts`
- `src/cli/commands/complete.ts`

In each file, ensure `service` is defined locally (usually from `argv.service as string | undefined`). If the file's variable is named differently (e.g., `argv.service` used directly), substitute accordingly.

- [ ] **Step 3: Run tsc + focused tests**

```
npx tsc --noEmit
npx vitest run src/cli/commands/run.test.ts src/cli/commands/skip.test.ts src/cli/commands/reset.test.ts src/cli/commands/rework.test.ts src/cli/commands/complete.test.ts
```

Expected: PASS.

If tests fail because mock `resolvePipeline` return values lack `getPipelineHash`, extend the mocks by adding `getPipelineHash: vi.fn(() => 'fake-hash')` to the returned object. Apply the minimum fix per failing test.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts src/cli/commands/skip.ts src/cli/commands/reset.ts src/cli/commands/rework.ts src/cli/commands/complete.ts src/cli/commands/run.test.ts src/cli/commands/skip.test.ts src/cli/commands/reset.test.ts src/cli/commands/rework.test.ts src/cli/commands/complete.test.ts 2>/dev/null
git commit -m "feat(commands): thread pipelineHash through run/skip/reset/rework/complete StateManager"
```

---

## Task 11: info.ts + dashboard.ts — explicit legacy-safe hash (no pipeline in scope)

**Files:**
- Modify: `src/cli/commands/info.ts` (two StateManager construction sites at lines ~66 and ~117)
- Modify: `src/cli/commands/dashboard.ts` (StateManager construction at line ~83)

**Goal:** Pass explicit `undefined` for `pipelineHash` in these read-only command paths. These files do NOT resolve a pipeline (they use `() => []` as `computeEligible` and never have `pipeline` in scope), so there is no hash to thread. Trying to resolve a pipeline here would be a significant scope expansion — out of scope for this PR.

**Why this is safe:** `info` and `dashboard` never call `saveState` directly. The only `saveState` they can trigger is through `loadState` → `migrateState` → `saveState` on the FIRST load of a pre-migration state file (state-manager.ts lines 60-62). Subsequent loads skip migration (idempotent). The one-time stale hash on migration is self-healing: the next `scaffold next`/`run`/`skip`/etc. command threads the real hash and repopulates the cache.

- [ ] **Step 1: Make the `undefined` pass explicit for info.ts**

`info.ts` has two StateManager sites. Both currently pass 5 args ending in `new Set<string>()`. Append an explicit `undefined` so the intent is documented:

```typescript
const stateManager = new StateManager(
  projectRoot,
  () => [],
  () => config ?? undefined,
  pathResolver,
  new Set<string>(),
  undefined,  // pipelineHash — info does not resolve pipeline; legacy-safe (see plan Task 11)
)
```

Apply to BOTH sites (around lines 66-72 and 117-123). Keep everything else identical.

- [ ] **Step 2: Same for dashboard.ts**

`dashboard.ts` currently passes 4 args (ends in `pathResolver`). Append two explicit `undefined`s — one for `globalSteps` (preserves prior behavior since it was absent before) and one for `pipelineHash`:

```typescript
const stateManager = new StateManager(
  projectRoot,
  () => [],
  () => config ?? undefined,
  pathResolver,
  undefined,  // globalSteps — dashboard does not resolve pipeline
  undefined,  // pipelineHash — legacy-safe; dashboard only triggers saveState via one-time migration
)
```

- [ ] **Step 3: Run tsc + tests**

```
npx tsc --noEmit
npx vitest run src/cli/commands/info.test.ts src/cli/commands/dashboard.test.ts
```

Expected: PASS. No test changes needed — behavior is unchanged (hash was already effectively absent).

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/info.ts src/cli/commands/dashboard.ts
git commit -m "refactor(commands): info/dashboard pass explicit undefined pipelineHash (no pipeline in scope)"
```

---

## Task 12: adopt.ts + wizard.ts — explicit legacy-safe hash (init paths)

**Files:**
- Modify: `src/cli/commands/adopt.ts` (two StateManager sites at lines ~119 and ~132)
- Modify: `src/wizard/wizard.ts` (StateManager site at line ~221)

**Goal:** Init paths write state BEFORE any `scaffold next`/`status` is run. These files currently construct StateManager with a 3-arg form (`projectRoot`, `() => []`, `configProvider`) and have NO `pipeline` in scope. Expanding them to resolve a full pipeline is out of scope for this PR. Instead, pass explicit `undefined` for `pipelineHash` and document why this is safe.

**Why this is safe:** The init-time `initializeState` writes a state file whose `next_eligible` is empty (no steps completed yet). The very first `scaffold next` a user runs will detect `next_eligible_hash === undefined`, fall back to live compute, and the subsequent `saveState` (from any mutation like `scaffold run`) will stamp the real hash. No user-visible correctness issue; one extra live recompute on the first command.

- [ ] **Step 1: Locate the StateManager constructions**

```
grep -n "new StateManager(" src/cli/commands/adopt.ts src/wizard/wizard.ts
```

Expected output:
- `src/cli/commands/adopt.ts:119:    const stateManager = new StateManager(projectRoot, () => [], () => undefined)`
- `src/cli/commands/adopt.ts:132:    const stateManager = new StateManager(projectRoot, () => [], () => undefined)`
- `src/wizard/wizard.ts:221:  const stateManager = new StateManager(projectRoot, () => [], () => config)`

- [ ] **Step 2: Expand the 3-arg form with explicit undefineds**

For BOTH sites in `adopt.ts` (lines 119 and 132), change:

```typescript
// Before:
const stateManager = new StateManager(projectRoot, () => [], () => undefined)
// After:
const stateManager = new StateManager(
  projectRoot,
  () => [],
  () => undefined,
  undefined,  // pathResolver — fall through to default StatePathResolver(projectRoot)
  undefined,  // globalSteps — init path; no pipeline resolution in scope
  undefined,  // pipelineHash — legacy-safe; first scaffold next will live-recompute and repopulate
)
```

For `wizard.ts` line 221:

```typescript
// Before:
const stateManager = new StateManager(projectRoot, () => [], () => config)
// After:
const stateManager = new StateManager(
  projectRoot,
  () => [],
  () => config,
  undefined,  // pathResolver
  undefined,  // globalSteps
  undefined,  // pipelineHash — legacy-safe (see plan Task 12)
)
```

- [ ] **Step 3: Run tsc + tests**

```
npx tsc --noEmit
npx vitest run src/cli/commands/adopt.test.ts src/wizard/wizard.test.ts
```

Expected: PASS. Behavior unchanged — the previously-omitted 4th/5th args were already using the defaults.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/adopt.ts src/wizard/wizard.ts
git commit -m "refactor(init): adopt/wizard pass explicit undefined pipelineHash (out-of-scope pipeline resolution)"
```

---

## Task 13: Update lingering test fixtures for `getPipelineHash` on `ResolvedPipeline` mocks

**Files (to grep and update — exhaustive list):**
- `src/cli/commands/run.test.ts`
- `src/cli/commands/skip.test.ts`
- `src/cli/commands/reset.test.ts`
- `src/cli/commands/rework.test.ts`
- `src/cli/commands/complete.test.ts`
- `src/cli/commands/status.test.ts`
- `src/cli/commands/next.test.ts`
- `src/cli/commands/info.test.ts`
- `src/cli/commands/dashboard.test.ts`
- `src/core/pipeline/resolver.test.ts` (may already be covered by Task 4)
- Any e2e test in `src/e2e/` that constructs a `ResolvedPipeline` literal or mocks `resolvePipeline`

**Goal:** Every `ResolvedPipeline`-shaped test literal and `vi.mocked(resolvePipeline).mockReturnValue(...)` must include `getPipelineHash` on its returned object — otherwise tsc fails with "Property 'getPipelineHash' is missing". Task 4 added the field to the interface; Tasks 8–12 already fix the command-specific test files where new tests were added. This task sweeps every REMAINING test file that constructs `ResolvedPipeline` literals.

- [ ] **Step 1: Find every `ResolvedPipeline`-shaped literal in tests**

```bash
grep -rn "computeEligible:\|globalSteps: new Set" src/cli src/core src/e2e --include="*.test.ts" | grep -v "getPipelineHash" | head -40
```

Each match is a candidate site that needs `getPipelineHash: vi.fn(() => 'fake-hash')` (or a specific hash string if the test validates cache behavior).

- [ ] **Step 2: Add `getPipelineHash` to each literal**

For every literal of the form:

```typescript
{
  graph: ...,
  preset: ...,
  overlay: ...,
  stepMeta: ...,
  computeEligible: ...,
  globalSteps: new Set(),
}
```

Append:

```typescript
  getPipelineHash: vi.fn(() => 'fake-hash'),
```

Use a unique hash string per test ONLY if the test needs to validate cache hit/miss (see Tasks 8 and 9 patterns). Otherwise `'fake-hash'` is fine — the mocked StateManager in most tests never reads the hash.

- [ ] **Step 3: Run the full suite + tsc**

```
npx tsc --noEmit 2>&1 | head -30
npx vitest run 2>&1 | tail -30
```

Expected: both clean. If a test fails because a state fixture now has `next_eligible_hash` matching the fake pipeline hash (triggering cache hit instead of live compute), either (a) change the fixture hash to `'different-hash'` to force fallback, or (b) update the expected value to the cached list. Pick whichever matches the test's original intent.

- [ ] **Step 4: Run `make check-all` for all quality gates**

```
make check-all 2>&1 | tail -5
```

Expected: `Exit: 0`.

- [ ] **Step 5: Commit any fixture fixes**

```bash
git add -u
git commit -m "test(cache-v2): add getPipelineHash to ResolvedPipeline mocks across remaining test files"
```

If Step 1's grep returns no matches, skip the commit.

---

## Task 14: E2E — cross-file invalidation + pipeline-edit invalidation

**Files:**
- Modify: `src/e2e/cross-service-references.test.ts` OR create `src/e2e/eligible-cache.test.ts`

**Goal:** Two integration tests that lock the end-to-end correctness claims from acceptance criteria AC2 + AC3.

- [ ] **Step 1: Create a new E2E file `src/e2e/eligible-cache.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadPipelineContext } from '../core/pipeline/context.js'
import { resolvePipeline } from '../core/pipeline/resolver.js'
import { StateManager } from '../state/state-manager.js'
import { StatePathResolver } from '../state/state-path-resolver.js'
import { readEligible } from '../core/pipeline/read-eligible.js'
import { readRootSaveCounter } from '../state/root-counter-reader.js'
import { createOutputContext } from '../cli/output/context.js'

describe('Eligible-Step Cache v2 — E2E', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ec2-e2e-'))
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
    // Minimal config with 1 service
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'config.yml'),
      `version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: api
      projectType: backend
      backendConfig:
        apiStyle: rest
`,
    )
    // Minimal v3 state files — counter + eligibility fields absent (legacy-fresh)
    const baseState = {
      'schema-version': 3,
      'scaffold-version': '1.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-20T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    }
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify(baseState))
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
      JSON.stringify(baseState),
    )
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('AC2: service cache is invalidated by root state mutation (cross-file)', () => {
    // Seed: do an initial root save so root.save_counter exists (otherwise the
    // service's cached counter would be stamped as undefined and be trivially
    // "stale" via the legacy fallback, which is NOT what AC2 tests).
    const context = loadPipelineContext(tmpRoot)
    const output = createOutputContext('auto')
    const rootPipeline = resolvePipeline(context, { output })
    const rootPathResolver = new StatePathResolver(tmpRoot)
    const rootSm = new StateManager(
      tmpRoot,
      rootPipeline.computeEligible,
      () => context.config ?? undefined,
      rootPathResolver,
      rootPipeline.globalSteps,
      rootPipeline.getPipelineHash('global'),
    )
    rootSm.saveState(rootSm.loadState())  // save_counter = 1

    // Populate service cache. After this save, the service file records
    // next_eligible_root_counter = 1.
    const svcPipeline = resolvePipeline(context, { output, serviceId: 'api' })
    const pathResolver = new StatePathResolver(tmpRoot, 'api')
    const sm = new StateManager(
      tmpRoot,
      svcPipeline.computeEligible,
      () => context.config ?? undefined,
      pathResolver,
      svcPipeline.globalSteps,
      svcPipeline.getPipelineHash('service'),
    )
    const state = sm.loadState()
    state.steps['some-step'] = { status: 'pending', source: 'pipeline', produces: [] }
    sm.saveState(state)

    // Verify the service file has the expected stamps on disk before mutation.
    const svcDisk = JSON.parse(fs.readFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'), 'utf8',
    ))
    expect(svcDisk.next_eligible_root_counter).toBe(1)
    expect(typeof svcDisk.next_eligible_hash).toBe('string')

    // MUTATE root — bumps save_counter from 1 to 2.
    rootSm.saveState(rootSm.loadState())
    expect(readRootSaveCounter(tmpRoot)).toBe(2)

    // readEligible must now fall back to live compute because
    // next_eligible_root_counter (1) !== current root counter (2).
    const liveCalls: string[] = []
    const sentinelPipeline = {
      ...svcPipeline,
      computeEligible: ((steps, opts) => {
        liveCalls.push('live-recompute-fired')
        return svcPipeline.computeEligible(steps, opts)
      }) as typeof svcPipeline.computeEligible,
    }
    readEligible(
      sm.loadState(),
      sentinelPipeline,
      { scope: 'service', globalSteps: svcPipeline.globalSteps },
      () => readRootSaveCounter(tmpRoot),
    )
    expect(liveCalls).toContain('live-recompute-fired')
  })

  it('AC3: pipeline-graph change (different hash on re-resolution) invalidates cache on read', () => {
    // End-to-end: save state against pipeline-A's hash, then re-resolve the
    // pipeline from a context with a DIFFERENT metaPrompts map (simulating a
    // real YAML edit that adds a dep/step). The re-resolved pipeline returns a
    // different getPipelineHash('global') value, which readEligible detects.
    const context = loadPipelineContext(tmpRoot)
    const output = createOutputContext('auto')
    const pipelineA = resolvePipeline(context, { output })
    const pathResolver = new StatePathResolver(tmpRoot)
    const sm = new StateManager(
      tmpRoot,
      pipelineA.computeEligible,
      () => context.config ?? undefined,
      pathResolver,
      pipelineA.globalSteps,
      pipelineA.getPipelineHash('global'),
    )
    sm.saveState(sm.loadState())  // cache stamped with pipelineA's hash

    // Build a new context whose metaPrompts differs from context.metaPrompts
    // by deleting one step — this changes the graph and therefore the hash.
    // Using .metaPrompts.delete() on a cloned map guarantees pipelineB's hash
    // differs without requiring actual YAML file edits.
    const firstSlug = [...context.metaPrompts.keys()][0]
    expect(firstSlug).toBeDefined()
    const mutatedMetaPrompts = new Map(context.metaPrompts)
    mutatedMetaPrompts.delete(firstSlug!)
    const mutatedContext = { ...context, metaPrompts: mutatedMetaPrompts }
    const pipelineB = resolvePipeline(mutatedContext, { output })
    expect(pipelineB.getPipelineHash('global')).not.toBe(pipelineA.getPipelineHash('global'))

    // readEligible against pipelineB must detect stale hash and fall back.
    const liveCalls: string[] = []
    const sentinelPipeline = {
      ...pipelineB,
      computeEligible: ((steps, opts) => {
        liveCalls.push('live-fired')
        return pipelineB.computeEligible(steps, opts)
      }) as typeof pipelineB.computeEligible,
    }
    readEligible(sm.loadState(), sentinelPipeline, undefined, undefined)
    expect(liveCalls).toContain('live-fired')
  })
})
```

**Note on `loadPipelineContext`:** This E2E relies on `loadPipelineContext(tmpRoot)` successfully resolving the package pipeline dir (via `getPackagePipelineDir` fallback), so the test inherits the real pipeline graph. If `loadPipelineContext` fails on an empty tmpRoot, seed a minimal `.scaffold/` marker directory or pre-populate a pipeline dir. Run Step 2 below first to surface any loader errors before fighting the test logic.

- [ ] **Step 2: Run the E2E tests**

```
npx vitest run src/e2e/eligible-cache.test.ts
```

Expected: PASS — 2 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/eligible-cache.test.ts
git commit -m "test(cache-v2): E2E — cross-file invalidation + pipeline-hash invalidation"
```

---

## Task 15: Final verification + cleanup

**Files:** none (verification only)

**Goal:** Confirm the feature is complete and all acceptance criteria pass.

- [ ] **Step 1: Run the full test suite**

```
npx vitest run
```

Expected: 2240+/2240+ pass.

- [ ] **Step 2: Run `make check-all`**

```
make check-all 2>&1 | tail -3
```

Expected: Exit 0.

- [ ] **Step 3: Confirm all acceptance criteria**

Verify each AC manually by reviewing:

- **AC1**: `scaffold next` cache-hit test at next.test.ts lines ~280+ (Task 8)
- **AC2**: E2E cross-file invalidation test at e2e/eligible-cache.test.ts (Task 14)
- **AC3**: E2E pipeline-hash invalidation test at e2e/eligible-cache.test.ts (Task 14)
- **AC4**: Hash-includes-order test at graph-hash.test.ts (Task 2)
- **AC5**: Service-scope JSON correctness at status.test.ts (Task 9) + service-mode saveState test at state-manager.test.ts (Task 6)
- **AC6**: Full suite green (Step 1 + 2)
- **AC7**: All 10+ call sites threaded — verify by running:

```
grep -l "new StateManager(" src/cli src/wizard
```

Each file in output should include `getPipelineHash` as the 6th positional arg. Spot-check a few:

```
grep -A7 "new StateManager(" src/cli/commands/run.ts src/cli/commands/adopt.ts src/wizard/wizard.ts
```

- [ ] **Step 4: Review diff summary against spec**

```
git diff main..HEAD --stat
```

Cross-check against the spec's "Modified production files" + "New production files" tables. List any unexpected touches.

- [ ] **Step 5: Final commit (if any cleanup needed)**

If any fixes were made during verification, commit them:

```bash
git add -u
git commit -m "chore(cache-v2): final verification + cleanup"
```

If no changes, skip.

---

## Final Checklist

- [ ] **Push + PR**

```bash
git push -u origin HEAD
gh pr create
```

- [ ] **Run mandatory 3-channel MMR review** per CLAUDE.md:

```
codex exec ...
NO_BROWSER=true gemini -p ...
claude -p ...
```

- [ ] **Fix all P0/P1/P2 findings**, iterate up to 3 rounds, merge when verdict is `pass` or `degraded-pass`.

- [ ] **Release v3.19.0** per `docs/architecture/operations-runbook.md`. Minor version bump (new state fields + fixes visible behavior change in `status --json` for multi-service projects).

---

## Self-Review Coverage Map

| Spec section | Task |
|--------------|------|
| §1 Root monotonic save counter | Tasks 1, 6 |
| §2 Pipeline-graph hash (with scope normalization) | Task 2 |
| §3 StateManager scope + TOCTOU-safe capture | Tasks 5, 6 |
| §4 readEligible() helper | Task 7 |
| §5 ResolvedPipeline.getPipelineHash(scope) | Task 4 |
| §6 Root-state counter reader | Task 3 |
| §7 All StateManager construction sites threaded | Tasks 8–12 |
| §8a next.ts readEligible integration | Task 8 |
| §8b status.ts interactive readEligible | Task 9 |
| §8c status.ts JSON readEligible (Round-2 P2 fix) | Task 9 |
| §Testing Strategy (~36 tests) | Tasks 2, 3, 4, 5, 6, 7, 8, 9, 14 |
| AC1 (cache-hit skips graph traversal) | Task 8 |
| AC2 (service scope correctness after root mutation) | Task 14 |
| AC3 (pipeline-YAML edit invalidation) | Task 14 |
| AC4 (hash includes order) | Task 2 |
| AC5 (status --json scope correctness) | Tasks 6, 9 |
| AC6 (full suite green) | Task 15 |
| AC7 (all 10 call sites threaded) | Tasks 8–12 + Task 15 verification |

No placeholders; all code blocks are concrete; all task sizes are small (15 tasks, mostly ≤6 steps each).
