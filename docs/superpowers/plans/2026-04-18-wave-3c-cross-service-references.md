# Wave 3c: Cross-Service References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable a step in one service to read artifacts produced by another service, with export allowlisting and transitive resolution.

**Architecture:** Add an `exports` allowlist to `ServiceConfig`, a `cross-reads` field to pipeline-step frontmatter, a new `src/core/assembly/cross-reads.ts` module containing the resolver + readiness helper, a read-only `StateManager.loadStateReadOnly()` method for safe foreign state access, and integration points in `run.ts`, `next.ts`, and `status.ts`. All 14 tasks touch ≤3 files each and use TDD (failing test first).

**Tech Stack:** TypeScript, Zod, vitest, Node.js `fs`.

**Spec:** `docs/superpowers/specs/2026-04-18-wave-3c-cross-service-references-design.md`

**Pre-flight:** Recommended to run in a dedicated worktree (`scripts/setup-agent-worktree.sh wave-3c`) so main stays clean. Each task ends with a commit — commit often.

---

## Task Map

| # | Title | Files touched | Key risk |
|---|-------|---------------|----------|
| 1 | `exports` field on `ServiceSchema` + `ServiceConfig` | 3 | — |
| 2 | Global-step refinement in `ProjectSchema.superRefine` | 2 | loadGlobalStepSlugs wiring |
| 3 | `crossReads` on `MetaPromptFrontmatter` + 4 parser touch-points | 3 | 4 separate edits in one file |
| 4 | `crossReads` field on `OverlayState` (default `{}`) | 2 | — |
| 5 | `crossDependencies` on `DependencyNode` + `buildGraph` population | 3 | — |
| 6 | `StateManager.loadStateReadOnly()` static method | 2 | **no-write assertion** |
| 7 | `resolveDirectCrossRead` in new `cross-reads.ts` | 2 | warning symmetry |
| 8 | `resolveTransitiveCrossReads` (DFS + memo + cache + Map dedup + tool guard) | 2 | cycle + aggregator cases |
| 9 | `resolveCrossReadReadiness` + `CrossReadStatus` types | 2 | 5-way status enum |
| 10 | Wire into `run.ts` artifact gathering | 2 | overlay-first lookup |
| 11 | Wire into `next.ts` (text + JSON) | 2 | JSON shape |
| 12 | Wire into `status.ts` (text + JSON) | 2 | JSON shape |
| 13 | E2E + concurrency tests | 1–2 | foreign-lock + tool-category |
| 14 | Roadmap + CHANGELOG update | 2 | — |

---

## Task 1: `exports` field on `ServiceSchema` + `ServiceConfig`

**Files:**
- Modify: `src/types/config.ts` (lines 112–129, `ServiceConfig` interface)
- Modify: `src/config/schema.ts` (lines 113–145, `ServiceSchema`)
- Test: `src/config/schema.test.ts`

**Goal:** Add the optional `exports: Array<{ step: string }>` field with kebab-case slug validation. Global-step rejection comes in Task 2.

- [ ] **Step 1: Write failing tests in `src/config/schema.test.ts`**

Append to the end of the existing `describe('ServiceSchema')` block:

```typescript
describe('exports field', () => {
  const validService = {
    name: 'shared-lib',
    projectType: 'library',
    libraryConfig: { visibility: 'internal' },
  }

  it('accepts a service with exports', () => {
    const result = ServiceSchema.safeParse({
      ...validService,
      exports: [{ step: 'api-contracts' }, { step: 'domain-modeling' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a service with no exports field (closed by default)', () => {
    const result = ServiceSchema.safeParse(validService)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.exports).toBeUndefined()
  })

  it('rejects exports with a malformed kebab-case step slug', () => {
    const result = ServiceSchema.safeParse({
      ...validService,
      exports: [{ step: 'Not_Kebab' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects exports with empty step string', () => {
    const result = ServiceSchema.safeParse({
      ...validService,
      exports: [{ step: '' }],
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/schema.test.ts -t "exports field"`
Expected: FAIL — `exports` field not validated / unknown on strict schema.

- [ ] **Step 3: Add `exports` to `ServiceConfig` interface in `src/types/config.ts`**

Replace line 128 (`// No \`exports\` field — Wave 3c.`) with:

```typescript
  /** Pipeline step slugs this service exposes for cross-service reference. Closed by default. */
  exports?: Array<{ step: string }>
```

- [ ] **Step 4: Add `exports` to `ServiceSchema` in `src/config/schema.ts`**

In `ServiceSchema` (around line 129, just before the closing `}).strict()`), add:

```typescript
  exports: z.array(
    z.object({ step: z.string().regex(/^[a-z][a-z0-9-]*$/, 'exports.step must be kebab-case') }),
  ).optional(),
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/config/schema.test.ts -t "exports field"`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Run full type-check + existing tests to catch regressions**

Run: `npx tsc --noEmit && npx vitest run src/config/schema.test.ts src/types/config.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config/schema.ts src/types/config.ts src/config/schema.test.ts
git commit -m "feat(wave-3c): add exports field to ServiceSchema/ServiceConfig"
```

---

## Task 2: Global-step refinement in `ProjectSchema.superRefine`

**Files:**
- Modify: `src/config/schema.ts` (add global-step check to existing `ProjectSchema.superRefine`)
- Test: `src/config/schema.test.ts`

**Goal:** Reject `exports` entries that name a global step (steps listed in `multi-service-overlay.yml`'s `stepOverrides` keys). Global steps live in root state and must not appear in per-service `exports`. Uses the existing `ctx.addIssue({ code: 'custom', ... })` pattern that other `ProjectSchema` refinements already use — no new error class needed, since config parse failures already route through the existing `InvalidConfigError` handler at the config-loader layer.

- [ ] **Step 1: Write failing test in `src/config/schema.test.ts`**

Append to the ServiceSchema `describe`:

```typescript
describe('exports global-step rejection (ProjectSchema superRefine)', () => {
  const GLOBAL_STEP = 'service-ownership-map'  // known global step from multi-service-overlay

  it('rejects a service that exports a global step', () => {
    const result = ProjectSchema.safeParse({
      services: [{
        name: 'api',
        projectType: 'backend',
        backendConfig: { apiStyle: 'rest' },
        exports: [{ step: GLOBAL_STEP }],
      }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message).join(' | ')
      expect(msgs).toMatch(/global step/i)
    }
  })

  it('accepts a service exporting a non-global step', () => {
    const result = ProjectSchema.safeParse({
      services: [{
        name: 'api',
        projectType: 'backend',
        backendConfig: { apiStyle: 'rest' },
        exports: [{ step: 'api-contracts' }],
      }],
    })
    expect(result.success).toBe(true)
  })
})
```

Note: this uses a hard-coded global step slug (`service-ownership-map`) that exists in `content/methodology/multi-service-overlay.yml` per Wave 2. If the overlay list is empty at parse time (e.g., missing file in a test sandbox), the refinement must no-op — verify by running test against real methodology dir.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/schema.test.ts -t "global-step rejection"`
Expected: FAIL — both tests (rejection test passes, assertion fails; acceptance test fails because overlay not integrated yet).

- [ ] **Step 3: Add refinement to `ProjectSchema` in `src/config/schema.ts`**

Add imports near the top (after `import { z } from 'zod'`):

```typescript
import { loadGlobalStepSlugs } from '../core/pipeline/global-steps.js'
import { getPackageMethodologyDir } from '../utils/fs.js'
```

(The import path `../utils/fs.js` is confirmed by `src/state/ensure-v3-migration.ts:32`. If `getPackageMethodologyDir` is ever moved, grep the codebase for the canonical location.)

In the `ProjectSchema.superRefine` (around lines 163–184), add after the unique-service-names check:

```typescript
    // Reject global steps in service exports (Wave 3c)
    if (data.services) {
      try {
        const globalSteps = loadGlobalStepSlugs(getPackageMethodologyDir())
        for (let i = 0; i < data.services.length; i++) {
          const svc = data.services[i]
          for (let j = 0; j < (svc.exports ?? []).length; j++) {
            const exp = svc.exports![j]
            if (globalSteps.has(exp.step)) {
              ctx.addIssue({
                path: ['services', i, 'exports', j, 'step'],
                code: 'custom',
                message: `Service '${svc.name}' cannot export global step '${exp.step}' (global steps live in root state)`,
              })
            }
          }
        }
      } catch {
        // If the multi-service overlay can't be loaded (e.g., in sandboxed tests), skip the check.
        // Defense-in-depth happens at runtime in cross-reads.ts Section 3.3.
      }
    }
```

- [ ] **Step 4: Run tests to verify pass + full check**

Run: `npx vitest run src/config/schema.test.ts -t "global-step rejection" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts src/config/schema.test.ts
git commit -m "feat(wave-3c): reject global steps in service exports (ProjectSchema refinement)"
```

---

## Task 3: `crossReads` on `MetaPromptFrontmatter` + 4 parser touch-points

**Files:**
- Modify: `src/types/frontmatter.ts` (add `crossReads` to `MetaPromptFrontmatter` interface)
- Modify: `src/project/frontmatter.ts` (4 touch-points: KNOWN_YAML_KEYS, normalizeRawObject, frontmatterSchema, emptyFrontmatter)
- Test: `src/project/frontmatter.test.ts`

**Goal:** Parse `cross-reads:` YAML → `crossReads: Array<{service, step}>` with slug validation. No warning for the kebab key.

- [ ] **Step 1: Write failing tests in `src/project/frontmatter.test.ts`**

Append to the existing test file:

```typescript
describe('cross-reads frontmatter field (Wave 3c)', () => {
  const tempDir = path.resolve(__dirname, '__cross_reads_tmp__')
  beforeEach(() => fs.mkdirSync(tempDir, { recursive: true }))
  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const write = (name: string, content: string) => {
    const p = path.join(tempDir, name)
    fs.writeFileSync(p, content)
    return p
  }

  it('parses cross-reads into crossReads camelCase', () => {
    const p = write('step.md', `---
name: system-architecture
description: System architecture design
phase: architecture
order: 700
outputs: [docs/architecture.md]
cross-reads:
  - service: shared-lib
    step: api-contracts
  - service: trading-engine
    step: domain-modeling
---
Body.`)
    const result = parseAndValidate(p)
    expect(result.errors).toEqual([])
    expect(result.frontmatter.crossReads).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },
      { service: 'trading-engine', step: 'domain-modeling' },
    ])
  })

  it('defaults crossReads to empty array when absent', () => {
    const p = write('step.md', `---
name: some-step
description: desc
phase: architecture
order: 701
outputs: [docs/x.md]
---
Body.`)
    const result = parseAndValidate(p)
    expect(result.errors).toEqual([])
    expect(result.frontmatter.crossReads).toEqual([])
  })

  it('does not emit unknown-field warning for cross-reads', () => {
    const p = write('step.md', `---
name: some-step
description: desc
phase: architecture
order: 702
outputs: [docs/x.md]
cross-reads:
  - service: lib
    step: api-contracts
---
Body.`)
    const result = parseAndValidate(p)
    const unknownWarnings = result.warnings.filter(w => w.code === 'FRONTMATTER_UNKNOWN_FIELD')
    expect(unknownWarnings).toEqual([])
  })

  it('rejects malformed service slug in cross-reads', () => {
    const p = write('step.md', `---
name: some-step
description: desc
phase: architecture
order: 703
outputs: [docs/x.md]
cross-reads:
  - service: Bad_Service
    step: api-contracts
---
Body.`)
    const result = parseAndValidate(p)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
```

(If `fs`, `path`, `beforeEach`, `afterEach` aren't already imported at the top of the test file, add them. Check for `parseAndValidate` import too.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/project/frontmatter.test.ts -t "cross-reads frontmatter"`
Expected: FAIL — crossReads missing / unknown field warning emitted.

- [ ] **Step 3: Add `crossReads` to `MetaPromptFrontmatter` in `src/types/frontmatter.ts`**

In the `MetaPromptFrontmatter` interface (between `reads` at line 122 and `stateless` at line 124), add. **Optional** so existing typed fixtures continue to compile — Zod's `.default([])` in Step 6 ensures parsed output always has it populated:

```typescript
  /** Cross-service artifact references — each entry points at a foreign service:step pair. */
  crossReads?: Array<{ service: string; step: string }>
```

- [ ] **Step 4: Add `'cross-reads'` to `KNOWN_YAML_KEYS` in `src/project/frontmatter.ts`**

In the `KNOWN_YAML_KEYS` set (line 18), add after `'reads'`:

```typescript
  'cross-reads',
```

- [ ] **Step 5: Add `cross-reads` → `crossReads` normalization in `normalizeRawObject`**

In `normalizeRawObject` (around line 145), after the `depends-on` handling block, add:

```typescript
  // cross-reads → crossReads (Wave 3c)
  if ('cross-reads' in normalized) {
    normalized['crossReads'] = normalized['cross-reads']
    delete normalized['cross-reads']
  }
```

- [ ] **Step 6: Add `crossReads` to `frontmatterSchema`**

In the Zod `frontmatterSchema` object (around lines 41–53), add after `reads`:

```typescript
  crossReads: z.array(
    z.object({
      service: z.string().regex(/^[a-z][a-z0-9-]*$/, 'cross-reads.service must be kebab-case'),
      step: z.string().regex(/^[a-z][a-z0-9-]*$/, 'cross-reads.step must be kebab-case'),
    }),
  ).default([]),
```

- [ ] **Step 7: `emptyFrontmatter` fallback unchanged**

Since `crossReads` is optional on the interface, no change needed to `emptyFrontmatter`. Parsed output will have `crossReads: []` via the Zod default.

- [ ] **Step 8: Run tests to verify pass**

Run: `npx vitest run src/project/frontmatter.test.ts -t "cross-reads frontmatter"`
Expected: PASS — all 4 tests green.

- [ ] **Step 9: Run full frontmatter test suite to catch regressions**

Run: `npx vitest run src/project/frontmatter.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types/frontmatter.ts src/project/frontmatter.ts src/project/frontmatter.test.ts
git commit -m "feat(wave-3c): parse cross-reads frontmatter field into crossReads"
```

---

## Task 4: `crossReads` field on `OverlayState` (default `{}`)

**Files:**
- Modify: `src/core/assembly/overlay-state-resolver.ts` (add field + threading)
- Test: `src/core/assembly/overlay-state-resolver.test.ts`

**Goal:** Thread `crossReads: Record<string, Array<{service,step}>>` through `OverlayState` with default `{}`, following the same pattern as `knowledge`/`reads`/`dependencies`. No overlay-level override support yet (Wave 3c only writes through the seam).

- [ ] **Step 1: Write failing test in `src/core/assembly/overlay-state-resolver.test.ts`**

Append to the existing test file:

```typescript
describe('crossReads on OverlayState (Wave 3c)', () => {
  it('populates crossReads from meta-prompt frontmatter', () => {
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['system-architecture', {
        frontmatter: {
          name: 'system-architecture',
          description: '',
          summary: null,
          phase: 'architecture',
          order: 700,
          dependencies: [],
          outputs: ['docs/architecture.md'],
          conditional: null,
          knowledgeBase: [],
          reads: [],
          crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
          stateless: false,
          category: 'pipeline',
        },
      }],
    ])
    const result = resolveOverlayState({
      config: { version: 2, methodology: 'deep', platforms: ['claude-code'] } as ScaffoldConfig,
      methodologyDir: '/nonexistent',  // no overlay file — default path
      metaPrompts,
      presetSteps: {},
      output: { warn: () => {}, info: () => {}, success: () => {}, result: () => {} } as OutputContext,
    })
    expect(result.crossReads['system-architecture']).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },
    ])
  })

  it('defaults to empty object when no step has crossReads', () => {
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>()
    const result = resolveOverlayState({
      config: { version: 2, methodology: 'deep', platforms: ['claude-code'] } as ScaffoldConfig,
      methodologyDir: '/nonexistent',
      metaPrompts,
      presetSteps: {},
      output: { warn: () => {}, info: () => {}, success: () => {}, result: () => {} } as OutputContext,
    })
    expect(result.crossReads).toEqual({})
  })
})
```

(Add imports at top if missing: `MetaPromptFrontmatter`, `ScaffoldConfig`, `OutputContext`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts -t "crossReads on OverlayState"`
Expected: FAIL — `result.crossReads` is undefined.

- [ ] **Step 3: Add `crossReads` to `OverlayState` interface (optional)**

In `src/core/assembly/overlay-state-resolver.ts` (line 9), add after `dependencies` line. **Optional** so the fallback in `src/core/pipeline/resolver.ts:89` (`overlay = { steps, knowledge, reads, dependencies }`) and the hoisted `resolveOverlayState` mocks in `run.test.ts`, `next.test.ts`, `status.test.ts` continue to compile unchanged:

```typescript
export interface OverlayState {
  steps: Record<string, StepEnablementEntry>
  knowledge: Record<string, string[]>
  reads: Record<string, string[]>
  dependencies: Record<string, string[]>
  /** Wave 3c — populated from frontmatter.crossReads; overlay-level overrides are post-release. */
  crossReads?: Record<string, Array<{ service: string; step: string }>>
}
```

All call sites read via `overlay.crossReads?.[step] ?? ...`, so `undefined` is handled.

- [ ] **Step 4: Populate `crossReads` map in `resolveOverlayState`**

In the map-building loop (around lines 33–40), add:

```typescript
  const crossReadsMap: Record<string, Array<{ service: string; step: string }>> = {}
  for (const [name, mp] of metaPrompts) {
    knowledgeMap[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
    readsMap[name] = [...(mp.frontmatter.reads ?? [])]
    dependencyMap[name] = [...(mp.frontmatter.dependencies ?? [])]
    if (mp.frontmatter.crossReads?.length) {
      crossReadsMap[name] = [...mp.frontmatter.crossReads]
    }
  }
```

Then update the return value (around line 158) to include `crossReads: crossReadsMap`:

```typescript
  return {
    steps: overlaySteps,
    knowledge: overlayKnowledge,
    reads: overlayReads,
    dependencies: overlayDependencies,
    crossReads: crossReadsMap,
  }
```

(Overlay-level crossReads overrides are Wave 3c's "Out of Scope" — the map is written only from frontmatter for now.)

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts`
Expected: PASS.

- [ ] **Step 6: Run tsc + adjacent tests**

Run: `npx tsc --noEmit && npx vitest run src/core/assembly/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/assembly/overlay-state-resolver.ts src/core/assembly/overlay-state-resolver.test.ts
git commit -m "feat(wave-3c): thread crossReads through OverlayState (default {})"
```

---

## Task 5: `crossDependencies` on `DependencyNode` + `buildGraph` population

**Files:**
- Modify: `src/types/dependency.ts` (add field to `DependencyNode`)
- Modify: `src/core/dependency/graph.ts` (populate from frontmatter)
- Test: `src/core/dependency/graph.test.ts` (create if missing — check first)

**Goal:** Add optional `crossDependencies?: Array<{service, step}>` to `DependencyNode` and populate it in `buildGraph()` from each meta-prompt's `crossReads` frontmatter.

- [ ] **Step 1: Check whether `graph.test.ts` exists**

Run: `ls src/core/dependency/graph.test.ts 2>/dev/null || echo "NOT FOUND"`

If it says NOT FOUND, create a minimal test file header at that path with the standard imports. Otherwise just append to it.

- [ ] **Step 2: Write failing tests in `src/core/dependency/graph.test.ts`**

Append (or create with this content):

```typescript
import { describe, it, expect } from 'vitest'
import { buildGraph } from './graph.js'
import type { MetaPromptFrontmatter } from '../../types/index.js'

function mkMeta(name: string, overrides: Partial<MetaPromptFrontmatter> = {}): MetaPromptFrontmatter {
  return {
    name, description: '', summary: null,
    phase: 'architecture', order: 700,
    dependencies: [], outputs: ['docs/x.md'],
    conditional: null, knowledgeBase: [], reads: [], crossReads: [],
    stateless: false, category: 'pipeline',
    ...overrides,
  } as MetaPromptFrontmatter
}

describe('buildGraph crossDependencies (Wave 3c)', () => {
  it('populates crossDependencies when frontmatter has crossReads', () => {
    const metas = [mkMeta('system-architecture', {
      crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
    })]
    const graph = buildGraph(metas, new Map())
    const node = graph.nodes.get('system-architecture')
    expect(node?.crossDependencies).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },
    ])
  })

  it('leaves crossDependencies undefined when frontmatter has no crossReads', () => {
    const metas = [mkMeta('some-step')]
    const graph = buildGraph(metas, new Map())
    const node = graph.nodes.get('some-step')
    expect(node?.crossDependencies).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/core/dependency/graph.test.ts -t "crossDependencies"`
Expected: FAIL — `crossDependencies` not populated.

- [ ] **Step 4: Add `crossDependencies` to `DependencyNode` in `src/types/dependency.ts`**

Replace file contents with:

```typescript
export interface DependencyNode {
  slug: string
  phase: string | null
  order: number | null
  dependencies: string[]
  /** Cross-service dependency edges (informational, non-blocking). Populated from frontmatter.crossReads. */
  crossDependencies?: Array<{ service: string; step: string }>
  enabled: boolean
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>
  edges: Map<string, string[]>
}
```

- [ ] **Step 5: Populate `crossDependencies` in `buildGraph`**

In `src/core/dependency/graph.ts` (inside the `for (const mp of metaPrompts)` loop, around lines 19–34), update the `nodes.set(...)` call to include `crossDependencies` when present:

```typescript
    const deps = dependencyMap?.[mp.name] ?? mp.dependencies
    const enabled = presetSteps.get(mp.name)?.enabled ?? true
    const crossDeps = mp.crossReads && mp.crossReads.length > 0
      ? [...mp.crossReads]
      : undefined
    nodes.set(mp.name, {
      slug: mp.name,
      phase: mp.phase,
      order: mp.order,
      dependencies: deps,
      ...(crossDeps ? { crossDependencies: crossDeps } : {}),
      enabled,
    })
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run src/core/dependency/graph.test.ts -t "crossDependencies"`
Expected: PASS.

- [ ] **Step 7: Run full dependency tests + tsc**

Run: `npx vitest run src/core/dependency/ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/types/dependency.ts src/core/dependency/graph.ts src/core/dependency/graph.test.ts
git commit -m "feat(wave-3c): populate crossDependencies on DependencyNode from frontmatter"
```

---

## Task 6: `StateManager.loadStateReadOnly()` static method

**Files:**
- Modify: `src/state/state-manager.ts` (add static method after existing class methods)
- Test: `src/state/state-manager.test.ts`

**Goal:** Add a true read-only state loader that applies migrations in memory only and **never** writes. Fixes the P0 from the spec's Round-4 review.

**Critical invariant:** `loadStateReadOnly` must NOT call `saveState`, must NOT recompute `next_eligible`, and must NOT hold any locks. The test must assert the file mtime does not change even when `migrateState` returns `true`.

- [ ] **Step 1: Write failing test in `src/state/state-manager.test.ts`**

Append:

```typescript
describe('StateManager.loadStateReadOnly (Wave 3c)', () => {
  it('applies migrateState in memory but does NOT write to disk', () => {
    const tmpRoot = path.join(os.tmpdir(), `scaffold-readonly-${Date.now()}`)
    fs.mkdirSync(path.join(tmpRoot, '.scaffold'), { recursive: true })
    const statePath = path.join(tmpRoot, '.scaffold', 'state.json')
    // Write a v2 state containing a deprecated step name that migrateState will rename
    const preMigrationState = {
      'schema-version': 3,
      steps: {
        'testing-strategy': { status: 'completed', source: 'pipeline', produces: ['docs/tdd.md'] },
      },
      next_eligible: ['keep-this'],  // must remain after read-only load
      in_progress: null,
    }
    fs.writeFileSync(statePath, JSON.stringify(preMigrationState))
    // Backdate the file by 2s so any subsequent write would produce a detectably newer mtime,
    // avoiding flaky ms-precision collisions on coarse filesystem timestamps.
    const backdated = new Date(Date.now() - 2000)
    fs.utimesSync(statePath, backdated, backdated)
    const originalMtime = fs.statSync(statePath).mtimeMs

    const resolver = new StatePathResolver(tmpRoot)
    const state = StateManager.loadStateReadOnly(tmpRoot, resolver)

    // Step rename applied in memory
    expect(state.steps['tdd']).toBeDefined()
    expect(state.steps['testing-strategy']).toBeUndefined()
    // next_eligible preserved (not clobbered by computeEligible sentinel)
    expect(state.next_eligible).toEqual(['keep-this'])
    // File NOT written (mtime unchanged — give it a small sleep to rule out same-ms race)
    const currentMtime = fs.statSync(statePath).mtimeMs
    expect(currentMtime).toBe(originalMtime)

    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('merges global state as read-only base when pathResolver is service-scoped', () => {
    const tmpRoot = path.join(os.tmpdir(), `scaffold-readonly-merge-${Date.now()}`)
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 3,
      steps: { 'project-overview': { status: 'completed', source: 'pipeline', produces: ['docs/vision.md'] } },
      next_eligible: [], in_progress: null,
    }))
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'), JSON.stringify({
      'schema-version': 3,
      steps: { 'api-contracts': { status: 'completed', source: 'pipeline', produces: ['docs/api.md'] } },
      next_eligible: [], in_progress: null,
    }))

    const resolver = new StatePathResolver(tmpRoot, 'api')
    const state = StateManager.loadStateReadOnly(tmpRoot, resolver)
    expect(state.steps['project-overview']).toBeDefined()  // from global
    expect(state.steps['api-contracts']).toBeDefined()     // from service
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('throws stateMissing when file does not exist', () => {
    const resolver = new StatePathResolver('/tmp/nonexistent-scaffold-readonly')
    expect(() => StateManager.loadStateReadOnly('/tmp/nonexistent-scaffold-readonly', resolver)).toThrow()
  })
})
```

(Add imports at top if missing: `os`, `path`, `fs`, `StateManager`, `StatePathResolver`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/state-manager.test.ts -t "loadStateReadOnly"`
Expected: FAIL — method does not exist.

- [ ] **Step 3: Implement `loadStateReadOnly` static method on `StateManager`**

In `src/state/state-manager.ts`, after the class's existing methods (before the closing `}` of the class), add:

```typescript
  /**
   * Load state WITHOUT side effects — no saveState, no next_eligible recompute, no lock.
   * Applies dispatchStateMigration + migrateState in memory only. Use ONLY for
   * read-only inspection of foreign state (cross-reads, readiness display).
   * The returned PipelineState is a detached snapshot — mutating it does not persist.
   */
  static loadStateReadOnly(
    projectRoot: string,
    pathResolver: StatePathResolver,
    configProvider?: () => { project?: { services?: unknown[] } } | undefined,
  ): PipelineState {
    const statePath = pathResolver.statePath
    if (!fileExists(statePath)) throw stateMissing(statePath)

    const raw = fs.readFileSync(statePath, 'utf8')
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch (err) {
      throw stateParseError(statePath, (err as Error).message)
    }

    const config = configProvider?.()
    const ctx = { hasServices: (config?.project?.services?.length ?? 0) > 0 }
    dispatchStateMigration(parsed, ctx, statePath)

    const state = parsed as unknown as PipelineState
    migrateState(state)  // in-memory only; deliberately does NOT call saveState

    if (pathResolver.isServiceScoped) {
      const globalStatePath = path.join(pathResolver.rootScaffoldDir, 'state.json')
      if (fs.existsSync(globalStatePath)) {
        const globalRaw = fs.readFileSync(globalStatePath, 'utf8')
        const globalParsed = JSON.parse(globalRaw) as Record<string, unknown>
        const globalState = globalParsed as unknown as PipelineState
        state.steps = { ...globalState.steps, ...state.steps }
      }
    }

    return state
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/state/state-manager.test.ts -t "loadStateReadOnly"`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Run full state test suite + tsc**

Run: `npx vitest run src/state/ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/state-manager.ts src/state/state-manager.test.ts
git commit -m "feat(wave-3c): add StateManager.loadStateReadOnly (no-write foreign state path)"
```

---

## Task 7: `resolveDirectCrossRead` in new `cross-reads.ts`

**Files:**
- Create: `src/core/assembly/cross-reads.ts`
- Create: `src/core/assembly/cross-reads.test.ts`

**Goal:** Implement the direct cross-read resolver with warning symmetry (emit `ARTIFACT_PATH_REJECTED`), the per-service foreign-state cache, and the runtime global-step guard (defense-in-depth per spec §2.3 — complements the parse-time rejection in Task 2). Returns `{ completed, artifacts }` so transitive callers can recurse through aggregator steps.

- [ ] **Step 1: Write failing tests in `src/core/assembly/cross-reads.test.ts`**

Create the file:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveDirectCrossRead } from './cross-reads.js'
import type { ScaffoldConfig, PipelineState } from '../../types/index.js'
import type { OutputContext } from '../../cli/output/context.js'

function mkOutput(): { warnings: string[]; output: OutputContext } {
  const warnings: string[] = []
  const output = {
    warn: (w: unknown) => {
      if (typeof w === 'string') warnings.push(w)
      else if (w && typeof w === 'object' && 'message' in w) warnings.push(String((w as { message: string }).message))
    },
    info: () => {}, success: () => {}, result: () => {},
  } as unknown as OutputContext
  return { warnings, output }
}

function mkConfig(exports: Array<{ step: string }> | undefined): ScaffoldConfig {
  return {
    version: 2, methodology: 'deep', platforms: ['claude-code'],
    project: {
      services: [{
        name: 'shared-lib', projectType: 'library',
        libraryConfig: { visibility: 'internal' },
        ...(exports ? { exports } : {}),
      }],
    },
  } as ScaffoldConfig
}

describe('resolveDirectCrossRead', () => {
  let tmpRoot: string
  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `scaffold-cross-reads-${Date.now()}-${Math.random()}`)
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'shared-lib'), { recursive: true })
  })
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  function seedForeign(steps: Record<string, { status: string; produces?: string[] }>) {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'shared-lib', 'state.json'),
      JSON.stringify({ 'schema-version': 3, steps, next_eligible: [], in_progress: null }),
    )
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'state.json'),
      JSON.stringify({ 'schema-version': 3, steps: {}, next_eligible: [], in_progress: null }),
    )
  }

  it('happy path: returns completed + artifacts for an exported + completed step', () => {
    fs.mkdirSync(path.join(tmpRoot, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'api.md'), 'API content')
    seedForeign({ 'api-contracts': { status: 'completed', produces: ['docs/api.md'] } })

    const { output } = mkOutput()
    const cache = new Map<string, PipelineState | null>()
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' },
      mkConfig([{ step: 'api-contracts' }]),
      tmpRoot, output, cache,
    )
    expect(result.completed).toBe(true)
    expect(result.artifacts).toEqual([
      { stepName: 'shared-lib:api-contracts', filePath: 'docs/api.md', content: 'API content' },
    ])
  })

  it('warns + returns { completed: false, artifacts: [] } when step not in exports', () => {
    seedForeign({ 'api-contracts': { status: 'completed', produces: [] } })
    const { warnings, output } = mkOutput()
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' },
      mkConfig([]),  // empty exports — not allowlisted
      tmpRoot, output, new Map(),
    )
    expect(result).toEqual({ completed: false, artifacts: [] })
    expect(warnings.some(w => /not exported/i.test(w))).toBe(true)
  })

  it('warns when service not in config', () => {
    const { warnings, output } = mkOutput()
    const result = resolveDirectCrossRead(
      { service: 'unknown-service', step: 'whatever' },
      mkConfig([{ step: 'whatever' }]),  // exports list is for shared-lib, not unknown-service
      tmpRoot, output, new Map(),
    )
    expect(result).toEqual({ completed: false, artifacts: [] })
    expect(warnings.some(w => /not found/i.test(w))).toBe(true)
  })

  it('warns when foreign state file is missing', () => {
    // Don't call seedForeign — no state.json exists
    const { warnings, output } = mkOutput()
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' },
      mkConfig([{ step: 'api-contracts' }]),
      tmpRoot, output, new Map(),
    )
    expect(result).toEqual({ completed: false, artifacts: [] })
    expect(warnings.some(w => /not bootstrapped/i.test(w))).toBe(true)
  })

  it('returns { completed: true, artifacts: [] } when step completed but produces is empty', () => {
    seedForeign({ 'aggregator': { status: 'completed', produces: [] } })
    const { output } = mkOutput()
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'aggregator' },
      mkConfig([{ step: 'aggregator' }]),
      tmpRoot, output, new Map(),
    )
    expect(result.completed).toBe(true)
    expect(result.artifacts).toEqual([])
  })

  it('emits ARTIFACT_PATH_REJECTED warning when produces entry escapes project root', () => {
    seedForeign({ 'api-contracts': { status: 'completed', produces: ['../../../etc/passwd'] } })
    const { warnings, output } = mkOutput()
    resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' },
      mkConfig([{ step: 'api-contracts' }]),
      tmpRoot, output, new Map(),
    )
    expect(warnings.some(w => /ARTIFACT_PATH_REJECTED/.test(w))).toBe(true)
  })

  it('caches foreign state after first load', () => {
    seedForeign({ 'api-contracts': { status: 'completed', produces: [] } })
    const cache = new Map<string, PipelineState | null>()
    const { output } = mkOutput()
    const cfg = mkConfig([{ step: 'api-contracts' }])
    resolveDirectCrossRead({ service: 'shared-lib', step: 'api-contracts' }, cfg, tmpRoot, output, cache)
    expect(cache.has('shared-lib')).toBe(true)
    // Second call — delete state.json, cached result should still work
    fs.unlinkSync(path.join(tmpRoot, '.scaffold', 'services', 'shared-lib', 'state.json'))
    const second = resolveDirectCrossRead({ service: 'shared-lib', step: 'api-contracts' }, cfg, tmpRoot, output, cache)
    expect(second.completed).toBe(true)  // served from cache, not disk
  })

  it('warns + skips when cr.step is a global step (runtime defense-in-depth)', () => {
    // Parse-time refinement in Task 2 rejects this config, but runtime guard
    // must still skip if global-step exports sneak through a malformed config.
    seedForeign({ 'service-ownership-map': { status: 'completed', produces: [] } })
    const { warnings, output } = mkOutput()
    const globalSteps = new Set(['service-ownership-map'])
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'service-ownership-map' },
      mkConfig([{ step: 'service-ownership-map' }]),
      tmpRoot, output, new Map(), globalSteps,
    )
    expect(result).toEqual({ completed: false, artifacts: [] })
    expect(warnings.some(w => /global step/i.test(w))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Create `src/core/assembly/cross-reads.ts`**

```typescript
import fs from 'node:fs'
import type { ScaffoldConfig, PipelineState, ArtifactEntry } from '../../types/index.js'
import type { OutputContext } from '../../cli/output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { resolveContainedArtifactPath } from '../../utils/artifact-path.js'

/**
 * Resolve a single cross-read against a foreign service's state, with allowlist
 * check, per-service state cache, path containment, and warning symmetry with
 * the existing `reads` loop in run.ts.
 *
 * Returns { completed, artifacts } so transitive callers can gate recursion on
 * step completion rather than artifact count (aggregator steps may produce no
 * artifacts of their own but still have valid transitive cross-reads).
 */
export function resolveDirectCrossRead(
  cr: { service: string; step: string },
  config: ScaffoldConfig,
  projectRoot: string,
  output: OutputContext,
  foreignStateCache: Map<string, PipelineState | null>,
  globalSteps?: Set<string>,
): { completed: boolean; artifacts: ArtifactEntry[] } {
  // 1. Defense-in-depth: skip if cr.step is a global step (parse-time refinement
  //    should have rejected this already, but guard at runtime per spec §2.3).
  if (globalSteps && globalSteps.has(cr.step)) {
    output.warn(`cross-reads: '${cr.step}' is a global step and cannot be cross-read`)
    return { completed: false, artifacts: [] }
  }

  // 2. Validate service exists in config
  const serviceEntry = config.project?.services?.find(s => s.name === cr.service)
  if (!serviceEntry) {
    output.warn(`cross-reads: service '${cr.service}' not found`)
    return { completed: false, artifacts: [] }
  }

  // 3. Check exports allowlist (closed by default; global-step rejection happens at parse time)
  if (!serviceEntry.exports?.some(e => e.step === cr.step)) {
    output.warn(`cross-reads: '${cr.step}' not exported by '${cr.service}'`)
    return { completed: false, artifacts: [] }
  }

  // 4. Load foreign service state via read-only loader, cached per service
  let foreignState = foreignStateCache.get(cr.service)
  if (foreignState === undefined) {
    const foreignResolver = new StatePathResolver(projectRoot, cr.service)
    if (!fs.existsSync(foreignResolver.statePath)) {
      output.warn(`cross-reads: service '${cr.service}' not bootstrapped`)
      foreignStateCache.set(cr.service, null)
      return { completed: false, artifacts: [] }
    }
    try {
      foreignState = StateManager.loadStateReadOnly(projectRoot, foreignResolver)
      foreignStateCache.set(cr.service, foreignState)
    } catch {
      output.warn(`cross-reads: failed to load state for '${cr.service}'`)
      foreignStateCache.set(cr.service, null)
      return { completed: false, artifacts: [] }
    }
  }
  if (!foreignState) return { completed: false, artifacts: [] }

  // 5. Check step is completed
  const stepEntry = foreignState.steps?.[cr.step]
  if (!stepEntry || stepEntry.status !== 'completed') {
    return { completed: false, artifacts: [] }
  }

  // 6. Resolve artifacts with containment check + warning symmetry (matches run.ts reads loop)
  const artifacts: ArtifactEntry[] = []
  for (const relPath of stepEntry.produces ?? []) {
    const fullPath = resolveContainedArtifactPath(projectRoot, relPath)
    if (fullPath === null) {
      output.warn({
        code: 'ARTIFACT_PATH_REJECTED',
        message:
          `Cross-read artifact '${relPath}' from '${cr.service}:${cr.step}' `
          + 'resolves outside project root — skipping',
      })
      continue
    }
    if (!fs.existsSync(fullPath)) continue
    try {
      artifacts.push({
        stepName: `${cr.service}:${cr.step}`,
        filePath: relPath,
        content: fs.readFileSync(fullPath, 'utf8'),
      })
    } catch (err) {
      output.warn({
        code: 'ARTIFACT_READ_ERROR',
        message:
          `Could not read cross-read artifact '${relPath}' from `
          + `'${cr.service}:${cr.step}': ${(err as Error).message}`,
      })
    }
  }
  return { completed: true, artifacts }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Run tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/assembly/cross-reads.ts src/core/assembly/cross-reads.test.ts
git commit -m "feat(wave-3c): implement resolveDirectCrossRead with read-only foreign state"
```

---

## Task 8: `resolveTransitiveCrossReads` (DFS + memo + cache + Map dedup + tool guard)

**Files:**
- Modify: `src/core/assembly/cross-reads.ts` (append function)
- Modify: `src/core/assembly/cross-reads.test.ts` (append tests)

**Goal:** Implement the transitive resolver with DFS cycle detection (`visiting` set), per-`service:step` memoization (`resolved` map caching FULL closure), per-`filePath` dedup inside the traversal (`Map<filePath, entry>`), and a guard that skips `category: 'tool'` meta during transitive lookup.

- [ ] **Step 1: Extend imports + helpers at the top of `src/core/assembly/cross-reads.test.ts`**

Add to the existing import block at the **top** of the file (not appended mid-file):

```typescript
import { resolveTransitiveCrossReads } from './cross-reads.js'
import type { MetaPromptFile } from '../../types/index.js'
```

Then **append** the helper + describe block at the end of the file:

```typescript
function mkMetaFile(name: string, crossReads: Array<{ service: string; step: string }> = [], category: 'pipeline' | 'tool' = 'pipeline'): MetaPromptFile {
  return {
    stepName: name, filePath: `/fake/${name}.md`,
    frontmatter: {
      name, description: '', summary: null,
      phase: 'architecture', order: 700,
      dependencies: [], outputs: [], conditional: null,
      knowledgeBase: [], reads: [], crossReads,
      stateless: false, category,
    },
    body: '', sections: {},
  } as MetaPromptFile
}

describe('resolveTransitiveCrossReads', () => {
  let tmpRoot: string
  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `scaffold-transitive-${Date.now()}-${Math.random()}`)
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'b'), { recursive: true })
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'c'), { recursive: true })
    fs.mkdirSync(path.join(tmpRoot, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 3, steps: {}, next_eligible: [], in_progress: null,
    }))
  })
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  function seedService(name: string, steps: Record<string, { status: string; produces?: string[] }>) {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', name, 'state.json'),
      JSON.stringify({ 'schema-version': 3, steps, next_eligible: [], in_progress: null }),
    )
  }

  function mkMultiConfig(exports: Record<string, string[]>): ScaffoldConfig {
    return {
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        services: Object.entries(exports).map(([name, stepNames]) => ({
          name, projectType: 'library',
          libraryConfig: { visibility: 'internal' },
          exports: stepNames.map(s => ({ step: s })),
        })),
      },
    } as ScaffoldConfig
  }

  it('resolves transitive chain A → B (B step has crossReads to C)', () => {
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B content')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C content')
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step', [{ service: 'c', step: 'c-step' }])],
      ['c-step', mkMetaFile('c-step')],
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      mkMultiConfig({ b: ['b-step'], c: ['c-step'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    const paths = artifacts.map(a => a.filePath).sort()
    expect(paths).toEqual(['docs/b.md', 'docs/c.md'])
  })

  it('stops at cycle (A → B → A)', () => {
    seedService('b', { 'b-step': { status: 'completed', produces: [] } })
    const metas = new Map<string, MetaPromptFile>([
      ['a-step', mkMetaFile('a-step', [{ service: 'b', step: 'b-step' }])],
      ['b-step', mkMetaFile('b-step', [{ service: 'b', step: 'b-step' }])],  // self-cycle for simplicity
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      mkMultiConfig({ b: ['b-step'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    expect(artifacts).toEqual([])  // no infinite loop; cycle skipped
  })

  it('memoizes full closure (reuses cached direct + transitive)', () => {
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    const metas = new Map<string, MetaPromptFile>([['c-step', mkMetaFile('c-step')]])
    const { output } = mkOutput()
    const resolved = new Map<string, ArtifactEntry[]>()
    resolveTransitiveCrossReads(
      [{ service: 'c', step: 'c-step' }],
      mkMultiConfig({ c: ['c-step'] }),
      tmpRoot, metas, output, new Set(), resolved, new Map(),
    )
    expect(resolved.has('c:c-step')).toBe(true)
    expect(resolved.get('c:c-step')).toHaveLength(1)
  })

  it('recurses through completed step with empty produces (aggregator)', () => {
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
    seedService('b', { 'b-agg': { status: 'completed', produces: [] } })  // aggregator
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    const metas = new Map<string, MetaPromptFile>([
      ['b-agg', mkMetaFile('b-agg', [{ service: 'c', step: 'c-step' }])],
      ['c-step', mkMetaFile('c-step')],
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-agg' }],
      mkMultiConfig({ b: ['b-agg'], c: ['c-step'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    expect(artifacts.map(a => a.filePath)).toEqual(['docs/c.md'])  // transitive reached
  })

  it('skips transitive lookup when foreign meta is category: tool', () => {
    seedService('c', { 'c-tool': { status: 'completed', produces: [] } })
    const metas = new Map<string, MetaPromptFile>([
      ['c-tool', mkMetaFile('c-tool', [{ service: 'x', step: 'x-step' }], 'tool')],
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'c', step: 'c-tool' }],
      mkMultiConfig({ c: ['c-tool'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    expect(artifacts).toEqual([])  // tool's crossReads ignored
  })

  it('dedupes diamond deps via filePath Map inside traversal', () => {
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'shared.md'), 'SHARED')
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/shared.md'] } })
    const metas = new Map<string, MetaPromptFile>([['b-step', mkMetaFile('b-step')]])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [
        { service: 'b', step: 'b-step' },
        { service: 'b', step: 'b-step' },  // duplicate cross-read to same service:step
      ],
      mkMultiConfig({ b: ['b-step'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    const paths = artifacts.map(a => a.filePath)
    expect(paths.filter(p => p === 'docs/shared.md')).toHaveLength(1)  // deduped
  })
})
```

(Add any missing imports: `MetaPromptFile`, `ArtifactEntry`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts -t "resolveTransitiveCrossReads"`
Expected: FAIL — function does not exist.

- [ ] **Step 3: Append `resolveTransitiveCrossReads` to `src/core/assembly/cross-reads.ts`**

First, add `MetaPromptFile` to the existing import block at the top of `cross-reads.ts` (extend the existing `import type { ... } from '../../types/index.js'` line to include it). Then append the function at the end of the file:

```typescript
/**
 * DFS-driven transitive cross-reads resolver with:
 * - cycle detection via `visiting` set (gray nodes),
 * - memoization via `resolved` map (black nodes) caching the FULL closure per service:step,
 * - per-service foreign-state cache via `foreignStateCache`,
 * - per-traversal dedup via a local `Map<filePath, entry>`,
 * - skips foreign meta of category: 'tool' for transitive lookup.
 *
 * Gates transitive recursion on `direct.completed` (not artifact count) so
 * aggregator steps with empty `produces` still participate in the chain.
 */
export function resolveTransitiveCrossReads(
  crossReads: Array<{ service: string; step: string }>,
  config: ScaffoldConfig,
  projectRoot: string,
  metaPrompts: Map<string, MetaPromptFile>,
  output: OutputContext,
  visiting: Set<string>,
  resolved: Map<string, ArtifactEntry[]>,
  foreignStateCache: Map<string, PipelineState | null>,
  globalSteps?: Set<string>,
): ArtifactEntry[] {
  const closure = new Map<string, ArtifactEntry>()  // filePath → entry (dedup inside traversal)
  for (const cr of crossReads) {
    const key = `${cr.service}:${cr.step}`
    if (visiting.has(key)) continue  // cycle — skip silently
    if (resolved.has(key)) {
      for (const a of resolved.get(key)!) closure.set(a.filePath, a)
      continue
    }
    visiting.add(key)

    const direct = resolveDirectCrossRead(cr, config, projectRoot, output, foreignStateCache, globalSteps)

    let transitive: ArtifactEntry[] = []
    if (direct.completed) {
      const foreignMeta = metaPrompts.get(cr.step)
      const isTool = foreignMeta?.frontmatter.category === 'tool'
      if (!isTool && foreignMeta?.frontmatter.crossReads?.length) {
        transitive = resolveTransitiveCrossReads(
          foreignMeta.frontmatter.crossReads,
          config, projectRoot, metaPrompts, output,
          visiting, resolved, foreignStateCache, globalSteps,
        )
      }
    }

    const fullClosure: ArtifactEntry[] = [...direct.artifacts, ...transitive]
    for (const a of fullClosure) closure.set(a.filePath, a)

    visiting.delete(key)
    resolved.set(key, fullClosure)  // cache FULL closure (direct + transitive)
  }
  return [...closure.values()]
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts -t "resolveTransitiveCrossReads"`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Run full cross-reads test suite + tsc**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/assembly/cross-reads.ts src/core/assembly/cross-reads.test.ts
git commit -m "feat(wave-3c): transitive cross-reads resolver with DFS, memo, cache, dedup, tool guard"
```

---

## Task 9: `resolveCrossReadReadiness` + `CrossReadStatus` types

**Files:**
- Modify: `src/core/assembly/cross-reads.ts` (append)
- Modify: `src/core/assembly/cross-reads.test.ts` (append)

**Goal:** A shared helper that both `next` and `status` use for cross-dep readiness display. Returns one of 5 statuses per cross-read entry. Uses the same read-only loader + per-service cache as the resolver.

- [ ] **Step 1: Extend imports + write failing tests in `src/core/assembly/cross-reads.test.ts`**

Add to the existing import block at the **top** of the file:

```typescript
import { resolveCrossReadReadiness } from './cross-reads.js'
```

Then **append** the describe block at the end of the file:

```typescript
describe('resolveCrossReadReadiness', () => {
  let tmpRoot: string
  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `scaffold-readiness-${Date.now()}-${Math.random()}`)
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 3, steps: {}, next_eligible: [], in_progress: null,
    }))
  })
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  const cfg = (exports: Array<{ step: string }>): ScaffoldConfig => ({
    version: 2, methodology: 'deep', platforms: ['claude-code'],
    project: {
      services: [{
        name: 'api', projectType: 'backend',
        backendConfig: { apiStyle: 'rest' },
        exports,
      }],
    },
  }) as ScaffoldConfig

  it('returns service-unknown for missing service', () => {
    const r = resolveCrossReadReadiness(
      [{ service: 'ghost', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('service-unknown')
  })

  it('returns not-exported when step not in exports', () => {
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'secret' }],
      cfg([]),
      tmpRoot,
    )
    expect(r[0].status).toBe('not-exported')
  })

  it('returns not-bootstrapped when foreign state file missing', () => {
    // services/api exists but no state.json inside
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('not-bootstrapped')
  })

  it('returns completed when foreign step completed', () => {
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'), JSON.stringify({
      'schema-version': 3,
      steps: { 'x': { status: 'completed', source: 'pipeline', produces: [] } },
      next_eligible: [], in_progress: null,
    }))
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('completed')
  })

  it('returns pending when foreign step not completed', () => {
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'), JSON.stringify({
      'schema-version': 3,
      steps: { 'x': { status: 'in_progress', source: 'pipeline', produces: [] } },
      next_eligible: [], in_progress: null,
    }))
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('pending')
  })

  it('returns empty array when given no cross-reads', () => {
    expect(resolveCrossReadReadiness([], cfg([]), tmpRoot)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts -t "resolveCrossReadReadiness"`
Expected: FAIL — function does not exist.

- [ ] **Step 3: Append types + helper to `src/core/assembly/cross-reads.ts`**

```typescript
export type CrossReadStatus =
  | 'completed'         // foreign step completed
  | 'pending'           // foreign step exists in state but not completed
  | 'not-bootstrapped'  // foreign service has no state.json
  | 'service-unknown'   // foreign service not in config
  | 'not-exported'      // step not in foreign service's exports allowlist

export interface CrossReadReadiness {
  service: string
  step: string
  status: CrossReadStatus
}

/**
 * Compute readiness status for a list of cross-reads. Shared by `next --service`
 * and `status --service` so both commands surface identical diagnostics.
 * Uses a per-call Map cache to avoid re-reading the same foreign state file.
 */
export function resolveCrossReadReadiness(
  crossReads: Array<{ service: string; step: string }>,
  config: ScaffoldConfig,
  projectRoot: string,
): CrossReadReadiness[] {
  const cache = new Map<string, PipelineState | null>()
  return crossReads.map(cr => {
    const serviceEntry = config.project?.services?.find(s => s.name === cr.service)
    if (!serviceEntry) return { ...cr, status: 'service-unknown' as const }
    if (!serviceEntry.exports?.some(e => e.step === cr.step)) return { ...cr, status: 'not-exported' as const }

    let state = cache.get(cr.service)
    if (state === undefined) {
      const resolver = new StatePathResolver(projectRoot, cr.service)
      if (!fs.existsSync(resolver.statePath)) {
        cache.set(cr.service, null)
        return { ...cr, status: 'not-bootstrapped' as const }
      }
      try {
        state = StateManager.loadStateReadOnly(projectRoot, resolver)
        cache.set(cr.service, state)
      } catch {
        cache.set(cr.service, null)
        return { ...cr, status: 'not-bootstrapped' as const }
      }
    }
    if (!state) return { ...cr, status: 'not-bootstrapped' as const }

    const entry = state.steps?.[cr.step]
    return { ...cr, status: entry?.status === 'completed' ? ('completed' as const) : ('pending' as const) }
  })
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts -t "resolveCrossReadReadiness"`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Run tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/assembly/cross-reads.ts src/core/assembly/cross-reads.test.ts
git commit -m "feat(wave-3c): resolveCrossReadReadiness + CrossReadStatus type for next/status"
```

---

## Task 10: Wire cross-reads into `run.ts` artifact gathering

**Files:**
- Modify: `src/cli/commands/run.ts` (add loop after existing `reads` loop, around line 434)
- Modify: `src/cli/commands/run.test.ts`

**Goal:** After the existing `reads` loop in `run.ts`, invoke `resolveTransitiveCrossReads` with an overlay-first lookup (`pipeline.overlay.crossReads[step] ?? metaPrompt.frontmatter.crossReads ?? []`) and dedup against the shared `gatheredPaths` Set.

- [ ] **Step 1: Extend the hoisted `cross-reads.js` mock in `src/cli/commands/run.test.ts`**

Near the top of the file (in the existing `vi.mock(...)` block), add:

```typescript
vi.mock('../../core/assembly/cross-reads.js', () => ({
  resolveTransitiveCrossReads: vi.fn(() => []),
}))
```

Then add to the import-after-mocks section:

```typescript
import { resolveTransitiveCrossReads } from '../../core/assembly/cross-reads.js'
```

This mocks the helper at the module boundary. Unit-level correctness of the helper is already covered by Tasks 7–8.

- [ ] **Step 2: Write failing integration test in `src/cli/commands/run.test.ts`**

Append a new `describe('cross-reads artifact gathering (Wave 3c)', ...)` block. Use the same mock patterns already established in the existing `describe('reads artifact gathering', ...)` test at `src/cli/commands/run.test.ts:1145+` — that's the best template. Concrete test:

```typescript
describe('cross-reads artifact gathering (Wave 3c)', () => {
  it('passes frontmatter crossReads to resolveTransitiveCrossReads and includes returned artifacts', async () => {
    const consumerMeta = makeMetaPrompt({
      stepName: 'system-architecture',
      frontmatter: makeFrontmatter({
        name: 'system-architecture',
        phase: 'architecture', order: 700,
        dependencies: [], outputs: ['docs/arch.md'],
        crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
      }),
    })
    const map = new Map([['system-architecture', consumerMeta]])
    vi.mocked(discoverMetaPrompts).mockReturnValue(map)
    vi.mocked(discoverAllMetaPrompts).mockReturnValue(map)
    vi.mocked(StateManager.prototype.loadState).mockReturnValue(makeState({
      'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
    }))
    vi.mocked(buildGraph).mockReturnValue({
      nodes: new Map([['system-architecture', {
        slug: 'system-architecture', phase: 'architecture', order: 700,
        dependencies: [], enabled: true,
      }]]),
      edges: new Map([['system-architecture', []]]),
    })
    // Stub the helper to return one artifact — run.ts must surface it to AssemblyEngine.
    vi.mocked(resolveTransitiveCrossReads).mockReturnValue([
      { stepName: 'shared-lib:api-contracts', filePath: 'docs/api.md', content: 'API CONTENT' },
    ])
    vi.mocked(resolveOutputMode).mockReturnValue('auto')

    await invokeHandler({ step: 'system-architecture', _: ['run'], auto: true })

    // Verify the helper was called with the step's crossReads and run.ts context.
    expect(vi.mocked(resolveTransitiveCrossReads)).toHaveBeenCalledWith(
      [{ service: 'shared-lib', step: 'api-contracts' }],
      expect.anything(), // config
      expect.any(String), // projectRoot
      expect.any(Map),    // metaPrompts
      expect.anything(),  // output
      expect.any(Set),    // visiting
      expect.any(Map),    // resolved
      expect.any(Map),    // foreignStateCache
    )
    // Verify the returned artifact landed in the AssemblyEngine input.
    // (Reuse the existing AssemblyEngine mock — look for the pattern already used in
    //  the "reads artifact gathering" describe block to capture `assemble()`'s input.)
  })
})
```

If `makeMetaPrompt`, `makeFrontmatter`, `makeState`, `invokeHandler`, and the AssemblyEngine mock aren't obviously named, run `grep -n 'function makeMetaPrompt\|function makeFrontmatter\|function invokeHandler\|AssemblyEngine' src/cli/commands/run.test.ts` to locate the real helpers and adapt the above to match.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/run.test.ts -t "Wave 3c"`
Expected: FAIL — cross-read artifacts not gathered.

- [ ] **Step 4: Add cross-reads imports at the top of `src/cli/commands/run.ts`**

Add:

```typescript
import { resolveTransitiveCrossReads } from '../../core/assembly/cross-reads.js'
import type { PipelineState } from '../../types/index.js'
```

- [ ] **Step 5: Add the cross-reads loop after the existing `reads` loop**

In `src/cli/commands/run.ts`, immediately after the closing `}` of the `reads` loop (around line 434, just before the "Read decisions log" block at line 436), add:

```typescript
            // Gather artifacts from cross-reads (Wave 3c — foreign service artifacts)
            const crossReadsList =
              pipeline.overlay.crossReads?.[step] ?? metaPrompt.frontmatter.crossReads ?? []
            if (crossReadsList.length > 0) {
              const foreignStateCache = new Map<string, PipelineState | null>()
              const crossArtifacts = resolveTransitiveCrossReads(
                crossReadsList,
                config,
                projectRoot,
                context.metaPrompts,
                output,
                new Set(),
                new Map(),
                foreignStateCache,
                pipeline.globalSteps,  // defense-in-depth guard
              )
              for (const a of crossArtifacts) {
                if (!gatheredPaths.has(a.filePath)) {
                  gatheredPaths.add(a.filePath)
                  artifacts.push(a)
                }
              }
            }
```

- [ ] **Step 6: Run test to verify pass**

Run: `npx vitest run src/cli/commands/run.test.ts -t "Wave 3c"`
Expected: PASS.

- [ ] **Step 7: Run full run-test suite + tsc**

Run: `npx vitest run src/cli/commands/run.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/cli/commands/run.ts src/cli/commands/run.test.ts
git commit -m "feat(wave-3c): wire cross-reads artifact gathering into run.ts"
```

---

## Task 11: Wire cross-dep readiness into `next.ts` (text + JSON)

**Files:**
- Modify: `src/cli/commands/next.ts` (add readiness block to handler)
- Modify: `src/cli/commands/next.test.ts`

**Goal:** After computing `eligible`, for each shown step look up its frontmatter `crossReads`, call `resolveCrossReadReadiness`, and surface readiness in both text and JSON output. JSON gains a `crossDependencies` array on each eligible entry per Section 3.6 of the spec.

- [ ] **Step 1: Extend the hoisted mocks in `src/cli/commands/next.test.ts`**

The existing harness (read `src/cli/commands/next.test.ts:1-80` first to confirm) mocks `StateManager`, `loadConfig`, `resolveOverlayState`, `buildGraph`, `computeEligible`, `discoverMetaPrompts`. It intercepts `process.stdout.write` into a `writtenLines` array. Add a new hoisted mock at the top of the file (before the `import` section), mocking the cross-reads helper:

```typescript
vi.mock('../../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(() => []),
}))
```

And add to the imports-after-mocks section:

```typescript
import { resolveCrossReadReadiness } from '../../core/assembly/cross-reads.js'
```

- [ ] **Step 2: Write failing tests in `src/cli/commands/next.test.ts`**

Append a new describe block that matches the file's existing JSON/text-output test patterns. The tests program `resolveCrossReadReadiness` to return fixed readiness entries and assert they appear in the output. Concrete tests:

```typescript
describe('next --service cross-dep readiness (Wave 3c)', () => {
  it('JSON output includes crossDependencies on eligible steps', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    // Make 'system-architecture' the only eligible step
    vi.mocked(computeEligible).mockReturnValue(['system-architecture'])
    // stepMeta lookup — return frontmatter with crossReads for the eligible step
    const frontmatter = {
      name: 'system-architecture', description: 'Arch',
      phase: 'architecture', order: 700,
      summary: null, dependencies: [], outputs: ['docs/arch.md'],
      conditional: null, knowledgeBase: [], reads: [],
      crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
      stateless: false, category: 'pipeline' as const,
    }
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['system-architecture', { stepName: 'system-architecture', filePath: '/fake', frontmatter, body: '', sections: {} }],
    ]))
    vi.mocked(resolveCrossReadReadiness).mockReturnValue([
      { service: 'shared-lib', step: 'api-contracts', status: 'completed' },
    ])

    await nextCommand.handler(defaultArgv({ service: 'api' }) as NextArgv)

    const json = JSON.parse(writtenLines.join(''))
    expect(json.eligible[0].crossDependencies).toEqual([
      { service: 'shared-lib', step: 'api-contracts', status: 'completed' },
    ])
    expect(vi.mocked(resolveCrossReadReadiness)).toHaveBeenCalledWith(
      [{ service: 'shared-lib', step: 'api-contracts' }],
      expect.anything(),
      expect.any(String),
    )
  })

  it('text output annotates eligible steps with cross-dep readiness', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    vi.mocked(computeEligible).mockReturnValue(['system-architecture'])
    const frontmatter = {
      name: 'system-architecture', description: 'Arch',
      phase: 'architecture', order: 700,
      summary: null, dependencies: [], outputs: ['docs/arch.md'],
      conditional: null, knowledgeBase: [], reads: [],
      crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
      stateless: false, category: 'pipeline' as const,
    }
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['system-architecture', { stepName: 'system-architecture', filePath: '/fake', frontmatter, body: '', sections: {} }],
    ]))
    vi.mocked(resolveCrossReadReadiness).mockReturnValue([
      { service: 'shared-lib', step: 'api-contracts', status: 'completed' },
    ])

    await nextCommand.handler(defaultArgv({ service: 'api' }) as NextArgv)

    const out = writtenLines.join('')
    expect(out).toMatch(/cross-reads shared-lib:api-contracts \(completed\)/)
  })
})
```

(If the existing `next.test.ts` uses `defaultArgv` / `NextArgv` / `mockResolveOutputMode` / `mockDiscoverMetaPrompts` names, match them. Verify by reading the first 100 lines of the file before writing the test.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/cli/commands/next.test.ts -t "Wave 3c"`
Expected: FAIL.

- [ ] **Step 4: Add cross-reads import to `src/cli/commands/next.ts`**

At the top:

```typescript
import { resolveCrossReadReadiness } from '../../core/assembly/cross-reads.js'
```

- [ ] **Step 5: Compute cross-dep readiness per shown step**

After line 93 (`const shown = eligible.slice(0, count)`), add:

```typescript
    // Wave 3c — compute cross-dep readiness for each shown step
    const crossDepMap = new Map<string, ReturnType<typeof resolveCrossReadReadiness>>()
    for (const slug of shown) {
      const crossReads =
        pipeline.overlay.crossReads?.[slug] ?? pipeline.stepMeta.get(slug)?.crossReads ?? []
      if (crossReads.length > 0 && context.config) {
        crossDepMap.set(slug, resolveCrossReadReadiness(crossReads, context.config, projectRoot))
      }
    }
```

- [ ] **Step 6: Update JSON output to include `crossDependencies`**

Replace the existing JSON `eligible` map (around lines 103–111) with:

```typescript
      output.result({
        eligible: shown.map(s => {
          const fm = pipeline.stepMeta.get(s)
          const cd = crossDepMap.get(s)
          return {
            slug: s,
            description: fm?.description ?? '',
            summary: fm?.summary ?? null,
            command: `scaffold run ${s}`,
            ...(cd && cd.length > 0 ? { crossDependencies: cd } : {}),
          }
        }),
        blocked_steps: [],
        pipeline_complete: allDone,
      })
```

- [ ] **Step 7: Update text output to surface readiness**

Inside the `else` block that prints eligible steps (around lines 121–127), replace with:

```typescript
        output.info(`Next eligible steps (${shown.length}):`)
        for (const slug of shown) {
          const fm = pipeline.stepMeta.get(slug)
          const desc = fm?.summary ?? fm?.description ?? ''
          output.info(`  scaffold run ${slug}  — ${desc}`)
          const cd = crossDepMap.get(slug)
          if (cd?.length) {
            for (const entry of cd) {
              output.info(`    cross-reads ${entry.service}:${entry.step} (${entry.status})`)
            }
          }
        }
```

- [ ] **Step 8: Run tests to verify pass**

Run: `npx vitest run src/cli/commands/next.test.ts -t "Wave 3c"`
Expected: PASS.

- [ ] **Step 9: Run full next tests + tsc**

Run: `npx vitest run src/cli/commands/next.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/cli/commands/next.ts src/cli/commands/next.test.ts
git commit -m "feat(wave-3c): surface cross-dep readiness in next (text + JSON)"
```

---

## Task 12: Wire cross-dep readiness into `status.ts` (text + JSON)

**Files:**
- Modify: `src/cli/commands/status.ts`
- Modify: `src/cli/commands/status.test.ts`

**Goal:** Same pattern as Task 11 but for `status`. Compute readiness for each **actionable** step (pending / in-progress) with cross-reads, surface in text and JSON.

- [ ] **Step 1: Extend the hoisted mocks in `src/cli/commands/status.test.ts`**

Mirror Task 11 Step 1. Read `src/cli/commands/status.test.ts:1-60` first to confirm the local mock style. Add:

```typescript
vi.mock('../../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(() => []),
}))
```

And add the import:

```typescript
import { resolveCrossReadReadiness } from '../../core/assembly/cross-reads.js'
```

- [ ] **Step 2: Write failing tests in `src/cli/commands/status.test.ts`**

Append a describe block that matches the existing JSON / text output test style. Concrete tests:

```typescript
describe('status --service cross-dep readiness (Wave 3c)', () => {
  it('JSON output includes crossDependencies on actionable steps', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const frontmatter = {
      name: 'system-architecture', description: '', summary: null,
      phase: 'architecture', order: 700,
      dependencies: [], outputs: ['docs/arch.md'],
      conditional: null, knowledgeBase: [], reads: [],
      crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
      stateless: false, category: 'pipeline' as const,
    }
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['system-architecture', { stepName: 'system-architecture', filePath: '/fake', frontmatter, body: '', sections: {} }],
    ]))
    mockStateWith(MockStateManager, {
      'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
    })
    vi.mocked(resolveCrossReadReadiness).mockReturnValue([
      { service: 'shared-lib', step: 'api-contracts', status: 'pending' },
    ])

    await statusCommand.handler(defaultArgv({ service: 'api' }))

    const json = JSON.parse(writtenLines.join(''))
    const archStep = json.phases
      .flatMap((p: { steps: Array<{ slug: string; crossDependencies?: unknown }> }) => p.steps)
      .find((s: { slug: string }) => s.slug === 'system-architecture')
    expect(archStep.crossDependencies).toEqual([
      { service: 'shared-lib', step: 'api-contracts', status: 'pending' },
    ])
  })

  it('text output annotates actionable steps with cross-dep readiness', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    const frontmatter = {
      name: 'system-architecture', description: '', summary: null,
      phase: 'architecture', order: 700,
      dependencies: [], outputs: ['docs/arch.md'],
      conditional: null, knowledgeBase: [], reads: [],
      crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
      stateless: false, category: 'pipeline' as const,
    }
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['system-architecture', { stepName: 'system-architecture', filePath: '/fake', frontmatter, body: '', sections: {} }],
    ]))
    mockStateWith(MockStateManager, {
      'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
    })
    vi.mocked(resolveCrossReadReadiness).mockReturnValue([
      { service: 'shared-lib', step: 'api-contracts', status: 'pending' },
    ])

    await statusCommand.handler(defaultArgv({ service: 'api' }))

    const out = writtenLines.join('')
    expect(out).toMatch(/cross-reads shared-lib:api-contracts \(pending\)/)
  })
})
```

Helper names (`MockStateManager`, `mockStateWith`, `defaultArgv`, `writtenLines`, `mockResolveOutputMode`, `mockDiscoverMetaPrompts`, `statusCommand`) should already exist in `status.test.ts` — verify by reading the file's first 150 lines, adjust names if different.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/cli/commands/status.test.ts -t "Wave 3c"`
Expected: FAIL.

- [ ] **Step 4: Add import + readiness computation**

In `src/cli/commands/status.ts`, add at the top:

```typescript
import { resolveCrossReadReadiness } from '../../core/assembly/cross-reads.js'
```

After the stepValues counting block (around line 152), add:

```typescript
    // Wave 3c — compute cross-dep readiness for actionable steps with crossReads
    const actionable = new Set(['pending', 'in_progress'])
    const crossDepMap = new Map<string, ReturnType<typeof resolveCrossReadReadiness>>()
    for (const [slug, entry] of Object.entries(steps)) {
      if (!actionable.has(entry.status)) continue
      const crossReads =
        pipeline.overlay.crossReads?.[slug] ?? pipeline.stepMeta.get(slug)?.crossReads ?? []
      if (crossReads.length > 0 && context.config) {
        crossDepMap.set(slug, resolveCrossReadReadiness(crossReads, context.config, projectRoot))
      }
    }
```

- [ ] **Step 5: Surface readiness in JSON**

In the JSON output block (around lines 188–203), inside the `result` object, enrich the `phases` array. Find each `phaseSteps` mapping (line 167) and attach `crossDependencies` where present. Replace the `phasesData.map(...)` chunk inside `const phasesData` so each phase's step entries include optional `crossDependencies`:

```typescript
    const phasesData = PHASES.map(phaseInfo => {
      const phaseSteps = [...context.metaPrompts.values()]
        .filter(m => m.frontmatter.phase === phaseInfo.slug)
        .map(m => {
          const entry = steps[m.frontmatter.name]
          const cd = crossDepMap.get(m.frontmatter.name)
          return {
            slug: m.frontmatter.name,
            status: entry?.status ?? 'pending',
            ...(cd && cd.length > 0 ? { crossDependencies: cd } : {}),
          }
        })
      // ... rest unchanged
```

- [ ] **Step 6: Surface readiness in text**

In the text-output loop (around line 219 `for (const [slug, entry] of Object.entries(steps))`), after the existing step-output line, add:

```typescript
        const cd = crossDepMap.get(slug)
        if (cd?.length) {
          for (const entry of cd) {
            output.info(`      cross-reads ${entry.service}:${entry.step} (${entry.status})`)
          }
        }
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npx vitest run src/cli/commands/status.test.ts -t "Wave 3c"`
Expected: PASS.

- [ ] **Step 8: Run full status tests + tsc**

Run: `npx vitest run src/cli/commands/status.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/cli/commands/status.ts src/cli/commands/status.test.ts
git commit -m "feat(wave-3c): surface cross-dep readiness in status (text + JSON)"
```

---

## Task 13: E2E + concurrency tests

**Files:**
- Create: `src/e2e/cross-service-references.test.ts`

**Goal:** Two integration coverage gaps remain after unit tests:
1. End-to-end: a full `scaffold run --service consumer consume-step` invocation reads a foreign artifact.
2. Concurrency: cross-read succeeds while a foreign service's lock is held by another in-progress run, and produces no writes to foreign state.

- [ ] **Step 1: Create `src/e2e/cross-service-references.test.ts` following `src/e2e/service-execution.test.ts` conventions**

The existing e2e at `src/e2e/service-execution.test.ts:1-116` uses hoisted `vi.mock` + `vi.importActual` for real meta-prompts, `loadAllPresets` for preset steps, and `makeMultiServiceConfig()` helpers. Follow that structure. Concrete file:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Hoisted mocks — minimal set; we want real meta-prompts, real overlay, real cross-reads
vi.mock('../project/detector.js', () => ({
  detectProjectMode: vi.fn(() => ({ mode: 'greenfield', signals: [], methodologySuggestion: 'deep', sourceFileCount: 0 })),
}))

import { resolvePipeline } from '../core/pipeline/resolver.js'
import { resolveTransitiveCrossReads } from '../core/assembly/cross-reads.js'
import { StateManager } from '../state/state-manager.js'
import { StatePathResolver } from '../state/state-path-resolver.js'
import { loadPipelineContext } from '../core/pipeline/context.js'
import type { PipelineState, ScaffoldConfig } from '../types/index.js'

// ----- Fixture helpers --------------------------------------------------------

function writeState(filePath: string, steps: Record<string, { status: string; produces?: string[] }>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify({
    'schema-version': 3, steps, next_eligible: [], in_progress: null,
  }))
}

describe('Cross-service references E2E (Wave 3c)', () => {
  let projectRoot: string
  const producerStepName = 'domain-modeling'  // a real step from content/pipeline

  beforeEach(() => {
    projectRoot = path.join(os.tmpdir(), `scaffold-e2e-cross-${Date.now()}-${Math.random()}`)
    fs.mkdirSync(path.join(projectRoot, '.scaffold'), { recursive: true })
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true })
    // Write config.yml with two services, producer exports a real step
    fs.writeFileSync(path.join(projectRoot, '.scaffold', 'config.yml'),
      `version: 2\nmethodology: deep\nplatforms: [claude-code]\nproject:\n  services:\n` +
      `    - name: producer\n      projectType: library\n      libraryConfig: { visibility: internal }\n` +
      `      exports:\n        - step: ${producerStepName}\n` +
      `    - name: consumer\n      projectType: backend\n      backendConfig: { apiStyle: rest }\n`,
    )
    // Seed global state (empty, schema v3)
    writeState(path.join(projectRoot, '.scaffold', 'state.json'), {})
    // Seed producer state: step completed + produces an artifact
    writeState(
      path.join(projectRoot, '.scaffold', 'services', 'producer', 'state.json'),
      { [producerStepName]: { status: 'completed', produces: ['docs/contracts.md'] } },
    )
    fs.writeFileSync(path.join(projectRoot, 'docs', 'contracts.md'), 'INTER-SERVICE CONTRACTS')
    // Seed empty consumer state
    writeState(
      path.join(projectRoot, '.scaffold', 'services', 'consumer', 'state.json'),
      {},
    )
  })
  afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }))

  it('resolveTransitiveCrossReads returns foreign artifact when consumer step declares cross-read', async () => {
    const context = loadPipelineContext(projectRoot)
    const { output } = { output: { warn: vi.fn(), info: vi.fn(), success: vi.fn(), result: vi.fn() } as any }

    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'producer', step: producerStepName }],
      context.config as ScaffoldConfig,
      projectRoot,
      context.metaPrompts,
      output,
      new Set(), new Map(), new Map<string, PipelineState | null>(),
    )
    expect(artifacts).toEqual([
      expect.objectContaining({
        stepName: `producer:${producerStepName}`,
        filePath: 'docs/contracts.md',
        content: 'INTER-SERVICE CONTRACTS',
      }),
    ])
  })

  it('cross-read does NOT write to producer state file, even if migrateState applies', async () => {
    // Regression test for the Round-4 P0: read-only loader must never persist.
    const producerStatePath = path.join(projectRoot, '.scaffold', 'services', 'producer', 'state.json')
    // Intentionally poke a stale name ("testing-strategy") into the producer state so migrateState rewrites it.
    writeState(producerStatePath, {
      [producerStepName]: { status: 'completed', produces: ['docs/contracts.md'] },
      'testing-strategy': { status: 'completed', produces: ['docs/tdd.md'] },  // will be renamed to 'tdd'
    })
    const mtimeBefore = fs.statSync(producerStatePath).mtimeMs

    const context = loadPipelineContext(projectRoot)
    const { output } = { output: { warn: vi.fn(), info: vi.fn(), success: vi.fn(), result: vi.fn() } as any }
    resolveTransitiveCrossReads(
      [{ service: 'producer', step: producerStepName }],
      context.config as ScaffoldConfig,
      projectRoot,
      context.metaPrompts,
      output,
      new Set(), new Map(), new Map<string, PipelineState | null>(),
    )
    const mtimeAfter = fs.statSync(producerStatePath).mtimeMs
    expect(mtimeAfter).toBe(mtimeBefore)  // file NOT written
  })

  it('cross-read succeeds even when producer service has an active in-progress lock', async () => {
    // Simulate a lock file at the producer service's lock path (LockManager path convention).
    const lockDir = path.join(projectRoot, '.scaffold', 'services', 'producer')
    const lockPath = path.join(lockDir, 'lock.json')
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 999999, step: producerStepName, acquired: new Date().toISOString(),
    }))
    const mtimeBefore = fs.statSync(path.join(lockDir, 'state.json')).mtimeMs

    const context = loadPipelineContext(projectRoot)
    const { output } = { output: { warn: vi.fn(), info: vi.fn(), success: vi.fn(), result: vi.fn() } as any }
    // Must complete without hanging on the lock — read-only loader does not acquire any lock.
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'producer', step: producerStepName }],
      context.config as ScaffoldConfig,
      projectRoot,
      context.metaPrompts,
      output,
      new Set(), new Map(), new Map<string, PipelineState | null>(),
    )
    expect(artifacts.length).toBeGreaterThan(0)
    // Still no write.
    expect(fs.statSync(path.join(lockDir, 'state.json')).mtimeMs).toBe(mtimeBefore)
  })
})
```

Notes for the implementer:
- `domain-modeling` is a real service-local pipeline step (`content/pipeline/modeling/domain-modeling.md`) that is **not** listed in `multi-service-overlay.yml`'s `stepOverrides`, so exporting it from a service is valid per Task 2's refinement.
- The seeded `produces: ['docs/contracts.md']` above is a test-only value — it does not have to match the step's real `outputs` in `content/pipeline/`. The cross-read resolver reads `state.json`'s `produces` field, not the frontmatter's `outputs`. Any relative path under `projectRoot` works for the fixture.
- If adding a fourth test that invokes `runCommand.handler` directly for a full CLI-level E2E, the existing Wave 3b e2e tests in `src/e2e/service-execution.test.ts` are the nearest template; however, the module-mocked test in Task 10 already covers the CLI wiring path, so that CLI-level test is optional here.

- [ ] **Step 2: Run tests (they will fail on the unseeded fixtures initially — iterate until they pass)**

Run: `npx vitest run src/e2e/cross-service-references.test.ts`
Expected: PASS after fixture setup is complete.

- [ ] **Step 3: Run full e2e suite + tsc**

Run: `npx vitest run src/e2e/ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/e2e/cross-service-references.test.ts
git commit -m "test(wave-3c): E2E + concurrency coverage for cross-service references"
```

---

## Task 14: Roadmap + CHANGELOG update

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `CHANGELOG.md`

**Goal:** Mark Wave 3c as merged + land CHANGELOG entry for v3.17.0.

- [ ] **Step 1: Update `docs/roadmap.md`**

Replace the "Wave 3c" section under "Unreleased (targeting v3.17.0)" — update the header to "Wave 3c: Cross-Service References (merged — PR #<number>)", move it under "Completed Releases → v3.17.0", and delete the "To complete v3.17.0" block.

Exact text depends on the PR number (fill in during PR creation). The structural change:

```markdown
### v3.17.0 (<DATE>)

- **Wave 1: Domain Knowledge** (PR #277) — backend fintech sub-overlay, 8 knowledge docs
- **Wave 3a: Service Manifest** (PR #278) — ServiceSchema, `--from`, guards
- **Wave 2: Cross-Service Pipeline** (PR #279) — PipelineOverlay, 5 cross-service steps, multi-service-overlay
- **Wave 3b: Service-Qualified Execution** (PR #280) — per-service state, `--service` flag, v2→v3 migration
- **Wave 3c: Cross-Service References** (PR #<this>) — `exports` allowlist, `cross-reads` frontmatter, `StateManager.loadStateReadOnly`, `resolveCrossReadReadiness`, full warning + JSON output wiring
```

Also update the roadmap to confirm the "Overlay `crossReads` Overrides" post-release item remains intact (it's now wired through `OverlayState.crossReads` so implementation is a ~50-line extension).

- [ ] **Step 2: Add CHANGELOG entry**

Prepend to `CHANGELOG.md` under a new `## [Unreleased]` or `## [3.17.0] - <DATE>` heading:

```markdown
## [3.17.0] - <DATE>

### Added
- **Wave 3c: Cross-Service References** — services can expose an `exports` allowlist and pipeline steps can declare `cross-reads` frontmatter pointing to foreign service artifacts. `run --service <id>` gathers those artifacts during assembly, with transitive resolution (DFS + memoization + cycle detection) and per-service state caching. `next` / `status` surface cross-dep readiness in text + JSON via the shared `resolveCrossReadReadiness` helper.
- `StateManager.loadStateReadOnly(projectRoot, pathResolver)` — safe, side-effect-free foreign state access (applies migrations in memory only; does not call saveState, does not hold locks).
- `ProjectSchema.superRefine` now rejects global steps in service `exports` at parse time (via the existing `InvalidConfigError` path).

### Fixed
- N/A (additive release)

### Changed
- `DependencyNode` gains optional `crossDependencies` populated from `crossReads` frontmatter (informational, non-blocking).
- `OverlayState` gains `crossReads: Record<string, Array<{service,step}>>` (default `{}`) — seam for the post-release "Overlay crossReads Overrides" item.
```

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap.md CHANGELOG.md
git commit -m "docs(wave-3c): update roadmap + CHANGELOG for v3.17.0"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `make check-all`
Expected: PASS.

- [ ] **Review `git diff main..HEAD` against `docs/coding-standards.md` and this plan**

Verify each task's files appear in the diff, and no task produced unexpected touches elsewhere.

- [ ] **Create PR**

```bash
git push -u origin HEAD
gh pr create
```

- [ ] **Run mandatory 3-channel MMR review** per CLAUDE.md.

```bash
mmr review --pr "$PR_NUMBER" --sync --format json
```

- [ ] **Fix all P0/P1/P2 findings**, iterate up to 3 rounds, merge when verdict is `pass` or `degraded-pass`.

- [ ] **Release v3.17.0** per `docs/architecture/operations-runbook.md`.

---

## Self-Review Checklist

This plan was checked against the spec after drafting. Coverage map:

| Spec section | Task |
|--------------|------|
| §1.1 `exports` schema + global-step rejection | Tasks 1, 2 |
| §1.2 `cross-reads` frontmatter (4 touch-points + SLUG_PATTERN) | Task 3 |
| §2.1 `crossDependencies` + overlay-first lookup | Tasks 4, 5 |
| §2.2 transitive resolution (DFS, memo, cache, Map dedup, tool guard) | Task 8 |
| §2.3 edge case table (global step, path rejection, tool, aggregator, cycle) | Tasks 2, 7, 8 (cycle/tool/aggregator in 8; path rejection in 7; global in 2) |
| §3.1 `run.ts` integration with overlay-first + shared `gatheredPaths` | Task 10 |
| §3.2 read-only foreign state loader | Task 6 |
| §3.3 direct cross-read with warning symmetry + `{completed, artifacts}` | Task 7 |
| §3.4 `resolveCrossReadReadiness` + `CrossReadStatus` | Task 9 |
| §3.5 path containment via `resolveContainedArtifactPath` + `ARTIFACT_PATH_REJECTED` | Tasks 7, 10 |
| §3.6 JSON output schema `crossDependencies` on `next` / `status` | Tasks 11, 12 |
| §4 refactoring scope (all 12 files) | Tasks 1–12 |
| §5 testing strategy (35 tests across 10 categories) | Tests co-located per task; e2e + concurrency in Task 13 |

No placeholders remain. Every code block shows the exact content to paste. Every test step names a specific `vitest` invocation with an expected result.
