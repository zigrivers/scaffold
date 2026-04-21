# Cross-Service Dependency Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a service-level dependency graph section to `scaffold dashboard` on multi-service monorepos — consumer→producer cross-read arrows between service nodes, with step-level readiness detail in hover tooltips.

**Architecture:** Pure server-rendered inline SVG + minimal vanilla JS tooltip. New file `src/dashboard/dependency-graph.ts` aggregates `overlay.crossReads` into service-level edges, runs a simplified Sugiyama layered layout (longest-path topological sort + cubic bezier paths), and returns a `DependencyGraphData` object. Dashboard command resolves pipelines per service to capture overlays, builds the graph, and the generator/template thread it through to a new `<section class="dep-graph">` rendered between phase indicators and service cards.

**Tech Stack:** TypeScript, Vitest, vanilla DOM/SVG. Ships as v3.22.0. Zero new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md` — read this first if you need context on Q1-Q9 decisions or locked contracts (null/undefined, knownServices filter, role="img" removal, etc.).

**Branch:** `feat/cross-service-dep-viz` (already exists with 4 spec commits).

**Execution model:**
- **Tasks 1–9**: each dispatched to a fresh subagent via superpowers:subagent-driven-development. Per-task implementer → spec-compliance → code-quality review loops, plus a Codex + Gemini MMR as the 4th gate after the quality review passes. Fix all P0/P1/P2 findings before advancing. Fix P3 when both channels agree.
- **Tasks 10–12**: orchestrator-run (the controlling session). PR/branch operations + multi-round MMR cycles + release flow don't fit a fresh-subagent model. The PR-level 3-channel MMR in Task 11 replaces the per-task 4th-gate MMR for the merged diff.

---

## File Structure

**Create:**
- `src/dashboard/dependency-graph.ts` — graph builder (types imported from generator.ts, entry point + private `assignLayers` + private `layoutGraph` + exported `NODE_WIDTH`/`NODE_HEIGHT`)
- `src/dashboard/dependency-graph.test.ts` — 13 unit tests with hoisted `vi.mock` of `resolveCrossReadReadiness`
- `src/e2e/dashboard-cross-service-graph.test.ts` — 5 end-to-end fixture tests

**Modify:**
- `src/dashboard/generator.ts` — add `DependencyGraphNode` / `StepEdgeDetail` / `DependencyGraphEdge` / `DependencyGraphData` types; extend `MultiServiceDashboardData` + `MultiServiceGeneratorOptions`; normalize `dependencyGraph ?? null` on output
- `src/dashboard/template.ts` — add exported `renderDependencyGraphSection` helper + CSS for `.dep-graph` / `.dep-node-*` / `.dep-edge*` / `.dep-tooltip*` + JS tooltip IIFE; wire section into `buildMultiServiceTemplate` between `.aggregate-block` and `.services-grid`
- `src/dashboard/multi-service.test.ts` — add 7 template tests (§6.2 tests 14–20) + 1 generator-normalization test
- `src/cli/commands/dashboard.ts` — add `loadPipelineContext` once + `resolvePipeline` per service (wrapped in try/catch mirroring `loadState`'s STATE_MISSING fallback) + `buildDependencyGraph` call + pass `dependencyGraph` to generator
- `CHANGELOG.md` — v3.22.0 entry
- `docs/roadmap.md` — move Cross-Service Dependency Visualization to Completed Releases
- `package.json`, `package-lock.json` — bump to 3.22.0 (in release-prep PR, not feature PR)

---

## Task 1: Data types + generator normalization

**Files:**
- Modify: `src/dashboard/generator.ts` — add 4 new interfaces + extend 2 existing
- Test: `src/dashboard/multi-service.test.ts` — append 1 normalization test

Introduces the canonical types for the feature and locks the null/undefined contract on the generator's output (spec §1 + §5.2).

- [ ] **Step 1.1: Write the failing tests**

Append the following `describe` block at the end of `src/dashboard/multi-service.test.ts` (after the existing describes):

```typescript
describe('generateMultiServiceDashboardData — dependencyGraph pass-through', () => {
  const baseOpts = (): MultiServiceGeneratorOptions => ({
    services: [],
    methodology: 'deep',
  })

  it('returns dependencyGraph as null when option omitted', () => {
    const data = generateMultiServiceDashboardData(baseOpts())
    expect(data.dependencyGraph).toBeNull()
  })

  it('normalizes undefined input to null', () => {
    const data = generateMultiServiceDashboardData({ ...baseOpts(), dependencyGraph: undefined })
    expect(data.dependencyGraph).toBeNull()
  })

  it('normalizes null input to null', () => {
    const data = generateMultiServiceDashboardData({ ...baseOpts(), dependencyGraph: null })
    expect(data.dependencyGraph).toBeNull()
  })

  it('passes populated DependencyGraphData through unchanged', () => {
    const graph = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 10, y: 20 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 230, y: 20 },
      ],
      edges: [{
        consumer: 'web', producer: 'api',
        steps: [{ consumerStep: 'impl', producerStep: 'prd', status: 'completed' as const }],
        svgPath: 'M 230 42 C 175 42, 175 42, 150 42',
      }],
      viewBox: { width: 380, height: 92 },
    }
    const data = generateMultiServiceDashboardData({ ...baseOpts(), dependencyGraph: graph })
    expect(data.dependencyGraph).toBe(graph)
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/dashboard/multi-service.test.ts -t "dependencyGraph pass-through"`

Expected: FAIL with TypeScript errors — `dependencyGraph` is not a known property of `MultiServiceGeneratorOptions` or `MultiServiceDashboardData`.

- [ ] **Step 1.3: Implement the types in `src/dashboard/generator.ts`**

In `src/dashboard/generator.ts`, locate the section marked `// ---------- Multi-service dashboard ----------` (around line 199). IMMEDIATELY BEFORE the existing `export interface ServiceSummary`, insert:

```typescript
/** A node in the service dependency graph. One per service. */
export interface DependencyGraphNode {
  /** Service name (kebab-case, matches config). */
  name: string
  /** Project type — used for styling consistency with service cards. */
  projectType: string
  /** Depth in the topological ordering (0 = no upstream or orphan). */
  layer: number
  /** Layout-computed x,y in the SVG viewBox. Filled by layoutGraph, not the builder. */
  x: number
  y: number
}

/** A step-level cross-read relationship, aggregated into a service-level edge. */
export interface StepEdgeDetail {
  consumerStep: string          // e.g. 'implementation-plan'
  producerStep: string          // e.g. 'create-prd'
  /** Readiness from CrossReadStatus taxonomy (src/core/assembly/cross-reads.ts:177).
   *  service-unknown is filtered upstream (§2.1 of spec) so cannot appear here in practice. */
  status: 'completed' | 'pending' | 'not-bootstrapped' | 'read-error' | 'service-unknown' | 'not-exported'
}

/** A service-level aggregate edge: consumer depends on producer. */
export interface DependencyGraphEdge {
  consumer: string              // service name
  producer: string              // service name
  /** Step-level detail rolled up into this edge — rendered as tooltip rows. */
  steps: StepEdgeDetail[]
  /** SVG path string (cubic bezier) computed by layoutGraph. */
  svgPath: string
}

export interface DependencyGraphData {
  nodes: DependencyGraphNode[]
  edges: DependencyGraphEdge[]
  /** SVG viewBox dimensions — computed by layoutGraph. */
  viewBox: { width: number; height: number }
}
```

Then extend `MultiServiceDashboardData` (currently around line 241). Add the field AFTER `aggregate: MultiServiceAggregate`:

```typescript
export interface MultiServiceDashboardData {
  generatedAt: string
  methodology: string
  scaffoldVersion: string
  /** Preserves input order. */
  services: ServiceSummary[]
  aggregate: MultiServiceAggregate
  /**
   * Optional. null or absent when zero cross-service edges exist (graph
   * section omitted per §4). Optional (not required-nullable) preserves
   * source compatibility with hand-written literals in multi-service.test.ts.
   */
  dependencyGraph?: DependencyGraphData | null
}
```

Then extend `MultiServiceGeneratorOptions` (around line 250). Add the field AFTER `methodology: string`:

```typescript
export interface MultiServiceGeneratorOptions {
  services: Array<{
    name: string
    projectType: string
    state: PipelineState
    metaPrompts?: Map<string, MetaPromptFile>
  }>
  methodology: string
  /** Optional. Pass pre-built DependencyGraphData; generator normalizes null/undefined to null on output. */
  dependencyGraph?: DependencyGraphData | null
}
```

- [ ] **Step 1.4: Implement the generator normalization**

In `src/dashboard/generator.ts`, modify `generateMultiServiceDashboardData` (around line 352). The current `return` block is:

```typescript
  return {
    generatedAt: new Date().toISOString(),
    methodology,
    scaffoldVersion: pkg.version,
    services,
    aggregate: {
      totalServices,
      averagePercentage,
      servicesComplete,
      servicesByPhase,
    },
  }
```

Replace with:

```typescript
  return {
    generatedAt: new Date().toISOString(),
    methodology,
    scaffoldVersion: pkg.version,
    services,
    aggregate: {
      totalServices,
      averagePercentage,
      servicesComplete,
      servicesByPhase,
    },
    dependencyGraph: opts.dependencyGraph ?? null,
  }
```

- [ ] **Step 1.5: Run tests to verify pass**

Run: `npx vitest run src/dashboard/multi-service.test.ts`

Expected: PASS — new `dependencyGraph pass-through` tests pass. All previously existing multi-service tests still pass because they don't pass `dependencyGraph` and the field defaults to `null`.

- [ ] **Step 1.6: Type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 1.7: Commit**

```bash
git add src/dashboard/generator.ts src/dashboard/multi-service.test.ts
git commit -m "$(cat <<'EOF'
feat(generator): DependencyGraph types + generator passthrough

Adds DependencyGraphNode, StepEdgeDetail, DependencyGraphEdge,
DependencyGraphData exported interfaces. Extends MultiServiceDashboardData
and MultiServiceGeneratorOptions with an optional dependencyGraph field.
Generator normalizes null|undefined input to null on output, locking the
contract for template consumers.

Part of v3.22.0 cross-service dependency visualization. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §1, §5.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Graph builder core — types, entry point, aggregation + filters

**Files:**
- Create: `src/dashboard/dependency-graph.ts`
- Create: `src/dashboard/dependency-graph.test.ts`

Introduces the graph-builder file with types imported from generator.ts. Implements `buildDependencyGraph` entry point: filters (self-ref, unknown-service, disabled-step) and step-level cross-read aggregation into service-level edges. `assignLayers` and `layoutGraph` are stubbed as no-ops (layer=0, x=0, y=0, svgPath='', viewBox={0,0}); Tasks 3 and 4 will fill them in.

- [ ] **Step 2.1: Write the failing tests**

Create `src/dashboard/dependency-graph.test.ts` with this content:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCrossReadReadiness } from '../core/assembly/cross-reads.js'
import { buildDependencyGraph } from './dependency-graph.js'
import type { BuildGraphInput } from './dependency-graph.js'
import type { ScaffoldConfig } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'

vi.mock('../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(),
}))

// Minimal valid ScaffoldConfig for builder (builder only uses services + passes
// config through to resolveCrossReadReadiness which is mocked).
function makeConfig(services: Array<{ name: string; projectType: string }>): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    project: {
      services: services.map(s => ({
        name: s.name,
        projectType: s.projectType as 'backend',
        backendConfig: {
          apiStyle: 'rest',
          dataStore: ['relational'],
          authMechanism: 'jwt',
          asyncMessaging: 'none',
          deployTarget: 'container',
          domain: 'none',
        },
      })),
    },
  } as unknown as ScaffoldConfig
}

function makeOverlay(
  crossReadsByStep: Record<string, Array<{ service: string; step: string }>> = {},
  enabledByStep: Record<string, boolean> = {},
): OverlayState {
  const steps: OverlayState['steps'] = {}
  for (const step of Object.keys(crossReadsByStep)) {
    steps[step] = { enabled: enabledByStep[step] ?? true }
  }
  return {
    steps,
    knowledge: {},
    reads: {},
    dependencies: {},
    crossReads: crossReadsByStep,
  }
}

function makeInput(overrides: Partial<BuildGraphInput> = {}): BuildGraphInput {
  const services = overrides.services ?? [
    { name: 'api', projectType: 'backend' } as const,
    { name: 'web', projectType: 'web-app' } as const,
  ]
  return {
    config: overrides.config ?? makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
    projectRoot: overrides.projectRoot ?? '/tmp/proj',
    services: services as BuildGraphInput['services'],
    perServiceOverlay: overrides.perServiceOverlay ?? new Map(),
    globalSteps: overrides.globalSteps,
  }
}

beforeEach(() => {
  vi.mocked(resolveCrossReadReadiness).mockReset()
  // Default: any cross-read resolves to 'completed'. Override per-test as needed.
  vi.mocked(resolveCrossReadReadiness).mockImplementation(([cr]) => [{ ...cr, status: 'completed' }])
})

describe('buildDependencyGraph — core aggregation', () => {
  it('test 1: returns null when all services have zero cross-reads', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay()],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).toBeNull()
  })

  it('test 2: single edge — web consumes api:create-prd → 1 edge, 2 nodes', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.nodes).toHaveLength(2)
    expect(result!.nodes.map(n => n.name).sort()).toEqual(['api', 'web'])
    expect(result!.edges).toHaveLength(1)
    expect(result!.edges[0].consumer).toBe('web')
    expect(result!.edges[0].producer).toBe('api')
    expect(result!.edges[0].steps).toEqual([
      { consumerStep: 'implementation-plan', producerStep: 'create-prd', status: 'completed' },
    ])
  })

  it('test 3: multi-step aggregation — two steps each cross-reading different api steps', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'step-a': [{ service: 'api', step: 'create-prd' }],
          'step-b': [{ service: 'api', step: 'tech-stack' }],
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.edges).toHaveLength(1)  // same consumer+producer = 1 aggregate edge
    expect(result!.edges[0].steps).toHaveLength(2)
    expect(result!.edges[0].steps.map(s => s.consumerStep).sort()).toEqual(['step-a', 'step-b'])
    expect(result!.edges[0].steps.map(s => s.producerStep).sort()).toEqual(['create-prd', 'tech-stack'])
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run src/dashboard/dependency-graph.test.ts`

Expected: FAIL — `src/dashboard/dependency-graph.ts` does not exist yet. Import resolution error.

- [ ] **Step 2.3: Create `src/dashboard/dependency-graph.ts`**

Write the full file. Note: `assignLayers` and `layoutGraph` are STUBS in this task — they'll be filled in by Tasks 3 and 4. Layer/x/y/svgPath/viewBox are all zeros; tests 2.1–2.3 do NOT assert on these fields.

```typescript
import type { ScaffoldConfig } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'
import { resolveCrossReadReadiness } from '../core/assembly/cross-reads.js'
import type {
  DependencyGraphData, DependencyGraphEdge, DependencyGraphNode, StepEdgeDetail,
} from './generator.js'

// Exported so template.ts (§4.3) imports them — single source of truth for
// node dimensions. Tasks 3/4 use these; Task 2 only needs them declared.
export const NODE_WIDTH = 140
export const NODE_HEIGHT = 44

export interface BuildGraphInput {
  config: ScaffoldConfig
  projectRoot: string
  services: Array<{ name: string; projectType: string }>
  /** Per-service resolved overlay. Key: service name. */
  perServiceOverlay: Map<string, OverlayState>
  /** Optional: set of global step slugs for short-circuit in readiness. */
  globalSteps?: Set<string>
}

export function buildDependencyGraph(input: BuildGraphInput): DependencyGraphData | null {
  const { services, perServiceOverlay, config, projectRoot, globalSteps } = input

  // Service-name set — drop edges targeting services not in config BEFORE layout,
  // since layoutGraph does byName.get(producer)! and would crash on unknowns.
  const knownServices = new Set(services.map(s => s.name))

  // Shared foreign-state cache across all readiness lookups — one foreign
  // state.json read per service per graph build.
  const readinessCache = new Map()

  // 1. Aggregate step-level cross-reads into service-level edges.
  //    Filters applied at aggregation time:
  //      (a) skip self-references (cr.service === svc.name)
  //      (b) skip cross-reads whose target service is not in config
  //      (c) skip cross-reads declared on DISABLED consumer steps
  const edgeMap = new Map<string, StepEdgeDetail[]>()  // key: `${consumer}|${producer}`
  for (const svc of services) {
    const overlay = perServiceOverlay.get(svc.name)
    if (!overlay) continue
    for (const [consumerStep, crossReads] of Object.entries(overlay.crossReads)) {
      // (c) Disabled-step filter
      if (overlay.steps[consumerStep]?.enabled === false) continue
      for (const cr of crossReads) {
        if (cr.service === svc.name) continue         // (a) self-reference
        if (!knownServices.has(cr.service)) continue  // (b) unknown producer
        const [readiness] = resolveCrossReadReadiness(
          [cr], config, projectRoot, globalSteps, readinessCache,
        )
        const key = `${svc.name}|${cr.service}`
        const existing = edgeMap.get(key) ?? []
        existing.push({
          consumerStep,
          producerStep: cr.step,
          status: readiness.status,
        })
        edgeMap.set(key, existing)
      }
    }
  }

  if (edgeMap.size === 0) return null  // Q7 — hide section entirely.

  // 2. Build nodes for ALL services (Q9), layer stubbed to 0.
  const nodes: DependencyGraphNode[] = services.map(svc => ({
    name: svc.name,
    projectType: svc.projectType,
    layer: 0,
    x: 0, y: 0,
  }))
  assignLayers(nodes, edgeMap)

  // 3. Build edges array (step detail already aggregated). Sort explicitly by
  //    `consumer|producer` so SVG z-order is deterministic across runs — Map
  //    iteration preserves insertion order, which depends on Object.entries
  //    ordering of overlay.crossReads upstream. Explicit sort breaks that
  //    implicit coupling.
  const edges: DependencyGraphEdge[] = [...edgeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, steps]) => {
      const [consumer, producer] = key.split('|')
      return { consumer, producer, steps, svgPath: '' }
    })

  // 4. Run layout.
  return layoutGraph(nodes, edges)
}

/**
 * Assign `layer` to each node. Layer 0 = no upstream (orphans + root producers).
 * STUB in Task 2 — Task 3 implements longest-path topological sort + cycle handling.
 */
function assignLayers(
  _nodes: DependencyGraphNode[],
  _edgeMap: Map<string, StepEdgeDetail[]>,
): void {
  // Stub — Task 3 implements.
}

/**
 * Position nodes in layered columns; compute cubic-bezier edge paths.
 * STUB in Task 2 — Task 4 implements. Returns a minimal valid shape so the
 * builder can return early.
 */
function layoutGraph(
  nodes: DependencyGraphNode[],
  edges: DependencyGraphEdge[],
): DependencyGraphData {
  return { nodes, edges, viewBox: { width: 0, height: 0 } }
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run src/dashboard/dependency-graph.test.ts`

Expected: PASS — all 3 core aggregation tests pass.

- [ ] **Step 2.5: Run full suite + type-check**

Run: `npm run type-check && npx vitest run`

Expected: PASS — no regressions.

- [ ] **Step 2.6: Commit**

```bash
git add src/dashboard/dependency-graph.ts src/dashboard/dependency-graph.test.ts
git commit -m "$(cat <<'EOF'
feat(dep-graph): builder entry point + aggregation + filters

Introduces src/dashboard/dependency-graph.ts with buildDependencyGraph
entry point. Aggregates step-level crossReads into service-level edges;
filters self-references, unknown-service targets, and disabled consumer
steps at aggregation time. assignLayers and layoutGraph are stubs — later
tasks fill them in.

Exports NODE_WIDTH/NODE_HEIGHT constants for template.ts consumption.
Uses explicit edge sort for deterministic SVG z-order.

Part of v3.22.0. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §2.1, §3.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: assignLayers — longest-path topological sort

**Files:**
- Modify: `src/dashboard/dependency-graph.ts` (replace `assignLayers` stub body)
- Modify: `src/dashboard/dependency-graph.test.ts` (append 3 tests)

Implements the layer-assignment algorithm. Layer 0 = orphans + root producers. Cycle participants collapse to the current max layer (documented limitation per spec §3.4).

- [ ] **Step 3.1: Write the failing tests**

Append to `src/dashboard/dependency-graph.test.ts` at the end of the file (after the existing `describe` block):

```typescript
describe('buildDependencyGraph — layer assignment', () => {
  it('test 4: three-layer chain — web → api → shared-lib', () => {
    const services = [
      { name: 'shared-lib', projectType: 'library' } as const,
      { name: 'api', projectType: 'backend' } as const,
      { name: 'web', projectType: 'web-app' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['shared-lib', makeOverlay()],
        ['api', makeOverlay({
          'tech-stack': [{ service: 'shared-lib', step: 'api-contract' }],
        })],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    const byName = new Map(result!.nodes.map(n => [n.name, n]))
    expect(byName.get('shared-lib')!.layer).toBe(0)
    expect(byName.get('api')!.layer).toBe(1)
    expect(byName.get('web')!.layer).toBe(2)
  })

  it('test 5: orphan service — 4 services, 1 with no edges touches it', () => {
    const services = [
      { name: 'api', projectType: 'backend' } as const,
      { name: 'web', projectType: 'web-app' } as const,
      { name: 'worker', projectType: 'backend' } as const,  // orphan
      { name: 'shared-lib', projectType: 'library' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['api', makeOverlay({
          'tech-stack': [{ service: 'shared-lib', step: 'api-contract' }],
        })],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
        ['worker', makeOverlay()],
        ['shared-lib', makeOverlay()],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.nodes).toHaveLength(4)
    const byName = new Map(result!.nodes.map(n => [n.name, n]))
    expect(byName.get('worker')!.layer).toBe(0)  // orphan at layer 0
    expect(byName.get('shared-lib')!.layer).toBe(0)
    // no edges touch worker
    expect(result!.edges.some(e => e.consumer === 'worker' || e.producer === 'worker')).toBe(false)
  })

  it('test 6: cycle — A ↔ B → both same layer, 2 nodes, 2 edges, no crash', () => {
    const services = [
      { name: 'svc-a', projectType: 'backend' } as const,
      { name: 'svc-b', projectType: 'backend' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['svc-a', makeOverlay({
          'step-a1': [{ service: 'svc-b', step: 'step-b1' }],
        })],
        ['svc-b', makeOverlay({
          'step-b1': [{ service: 'svc-a', step: 'step-a1' }],
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.nodes).toHaveLength(2)
    expect(result!.edges).toHaveLength(2)
    const byName = new Map(result!.nodes.map(n => [n.name, n]))
    expect(byName.get('svc-a')!.layer).toBe(byName.get('svc-b')!.layer)
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run src/dashboard/dependency-graph.test.ts -t "layer assignment"`

Expected: FAIL — assignLayers is a no-op stub; all nodes are at layer 0, so tests 4 and 6 fail on layer-1/2 assertions. Test 5 may pass by accident (all layer 0), so treat its real validation as the layer assertions on `api`/`web`/`worker`.

(Actually, for Test 5, `api` has an edge to `shared-lib` and `web` has an edge to `api` — these should land on layers 1 and 2 once assignLayers is implemented. The stub would place them all at layer 0, failing the test-as-spelled — good.)

- [ ] **Step 3.3: Implement `assignLayers`**

In `src/dashboard/dependency-graph.ts`, replace the `assignLayers` stub body with the real implementation:

```typescript
/**
 * Assign `layer` to each node. Layer 0 = no upstream (orphans + root producers).
 * Uses longest-path: node.layer = 1 + max(layer of producers it consumes).
 *
 * Cycle handling: if Kahn-style pull leaves nodes unassigned, all remaining
 * nodes (cycle participants + any downstream, see §3.4 cascade limitation)
 * get the current max layer. Deterministic, no failure.
 */
function assignLayers(
  nodes: DependencyGraphNode[],
  edgeMap: Map<string, StepEdgeDetail[]>,
): void {
  const byName = new Map(nodes.map(n => [n.name, n]))
  const producers = new Map<string, string[]>()  // consumer -> producers list
  for (const key of edgeMap.keys()) {
    const [consumer, producer] = key.split('|')
    const list = producers.get(consumer) ?? []
    list.push(producer)
    producers.set(consumer, list)
  }

  const assigned = new Set<string>()
  let currentLayer = 0
  while (assigned.size < nodes.length) {
    const ready = nodes.filter(n => {
      if (assigned.has(n.name)) return false
      const producersList = producers.get(n.name) ?? []
      return producersList.every(p => assigned.has(p) || !byName.has(p))
    })
    if (ready.length === 0) {
      // Cycle breakdown: assign all remaining to current layer.
      for (const n of nodes) {
        if (!assigned.has(n.name)) {
          n.layer = currentLayer
          assigned.add(n.name)
        }
      }
      break
    }
    for (const n of ready) {
      n.layer = currentLayer
      assigned.add(n.name)
    }
    currentLayer++
  }
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run src/dashboard/dependency-graph.test.ts`

Expected: PASS — 6 tests total, all passing.

- [ ] **Step 3.5: Commit**

```bash
git add src/dashboard/dependency-graph.ts src/dashboard/dependency-graph.test.ts
git commit -m "$(cat <<'EOF'
feat(dep-graph): assignLayers — longest-path topological sort

Implements layer assignment via iterative Kahn-style pull. Layer 0 = orphans
and root producers. Cycle participants collapse to the current max layer
(documented limitation per spec §3.4 — full SCC analysis deferred).

Part of v3.22.0. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §3.1, §3.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: layoutGraph — node positions + cubic bezier edges

**Files:**
- Modify: `src/dashboard/dependency-graph.ts` (replace `layoutGraph` stub body)
- Modify: `src/dashboard/dependency-graph.test.ts` (append 2 tests)

Computes node x/y positions (one column per layer, alphabetical within layer) and cubic-bezier SVG path strings for edges. Fills `viewBox` dimensions.

- [ ] **Step 4.1: Write the failing tests**

Append to `src/dashboard/dependency-graph.test.ts` at the end of the file:

```typescript
describe('buildDependencyGraph — layout + determinism', () => {
  it('test 8: same input twice → identical x/y + identical SVG paths', () => {
    const services = [
      { name: 'api', projectType: 'backend' } as const,
      { name: 'web', projectType: 'web-app' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    })
    const first = buildDependencyGraph(input)!
    const second = buildDependencyGraph(input)!
    expect(first.nodes.map(n => ({ name: n.name, x: n.x, y: n.y, layer: n.layer })))
      .toEqual(second.nodes.map(n => ({ name: n.name, x: n.x, y: n.y, layer: n.layer })))
    expect(first.edges.map(e => ({ consumer: e.consumer, producer: e.producer, path: e.svgPath })))
      .toEqual(second.edges.map(e => ({ consumer: e.consumer, producer: e.producer, path: e.svgPath })))
    expect(first.viewBox).toEqual(second.viewBox)
  })

  it('test 9: viewBox dimensions scale with layer count + tallest-layer node count', () => {
    // Small graph: 2 layers, 1 node each → narrow + short.
    const small = buildDependencyGraph(makeInput({
      services: [
        { name: 'api', projectType: 'backend' } as const,
        { name: 'web', projectType: 'web-app' } as const,
      ],
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({ step: [{ service: 'api', step: 's' }] })],
      ]),
    }))!

    // Wider graph: 3 layers.
    const wide = buildDependencyGraph(makeInput({
      services: [
        { name: 'a', projectType: 'backend' } as const,
        { name: 'b', projectType: 'backend' } as const,
        { name: 'c', projectType: 'backend' } as const,
      ],
      config: makeConfig([
        { name: 'a', projectType: 'backend' },
        { name: 'b', projectType: 'backend' },
        { name: 'c', projectType: 'backend' },
      ]),
      perServiceOverlay: new Map([
        ['a', makeOverlay()],
        ['b', makeOverlay({ s: [{ service: 'a', step: 'x' }] })],
        ['c', makeOverlay({ s: [{ service: 'b', step: 'x' }] })],
      ]),
    }))!

    expect(wide.viewBox.width).toBeGreaterThan(small.viewBox.width)

    // Taller graph: 2 layers with 2 nodes in the tall layer → taller than small.
    const tall = buildDependencyGraph(makeInput({
      services: [
        { name: 'producer', projectType: 'library' } as const,
        { name: 'cons-a', projectType: 'web-app' } as const,
        { name: 'cons-b', projectType: 'web-app' } as const,
      ],
      config: makeConfig([
        { name: 'producer', projectType: 'library' },
        { name: 'cons-a', projectType: 'web-app' },
        { name: 'cons-b', projectType: 'web-app' },
      ]),
      perServiceOverlay: new Map([
        ['producer', makeOverlay()],
        ['cons-a', makeOverlay({ s: [{ service: 'producer', step: 'x' }] })],
        ['cons-b', makeOverlay({ s: [{ service: 'producer', step: 'x' }] })],
      ]),
    }))!

    expect(tall.viewBox.height).toBeGreaterThan(small.viewBox.height)
  })
})
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npx vitest run src/dashboard/dependency-graph.test.ts -t "layout"`

Expected: FAIL — layoutGraph is a stub returning `{ width: 0, height: 0 }` and all nodes still have x/y = 0. Test 8 passes trivially (0==0 across runs) but test 9's `wide > small` and `tall > small` assertions fail.

- [ ] **Step 4.3: Implement `layoutGraph`**

In `src/dashboard/dependency-graph.ts`, replace the `layoutGraph` stub with the full implementation. Also add the remaining layout constants (LAYER_GAP, NODE_GAP, PADDING) as module-private consts at the top of the file, near `NODE_WIDTH`:

```typescript
// Module-private layout constants (template.ts imports only NODE_WIDTH/NODE_HEIGHT
// since those align text/box positioning; the rest are layout-internal).
const LAYER_GAP = 80
const NODE_GAP = 16
const PADDING = 24
```

Then replace the `layoutGraph` stub body:

```typescript
/**
 * Position nodes in layered columns (one column per layer, alphabetical
 * within layer). Compute cubic-bezier edge paths from consumer's left edge to
 * producer's right edge. Deterministic output: same input → same bytes.
 */
function layoutGraph(
  nodes: DependencyGraphNode[],
  edges: DependencyGraphEdge[],
): DependencyGraphData {
  const maxLayer = Math.max(...nodes.map(n => n.layer), 0)
  const byLayer: DependencyGraphNode[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const n of nodes) byLayer[n.layer].push(n)
  // Deterministic within-layer ordering (alphabetical by service name).
  for (const layer of byLayer) layer.sort((a, b) => a.name.localeCompare(b.name))

  const width = PADDING * 2 + (maxLayer + 1) * NODE_WIDTH + maxLayer * LAYER_GAP
  const tallestLayer = Math.max(...byLayer.map(l => l.length))
  const height = PADDING * 2 + tallestLayer * NODE_HEIGHT + Math.max(0, tallestLayer - 1) * NODE_GAP

  // Position nodes — each layer is a column, vertically centered.
  for (let li = 0; li <= maxLayer; li++) {
    const layerNodes = byLayer[li]
    const layerHeight = layerNodes.length * NODE_HEIGHT
      + Math.max(0, layerNodes.length - 1) * NODE_GAP
    const offsetY = PADDING + (height - PADDING * 2 - layerHeight) / 2
    const x = PADDING + li * (NODE_WIDTH + LAYER_GAP)
    for (let ni = 0; ni < layerNodes.length; ni++) {
      layerNodes[ni].x = x
      layerNodes[ni].y = offsetY + ni * (NODE_HEIGHT + NODE_GAP)
    }
  }

  // Edge paths — cubic bezier from consumer's left edge to producer's right edge.
  const byName = new Map(nodes.map(n => [n.name, n]))
  for (const edge of edges) {
    const consumer = byName.get(edge.consumer)!
    const producer = byName.get(edge.producer)!
    const x1 = consumer.x                                    // consumer left
    const y1 = consumer.y + NODE_HEIGHT / 2
    const x2 = producer.x + NODE_WIDTH                       // producer right
    const y2 = producer.y + NODE_HEIGHT / 2
    const cx = (x1 + x2) / 2
    edge.svgPath = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
  }

  return { nodes, edges, viewBox: { width, height } }
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npx vitest run src/dashboard/dependency-graph.test.ts`

Expected: PASS — 8 tests total (tests 1, 2, 3, 4, 5, 6, 8, 9). All pass.

- [ ] **Step 4.5: Run full suite + type-check**

Run: `npm run type-check && npx vitest run`

Expected: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add src/dashboard/dependency-graph.ts src/dashboard/dependency-graph.test.ts
git commit -m "$(cat <<'EOF'
feat(dep-graph): layoutGraph — positions + cubic bezier edges

Assigns x/y to nodes (one column per layer, alphabetical within layer) and
computes cubic-bezier SVG path strings from each consumer's left edge to
producer's right edge. viewBox scales with layer count and tallest-layer
node count. Fully deterministic — same input bytes → same output bytes.

Part of v3.22.0. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §3.2, §3.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Filter + readiness coverage tests (regression — NOT TDD)

**Files:**
- Modify: `src/dashboard/dependency-graph.test.ts` (append 5 tests)

**TDD note:** This task is explicitly regression coverage, NOT red-green TDD. Task 2 already implemented the filters and readiness threading as part of the §2.1 entry point (necessary to pass tests 1-3 without crashes on malformed input). These new tests close the coverage gap — they pass immediately against Task 2's implementation and lock the contract for future refactors.

Test 7 covers readiness enum threading. Tests 10/11/12/13 cover filter edges. Tests 11 and 13 additionally assert that `resolveCrossReadReadiness` was NOT called for filtered-out cross-reads — this locks the spec's "filter before readiness lookup" ordering contract (spec §2.1 filter-at-aggregation requirement).

- [ ] **Step 5.1: Write the regression tests**

Append to `src/dashboard/dependency-graph.test.ts` at the end of the file:

```typescript
describe('buildDependencyGraph — readiness + filters (regression)', () => {
  it('test 7: readiness threads 5 reachable statuses from resolveCrossReadReadiness', () => {
    // service-unknown is filtered at aggregation time (§2.1) BEFORE readiness is
    // called, so only 5 of the 6 CrossReadStatus values can appear on an edge.
    const services = [
      { name: 'producer', projectType: 'library' } as const,
      { name: 'web', projectType: 'web-app' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['producer', makeOverlay()],
        ['web', makeOverlay({
          'step-1': [{ service: 'producer', step: 'completed-step' }],
          'step-2': [{ service: 'producer', step: 'pending-step' }],
          'step-3': [{ service: 'producer', step: 'not-bootstrapped-step' }],
          'step-4': [{ service: 'producer', step: 'read-error-step' }],
          'step-5': [{ service: 'producer', step: 'not-exported-step' }],
        })],
      ]),
    })
    // Mock returns a different status based on cr.step
    vi.mocked(resolveCrossReadReadiness).mockImplementation(([cr]) => {
      const map: Record<string, 'completed' | 'pending' | 'not-bootstrapped' | 'read-error' | 'not-exported'> = {
        'completed-step': 'completed',
        'pending-step': 'pending',
        'not-bootstrapped-step': 'not-bootstrapped',
        'read-error-step': 'read-error',
        'not-exported-step': 'not-exported',
      }
      return [{ ...cr, status: map[cr.step] }]
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.edges).toHaveLength(1)
    const statuses = result!.edges[0].steps.map(s => s.status).sort()
    expect(statuses).toEqual(['completed', 'not-bootstrapped', 'not-exported', 'pending', 'read-error'])
  })

  it('test 10: self-reference filter — cr svc → svc dropped', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay({
          'step-a': [{ service: 'api', step: 'step-b' }],  // self-reference
        })],
        ['web', makeOverlay()],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).toBeNull()  // 0 edges after filtering → null
  })

  it('test 11: service-unknown filter — target not in services[] dropped BEFORE readiness lookup, edgeMap empty → null', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'step-a': [{ service: 'nonexistent', step: 'step-b' }],  // unknown producer
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    // Builder short-circuits when edgeMap.size === 0
    expect(result).toBeNull()
    // Filter order contract (spec §2.1): unknown-service cross-reads must be
    // dropped BEFORE resolveCrossReadReadiness is called, both because that
    // helper is filesystem-touching and because the caller (layoutGraph) does
    // byName.get(producer)! which would crash. Lock the invariant:
    expect(resolveCrossReadReadiness).not.toHaveBeenCalled()
  })

  it('test 12: disabled-step filter — cr declared on disabled consumer step dropped', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay(
          { 'step-a': [{ service: 'api', step: 'create-prd' }] },
          { 'step-a': false },  // step-a disabled
        )],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).toBeNull()
  })

  it('test 13: mixed filter — self-ref + unknown + disabled, all dropped BEFORE readiness lookup, null returned', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay(
          {
            'self-ref-step': [{ service: 'web', step: 'x' }],         // self-ref
            'unknown-step': [{ service: 'nonexistent', step: 'x' }],  // unknown
            'disabled-step': [{ service: 'api', step: 'x' }],         // disabled
          },
          { 'disabled-step': false },
        )],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).toBeNull()
    // All three filter classes drop BEFORE readiness lookup:
    expect(resolveCrossReadReadiness).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5.2: Run tests to verify they pass immediately (regression coverage)**

Run: `npx vitest run src/dashboard/dependency-graph.test.ts`

Expected: PASS — 13 tests total, all passing. No production code change needed in this task; Task 2's `buildDependencyGraph` already implements the filters these tests exercise.

If any test fails, the failure is a signal that Task 2's implementation diverged from the spec — investigate Task 2's diff before modifying anything.

- [ ] **Step 5.3: Commit**

```bash
git add src/dashboard/dependency-graph.test.ts
git commit -m "$(cat <<'EOF'
test(dep-graph): readiness + filter regression coverage

Adds 5 regression tests closing the coverage gap on Task 2's implementation:
readiness threading through all 5 reachable CrossReadStatus values, and
filter behavior for self-ref / unknown-service / disabled-step / mixed.

service-unknown is filtered upstream before readiness is called, so only 5
statuses can appear on an edge — test 7 asserts this explicitly.

Part of v3.22.0. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §6.1 tests 7, 10-13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: renderDependencyGraphSection — template helper

**Files:**
- Modify: `src/dashboard/template.ts` (add exported `renderDependencyGraphSection`, with private `renderEdges` + `renderNodes` helpers; import NODE_WIDTH/NODE_HEIGHT)
- Modify: `src/dashboard/multi-service.test.ts` (append 7 tests)

Adds the SVG-rendering helper. Tests cover null/undefined handling, small-graph structure, XSS escaping, data-steps round-trip, marker attrs, dual-path pattern, and accessibility (tabindex + `<title>`).

- [ ] **Step 6.1: Update the top-of-file import block**

In `src/dashboard/multi-service.test.ts`, the existing top-of-file import block imports from `./generator.js`. Add a new line importing `renderDependencyGraphSection` from `./template.js`:

```typescript
// Existing imports at top of file (do not modify):
import { describe, it, expect } from 'vitest'
import { generateMultiServiceDashboardData, generateMultiServiceHtml } from './generator.js'
import type { MultiServiceGeneratorOptions, MultiServiceDashboardData } from './generator.js'
import type { PipelineState, MetaPromptFile } from '../types/index.js'
import { PHASES } from '../types/frontmatter.js'

// NEW — add this line alongside the existing imports:
import { renderDependencyGraphSection } from './template.js'
```

The repo is `"type": "module"` (package.json:4). `require('./template.js')` would fail at runtime in ESM test files — use a regular top-level import.

- [ ] **Step 6.2: Write the failing tests**

Append the following `describe` block at the end of `src/dashboard/multi-service.test.ts`:

```typescript
describe('renderDependencyGraphSection', () => {
  // Helper: extract data-steps attribute JSON for an edge (works around no jsdom).
  function extractDataSteps(html: string, consumer: string, producer: string) {
    const pattern = new RegExp(
      `data-consumer="${consumer}"[^>]*data-producer="${producer}"[^>]*data-steps="([^"]*)"`,
    )
    const match = html.match(pattern)
    if (!match) throw new Error(`edge ${consumer} -> ${producer} not found`)
    const json = match[1].replace(/&quot;/g, '"')
    return JSON.parse(json)
  }

  it('test 14: returns empty string for null and undefined', () => {
    expect(renderDependencyGraphSection(null)).toBe('')
    expect(renderDependencyGraphSection(undefined)).toBe('')
  })

  it('test 15: small graph renders <section class="dep-graph"> with expected viewBox', () => {
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 24, y: 24 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 244, y: 24 },
      ],
      edges: [
        { consumer: 'web', producer: 'api', steps: [
          { consumerStep: 'impl', producerStep: 'prd', status: 'completed' as const },
        ], svgPath: 'M 244 46 C 192 46, 192 46, 164 46' },
      ],
      viewBox: { width: 408, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toContain('<section class="dep-graph"')
    expect(html).toContain('viewBox="0 0 408 92"')
    expect(html).toContain('data-consumer="web"')
    expect(html).toContain('data-producer="api"')
  })

  it('test 16: service names with special characters are HTML-escaped', () => {
    const data = {
      nodes: [
        { name: '<svc>&"a', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [
        { consumer: 'web', producer: '<svc>&"a', steps: [
          { consumerStep: 's', producerStep: 't', status: 'completed' as const },
        ], svgPath: 'M 0 0' },
      ],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toContain('&lt;svc&gt;&amp;&quot;a')
    // Raw form must NOT appear inside attribute values or text content.
    // Narrowed regex avoids matching inside SVG path bytes.
    expect(html).not.toMatch(/data-producer="<svc>&"a"/)
    expect(html).not.toMatch(/<text[^>]*>.*<svc>&"a.*<\/text>/)
  })

  it('test 17: data-steps round-trips via extractDataSteps helper', () => {
    const steps = [
      { consumerStep: 'impl-plan', producerStep: 'create-prd', status: 'completed' as const },
      { consumerStep: 'tech-stack', producerStep: 'arch', status: 'pending' as const },
    ]
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [{ consumer: 'web', producer: 'api', steps, svgPath: 'M 0 0' }],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    const extracted = extractDataSteps(html, 'web', 'api')
    expect(extracted).toEqual(steps)
  })

  it('test 18: defs contain <marker id="arrow" ... orient="auto">', () => {
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [{ consumer: 'web', producer: 'api', steps: [
        { consumerStep: 's', producerStep: 't', status: 'completed' as const },
      ], svgPath: 'M 0 0' }],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toMatch(/<marker\s+id="arrow"[^>]*orient="auto"/)
  })

  it('test 19: each edge has both dep-edge-hit and dep-edge-line paths', () => {
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [{ consumer: 'web', producer: 'api', steps: [
        { consumerStep: 's', producerStep: 't', status: 'completed' as const },
      ], svgPath: 'M 0 0' }],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toMatch(/class="dep-edge-hit"/)
    expect(html).toMatch(/class="dep-edge-line"/)
  })

  it('test 20: each edge <g> has tabindex="0" and a nested <title>', () => {
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [{ consumer: 'web', producer: 'api', steps: [
        { consumerStep: 'impl', producerStep: 'prd', status: 'completed' as const },
      ], svgPath: 'M 0 0' }],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toMatch(/<g class="dep-edge"[^>]*tabindex="0"/)
    expect(html).toMatch(/<title>[^<]*web:impl -&gt; api:prd \(completed\)[^<]*<\/title>/)
  })
})
```

- [ ] **Step 6.3: Run tests to verify they fail**

Run: `npx vitest run src/dashboard/multi-service.test.ts -t "renderDependencyGraphSection"`

Expected: FAIL — `renderDependencyGraphSection` is not exported from `template.js`. Type-check error on the import line, or runtime error at test load time.

- [ ] **Step 6.4: Implement `renderDependencyGraphSection` in `src/dashboard/template.ts`**

At the top of `src/dashboard/template.ts`, add the NODE_WIDTH/NODE_HEIGHT import after the existing imports (line 1):

```typescript
import { NODE_WIDTH, NODE_HEIGHT } from './dependency-graph.js'
```

Then, at the BOTTOM of the file (after `buildMultiServiceTemplate`'s closing brace at line 1249), add:

```typescript
// ---------- Cross-service dependency graph ----------

/**
 * Render the `<section class="dep-graph">` block containing the SVG graph.
 * Exported so tests can assert on rendered output directly (§6.2).
 *
 * Returns '' when data is null/undefined — caller does string concatenation
 * and the empty slot naturally collapses.
 *
 * Security: attacker-influenced strings (service names, step slugs) flow
 * through escapeHtml before reaching attribute values or text content.
 * data-steps holds JSON with escaped quotes (`&quot;`); consumers decode
 * via replace(/&quot;/g, '"') then JSON.parse.
 */
export function renderDependencyGraphSection(
  data: MultiServiceDashboardData['dependencyGraph'],
): string {
  if (!data) return ''
  return [
    '<section class="dep-graph" id="dep-graph">',
    '  <h2 class="dep-graph-title">Cross-Service Dependencies</h2>',
    // role="img" would flatten the SVG a11y tree and suppress descendant
    // <title> elements on many AT combos. SVG AAM handles focusable
    // descendants with <title> correctly without an explicit role.
    `  <svg class="dep-graph-svg" viewBox="0 0 ${data.viewBox.width} ${data.viewBox.height}" xmlns="http://www.w3.org/2000/svg" aria-label="Cross-service dependency graph">`,
    '    <defs>',
    '      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">',
    '        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/>',
    '      </marker>',
    '    </defs>',
    renderDepEdges(data),
    renderDepNodes(data),
    '  </svg>',
    '</section>',
  ].join('\n')
}

function renderDepEdges(
  data: NonNullable<MultiServiceDashboardData['dependencyGraph']>,
): string {
  return data.edges.map(edge => {
    const tooltipLines = edge.steps.map(s =>
      `${edge.consumer}:${s.consumerStep} -> ${edge.producer}:${s.producerStep} (${s.status})`,
    )
    const titleText = escapeHtml(tooltipLines.join('\n'))
    const stepsJson = escapeHtml(JSON.stringify(edge.steps))
    return [
      `    <g class="dep-edge" data-consumer="${escapeHtml(edge.consumer)}" data-producer="${escapeHtml(edge.producer)}" data-steps="${stepsJson}" tabindex="0">`,
      `      <title>${titleText}</title>`,
      `      <path class="dep-edge-hit" d="${edge.svgPath}" stroke="transparent" stroke-width="14" fill="none" pointer-events="stroke"/>`,
      `      <path class="dep-edge-line" d="${edge.svgPath}" stroke="currentColor" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`,
      '    </g>',
    ].join('\n')
  }).join('\n')
}

function renderDepNodes(
  data: NonNullable<MultiServiceDashboardData['dependencyGraph']>,
): string {
  const HALF_W = NODE_WIDTH / 2
  const NAME_BASELINE = 20
  const TYPE_BASELINE = NODE_HEIGHT - 8
  return data.nodes.map(n => [
    `    <g class="dep-node" data-service="${escapeHtml(n.name)}" transform="translate(${n.x}, ${n.y})">`,
    `      <rect class="dep-node-box" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="6"/>`,
    `      <text class="dep-node-name" x="${HALF_W}" y="${NAME_BASELINE}" text-anchor="middle">${escapeHtml(n.name)}</text>`,
    `      <text class="dep-node-type" x="${HALF_W}" y="${TYPE_BASELINE}" text-anchor="middle">${escapeHtml(n.projectType)}</text>`,
    '    </g>',
  ].join('\n')).join('\n')
}
```

- [ ] **Step 6.5: Run tests to verify they pass**

Run: `npx vitest run src/dashboard/multi-service.test.ts`

Expected: PASS — 7 new renderDependencyGraphSection tests pass. All existing tests still pass.

- [ ] **Step 6.6: Run full suite + type-check**

Run: `npm run type-check && npx vitest run`

Expected: PASS.

- [ ] **Step 6.7: Commit**

```bash
git add src/dashboard/template.ts src/dashboard/multi-service.test.ts
git commit -m "$(cat <<'EOF'
feat(template): renderDependencyGraphSection — SVG graph helper

Adds exported renderDependencyGraphSection + private renderDepEdges +
renderDepNodes helpers to src/dashboard/template.ts. Imports NODE_WIDTH/
NODE_HEIGHT from dependency-graph.ts — single source of truth for node
dimensions (no duplication).

Every attacker-influenced string passes through escapeHtml. Edge <g>
elements are keyboard-focusable (tabindex="0") with nested <title> for
screen-reader announcement. marker-end arrow inherits currentColor so
hover re-coloring propagates cleanly.

Part of v3.22.0. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §4.1, §4.2, §4.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: CSS + JS tooltip in `buildMultiServiceTemplate`

**Files:**
- Modify: `src/dashboard/template.ts` (inject CSS into `<style>` block + JS IIFE into `<script>` block)
- Modify: `src/dashboard/multi-service.test.ts` (append 2 smoke tests)

Adds the visual polish: hover/focus states, tooltip styling, and a JS IIFE that populates the tooltip div via `textContent` only (zero `innerHTML` writes). Visual verification is Playwright-manual (see spec §6.4) — automated coverage here is smoke-level.

- [ ] **Step 7.1: Write the failing tests**

Append the following `describe` block at the end of `src/dashboard/multi-service.test.ts`:

```typescript
describe('buildMultiServiceTemplate — dependency-graph CSS + JS', () => {
  function makeDashboardData(): MultiServiceDashboardData {
    return {
      generatedAt: new Date().toISOString(),
      methodology: 'deep',
      scaffoldVersion: '3.22.0',
      services: [],
      aggregate: {
        totalServices: 0,
        averagePercentage: 0,
        servicesComplete: 0,
        servicesByPhase: [],
      },
      dependencyGraph: null,
    }
  }

  it('CSS block declares .dep-graph, .dep-node-box, .dep-edge, and .dep-tooltip rules', () => {
    const html = generateMultiServiceHtml(makeDashboardData())
    expect(html).toMatch(/\.dep-graph\s*\{/)
    expect(html).toMatch(/\.dep-node-box\s*\{/)
    expect(html).toMatch(/\.dep-edge\s*\{/)
    expect(html).toMatch(/\.dep-tooltip\s*\{/)
  })

  it('JS block contains the dep-edge tooltip IIFE with textContent writes and no innerHTML', () => {
    const html = generateMultiServiceHtml(makeDashboardData())
    // IIFE presence
    expect(html).toMatch(/querySelectorAll\(['"]\.dep-edge['"]\)/)
    // Uses textContent (not innerHTML) for attacker-influenced strings
    expect(html).toContain('row.textContent =')
    // No innerHTML writes in the dep-tooltip JS segment
    const depSegmentMatch = html.match(/\/\/ ---------- Cross-service dependency graph JS ----------[\s\S]*?\}\)\(\);/)
    if (depSegmentMatch) {
      expect(depSegmentMatch[0]).not.toContain('innerHTML =')
    }
  })
})
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run: `npx vitest run src/dashboard/multi-service.test.ts -t "dependency-graph CSS + JS"`

Expected: FAIL — no `.dep-graph` CSS rule and no `.dep-edge` querySelectorAll yet.

- [ ] **Step 7.3: Add CSS to `buildMultiServiceTemplate`'s `<style>` block**

In `src/dashboard/template.ts`, locate the multi-service `<style>` block. It starts after line 921. Find a stable anchor — the block ends before a `</style>` tag. Add the following CSS IMMEDIATELY BEFORE the closing `</style>` of the multi-service template (search for `</style>` after line 1000 — it's the multi-service one).

A reliable strategy: find the last `.services-grid { grid-template-columns: 1fr; }` line (around 1148) — this is inside a `@media (max-width: ...)` block. Find the closing `}` of that media query, then append BELOW it BUT BEFORE the `</style>`:

```css
/* Cross-service dependency graph (§4.4) */
.dep-graph {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin: 0 0 24px;
  color: var(--muted);
}
.dep-graph-title {
  margin: 0 0 12px;
  font-size: 1rem;
  color: var(--text);
}
.dep-graph-svg { width: 100%; height: auto; max-height: 420px; display: block; }
.dep-node-box { fill: var(--bg); stroke: var(--border); stroke-width: 1; }
.dep-node-name { font-size: 13px; font-weight: 500; fill: var(--text); font-family: system-ui, sans-serif; }
.dep-node-type { font-size: 11px; fill: var(--muted); font-family: system-ui, sans-serif; }
.dep-edge { transition: color 0.1s ease; }
.dep-edge-line { transition: stroke 0.1s ease, stroke-width 0.1s ease; }
.dep-edge:hover,
.dep-edge:focus-visible { color: var(--accent); }
.dep-edge:hover .dep-edge-line,
.dep-edge:focus-visible .dep-edge-line { stroke: var(--accent); stroke-width: 2; }
.dep-tooltip {
  position: fixed; pointer-events: none;
  background: var(--card-bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 8px; font-size: 12px; color: var(--text);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  max-width: 360px; z-index: 100;
  opacity: 0; transition: opacity 0.1s ease;
}
.dep-tooltip.visible { opacity: 1; }
.dep-tooltip-row { padding: 2px 0; }
.dep-tooltip-status-completed { color: var(--status-completed); }
.dep-tooltip-status-pending,
.dep-tooltip-status-not-bootstrapped { color: var(--status-in-progress); }
.dep-tooltip-status-read-error,
.dep-tooltip-status-service-unknown,
.dep-tooltip-status-not-exported { color: var(--stale-text); }
```

The exact insertion point is a string literal inside `buildMultiServiceTemplate`. Treat the CSS as one literal chunk that gets concatenated into the rendered `<style>`.

- [ ] **Step 7.4: Add JS IIFE to `buildMultiServiceTemplate`'s `<script>` block**

Inside `buildMultiServiceTemplate`, locate the outer IIFE `(function() { ... })();` at line 1187–1245. INSIDE that outer IIFE, immediately BEFORE its closing `})();` at line 1245, insert a marker comment and the tooltip IIFE. The marker `// ---------- Cross-service dependency graph JS ----------` is what test 7.1's negative-innerHTML assertion anchors on.

```javascript
  // ---------- Cross-service dependency graph JS ----------
  (function(){
    var edges = document.querySelectorAll('.dep-edge');
    if (edges.length === 0) return;
    var tooltip = document.createElement('div');
    tooltip.className = 'dep-tooltip';
    tooltip.setAttribute('role', 'region');
    tooltip.setAttribute('aria-live', 'polite');
    tooltip.setAttribute('aria-label', 'Cross-service dependency details');
    document.body.appendChild(tooltip);

    function clearTooltip() {
      while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
    }

    function showTooltip(edge) {
      var consumer = edge.getAttribute('data-consumer');
      var producer = edge.getAttribute('data-producer');
      var stepsJson = edge.getAttribute('data-steps');
      var steps;
      try { steps = JSON.parse(stepsJson); } catch(_) { return; }
      clearTooltip();
      steps.forEach(function(s) {
        var row = document.createElement('div');
        row.className = 'dep-tooltip-row dep-tooltip-status-' + s.status;
        row.textContent = consumer + ':' + s.consumerStep
          + ' -> ' + producer + ':' + s.producerStep
          + ' (' + s.status + ')';
        tooltip.appendChild(row);
      });
      tooltip.classList.add('visible');
    }

    function hideTooltip() {
      tooltip.classList.remove('visible');
    }

    function positionTooltip(x, y) {
      var MARGIN = 12;
      var MAX_W = 370;
      var MAX_H = 200;
      var left = Math.min(x + MARGIN, window.innerWidth - MAX_W);
      var top = Math.min(y + MARGIN, window.innerHeight - MAX_H);
      tooltip.style.left = Math.max(0, left) + 'px';
      tooltip.style.top = Math.max(0, top) + 'px';
    }

    edges.forEach(function(edge) {
      edge.addEventListener('mouseenter', function() { showTooltip(edge); });
      edge.addEventListener('mousemove', function(e) { positionTooltip(e.clientX, e.clientY); });
      edge.addEventListener('mouseleave', hideTooltip);
      edge.addEventListener('focusin', function() {
        showTooltip(edge);
        var rect = edge.getBoundingClientRect();
        positionTooltip(rect.right, rect.top);
      });
      edge.addEventListener('focusout', hideTooltip);
    });

    window.addEventListener('scroll', hideTooltip, { passive: true });
  })();
```

Note: the JS uses `var` (not `let`/`const`) and `function()` (not arrow syntax) to match the existing IIFE style in `buildMultiServiceTemplate`.

- [ ] **Step 7.5: Run tests to verify they pass**

Run: `npx vitest run src/dashboard/multi-service.test.ts`

Expected: PASS — new CSS + JS smoke tests pass. All existing tests still pass.

- [ ] **Step 7.6: Run full suite + type-check**

Run: `npm run type-check && npx vitest run`

Expected: PASS.

- [ ] **Step 7.7: Commit**

```bash
git add src/dashboard/template.ts src/dashboard/multi-service.test.ts
git commit -m "$(cat <<'EOF'
feat(template): CSS + JS tooltip for cross-service dependency graph

Adds .dep-graph / .dep-node-* / .dep-edge* / .dep-tooltip* CSS rules to
the multi-service <style> block and an IIFE to the <script> block. Tooltip
content is written via textContent only — zero innerHTML writes. Clearing
uses a firstChild/removeChild loop. Keyboard users get identical UX via
focusin/focusout handlers. Tooltip position clamps against window bounds
and dismisses on scroll.

Status-severity color grouping: success (completed), in-flight (pending,
not-bootstrapped), config-error (read-error, service-unknown, not-exported).
All colors reference existing theme tokens — no new CSS custom properties.

Part of v3.22.0. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §4.4, §4.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Integrate renderDependencyGraphSection into buildMultiServiceTemplate

**Files:**
- Modify: `src/dashboard/template.ts` (wire call into template body)
- Modify: `src/dashboard/multi-service.test.ts` (append 1 integration test)

Inserts `renderDependencyGraphSection(data.dependencyGraph)` as a sibling of `.aggregate-block` and `.services-grid` (not a child of either). Placement locked per spec §4.6.

- [ ] **Step 8.1a: Extend multi-service.test.ts imports**

In `src/dashboard/multi-service.test.ts`, the existing top-of-file import of generator exports currently reads:

```typescript
import { generateMultiServiceDashboardData, generateMultiServiceHtml } from './generator.js'
```

Replace with (add `generateHtml` + `generateDashboardData` for the spec §8.2 single-service regression test):

```typescript
import { generateMultiServiceDashboardData, generateMultiServiceHtml, generateHtml, generateDashboardData } from './generator.js'
```

- [ ] **Step 8.1: Write the failing test**

Append to `src/dashboard/multi-service.test.ts` at the end:

```typescript
describe('buildMultiServiceTemplate — dependencyGraph integration', () => {
  it('renders <section class="dep-graph"> between .aggregate-block and .services-grid when graph has edges', () => {
    const graph = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 24, y: 24 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 244, y: 24 },
      ],
      edges: [{
        consumer: 'web', producer: 'api', steps: [
          { consumerStep: 'impl', producerStep: 'prd', status: 'completed' as const },
        ],
        svgPath: 'M 244 46 C 192 46, 192 46, 164 46',
      }],
      viewBox: { width: 408, height: 92 },
    }
    const data: MultiServiceDashboardData = {
      generatedAt: new Date().toISOString(),
      methodology: 'deep',
      scaffoldVersion: '3.22.0',
      services: [],
      aggregate: {
        totalServices: 0, averagePercentage: 0, servicesComplete: 0,
        servicesByPhase: [],
      },
      dependencyGraph: graph,
    }
    const html = generateMultiServiceHtml(data)
    const aggPos = html.indexOf('<div class="aggregate-block">')
    const depPos = html.indexOf('<section class="dep-graph"')
    const gridPos = html.indexOf('<div class="services-grid">')
    expect(aggPos).toBeGreaterThan(-1)
    expect(depPos).toBeGreaterThan(-1)
    expect(gridPos).toBeGreaterThan(-1)
    expect(aggPos).toBeLessThan(depPos)
    expect(depPos).toBeLessThan(gridPos)
  })

  it('omits <section class="dep-graph"> entirely when dependencyGraph is null', () => {
    const data: MultiServiceDashboardData = {
      generatedAt: new Date().toISOString(),
      methodology: 'deep',
      scaffoldVersion: '3.22.0',
      services: [],
      aggregate: {
        totalServices: 0, averagePercentage: 0, servicesComplete: 0,
        servicesByPhase: [],
      },
      dependencyGraph: null,
    }
    const html = generateMultiServiceHtml(data)
    expect(html).not.toContain('<section class="dep-graph"')
  })

  it('single-service dashboard output does NOT include dep-graph section (spec §8.2 compat)', () => {
    // Use the single-service path via generateHtml + generateDashboardData.
    // The single-service path has NO dependencyGraph awareness at all; this
    // test locks that v3.21.0 single-service output remains unaffected.
    const state: PipelineState = {
      'schema-version': 3, 'scaffold-version': '3.22.0',
      init_methodology: 'deep', config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-21T00:00:00Z',
      in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
    } as PipelineState
    const html = generateHtml(generateDashboardData({
      state, decisions: [], methodology: 'deep',
    }))
    expect(html).not.toContain('dep-graph')
    expect(html).not.toContain('dep-edge')
    expect(html).not.toContain('dep-tooltip')
  })
})
```

- [ ] **Step 8.2: Run tests to verify they fail**

Run: `npx vitest run src/dashboard/multi-service.test.ts -t "dependencyGraph integration"`

Expected: FAIL — first test fails because `<section class="dep-graph">` does not appear in output (not wired yet). Second test passes trivially.

- [ ] **Step 8.3: Wire `renderDependencyGraphSection` into the template**

In `src/dashboard/template.ts`, find the multi-service template body (around line 1170–1181):

```
  ${staleNotice}
  <div class="aggregate-block">
    <div class="aggregate-row">
      <div class="aggregate-progress-bar"><div class="aggregate-progress-fill" style="width:${avgPct}%"></div></div>
      <span class="aggregate-pct">${avgPct}%</span>
    </div>
    <div class="aggregate-stat"><strong>${data.aggregate.servicesComplete}</strong> of <strong>${data.aggregate.totalServices}</strong> services complete</div>
    ${servicesByPhase ? `<div class="phase-indicators">${servicesByPhase}</div>` : ''}
  </div>
  <div class="services-grid">
```

Insert the graph section AFTER the `.aggregate-block`'s closing `</div>` and BEFORE `<div class="services-grid">`. Replace the section above with:

```
  ${staleNotice}
  <div class="aggregate-block">
    <div class="aggregate-row">
      <div class="aggregate-progress-bar"><div class="aggregate-progress-fill" style="width:${avgPct}%"></div></div>
      <span class="aggregate-pct">${avgPct}%</span>
    </div>
    <div class="aggregate-stat"><strong>${data.aggregate.servicesComplete}</strong> of <strong>${data.aggregate.totalServices}</strong> services complete</div>
    ${servicesByPhase ? `<div class="phase-indicators">${servicesByPhase}</div>` : ''}
  </div>
  ${renderDependencyGraphSection(data.dependencyGraph)}
  <div class="services-grid">
```

- [ ] **Step 8.4: Run tests to verify they pass**

Run: `npx vitest run src/dashboard/multi-service.test.ts`

Expected: PASS — integration tests pass. All existing tests still pass.

- [ ] **Step 8.5: Run full suite + type-check**

Run: `npm run type-check && npx vitest run`

Expected: PASS.

- [ ] **Step 8.6: Commit**

```bash
git add src/dashboard/template.ts src/dashboard/multi-service.test.ts
git commit -m "$(cat <<'EOF'
feat(template): wire renderDependencyGraphSection into multi-service template

Inserts <section class="dep-graph"> as a sibling of .aggregate-block and
.services-grid (NOT a child of either) to keep DOM hierarchy flat and
match the 24px sibling-spacing CSS contract.

When data.dependencyGraph is null/undefined, the section is omitted
entirely — no "no dependencies" placeholder (Q7 lock).

Part of v3.22.0. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §4.6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: dashboard.ts wiring + integration tests

**Files:**
- Modify: `src/cli/commands/dashboard.ts` (add loadPipelineContext + resolvePipeline per service + buildDependencyGraph + pass to generator)
- Create: `src/e2e/dashboard-cross-service-graph.test.ts` (5 API-level composition tests)
- Create: `src/e2e/dashboard-cross-service-graph-wiring.test.ts` (1 command-level wiring test with vi.mock isolation)

Adds pipeline context loading once + per-service `resolvePipeline` (wrapped in try/catch mirroring the existing `loadState` STATE_MISSING fallback pattern) + `buildDependencyGraph` invocation. Passes `dependencyGraph` to the generator.

Two layers of tests:

1. **API-level composition tests** (tests 21–25 below): call `buildDependencyGraph` + `generateMultiServiceDashboardData` + `generateMultiServiceHtml` directly against in-memory fixtures. These lock the composition contract and verify rendered HTML shape.
2. **Wiring test** (test 26): mocks `loadPipelineContext`, `resolvePipeline`, and `StateManager.prototype.loadState` so the full `dashboard` command handler can be invoked without filesystem/CLI harness. Exercises the new `try/catch` around `resolvePipeline`, verifies `resolvePipeline` is called once per service, and verifies a throw for one service doesn't crash the other.

This covers both the regression invariant (tests 21–25 pass immediately after Tasks 1–8 as composition coverage) AND the new wiring invariant (test 26 fails until Step 9.3's wiring is applied).

- [ ] **Step 9.1: Write the failing integration tests**

Create `src/e2e/dashboard-cross-service-graph.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCrossReadReadiness } from '../core/assembly/cross-reads.js'
import { buildDependencyGraph } from '../dashboard/dependency-graph.js'
import type { BuildGraphInput } from '../dashboard/dependency-graph.js'
import { generateMultiServiceDashboardData, generateMultiServiceHtml } from '../dashboard/generator.js'
import type { ScaffoldConfig, PipelineState, MetaPromptFile } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'

vi.mock('../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(),
}))

function makeConfig(services: Array<{ name: string; projectType: string }>): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    project: {
      services: services.map(s => ({
        name: s.name,
        projectType: s.projectType as 'backend',
        backendConfig: {
          apiStyle: 'rest',
          dataStore: ['relational'],
          authMechanism: 'jwt',
          asyncMessaging: 'none',
          deployTarget: 'container',
          domain: 'none',
        },
      })),
    },
  } as unknown as ScaffoldConfig
}

function makeOverlay(
  crossReadsByStep: Record<string, Array<{ service: string; step: string }>> = {},
): OverlayState {
  const steps: OverlayState['steps'] = {}
  for (const step of Object.keys(crossReadsByStep)) {
    steps[step] = { enabled: true }
  }
  return {
    steps,
    knowledge: {},
    reads: {},
    dependencies: {},
    crossReads: crossReadsByStep,
  }
}

function emptyState(): PipelineState {
  return {
    'schema-version': 3,
    'scaffold-version': '3.22.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-04-21T00:00:00.000Z',
    in_progress: null,
    steps: {},
    next_eligible: [],
    'extra-steps': [],
  } as PipelineState
}

beforeEach(() => {
  vi.mocked(resolveCrossReadReadiness).mockReset()
  vi.mocked(resolveCrossReadReadiness).mockImplementation(([cr]) => [{ ...cr, status: 'completed' }])
})

function loadedServicesFor(services: Array<{ name: string; projectType: string }>) {
  return services.map(s => ({
    name: s.name,
    projectType: s.projectType,
    state: emptyState(),
    metaPrompts: new Map<string, MetaPromptFile>(),
  }))
}

describe('dashboard integration — cross-service dependency graph', () => {
  it('test 21: multi-service with real cross-reads → HTML contains <section class="dep-graph">', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    }
    const graph = buildDependencyGraph(input)
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    expect(html).toContain('<section class="dep-graph"')
    expect(html).toContain('data-consumer="web"')
    expect(html).toContain('data-producer="api"')
  })

  it('test 22: multi-service with zero cross-reads → HTML does NOT contain class="dep-graph"', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay()],
      ]),
    }
    const graph = buildDependencyGraph(input)
    expect(graph).toBeNull()
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    expect(html).not.toContain('class="dep-graph"')
  })

  it('test 23: edge data-steps round-trips via regex extraction', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'impl-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    }
    const graph = buildDependencyGraph(input)
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    const match = html.match(/data-consumer="web"[^>]*data-producer="api"[^>]*data-steps="([^"]*)"/)
    expect(match).not.toBeNull()
    const steps = JSON.parse(match![1].replace(/&quot;/g, '"'))
    expect(steps).toEqual([
      { consumerStep: 'impl-plan', producerStep: 'create-prd', status: 'completed' },
    ])
  })

  it('test 24: orphan service appears as a node even with no edges', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
      { name: 'worker', projectType: 'backend' },  // orphan
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'impl': [{ service: 'api', step: 'prd' }],
        })],
        ['worker', makeOverlay()],
      ]),
    }
    const graph = buildDependencyGraph(input)
    expect(graph).not.toBeNull()
    expect(graph!.nodes).toHaveLength(3)
    expect(graph!.nodes.map(n => n.name).sort()).toEqual(['api', 'web', 'worker'])
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    expect(html).toContain('<section class="dep-graph"')
    expect(html).toContain('data-service="worker"')
  })

  it('test 25: service-unknown cross-read does not crash — edge dropped, other edges rendered', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'impl': [
            { service: 'nonexistent', step: 'prd' },  // dropped by knownServices filter
            { service: 'api', step: 'create-prd' },
          ],
        })],
      ]),
    }
    const graph = buildDependencyGraph(input)
    expect(graph).not.toBeNull()
    expect(graph!.edges).toHaveLength(1)  // only the api edge survives
    expect(graph!.edges[0].producer).toBe('api')
    expect(graph!.nodes.map(n => n.name).sort()).toEqual(['api', 'web'])
    // No nonexistent-service node
    expect(graph!.nodes.find(n => n.name === 'nonexistent')).toBeUndefined()
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    expect(html).toContain('<section class="dep-graph"')
  })
})
```

Also create a SEPARATE test file for the wiring test so its file-wide `vi.mock` hoists do not bleed into the integration tests above. Create `src/e2e/dashboard-cross-service-graph-wiring.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import type { PipelineState } from '../types/index.js'

// ---------- Module mocks ----------
// All vi.mock calls are hoisted file-wide; keeping them in a separate file
// prevents leakage into the API-level integration tests.

vi.mock('../core/pipeline/context.js', () => ({
  loadPipelineContext: vi.fn(),
}))
vi.mock('../core/pipeline/resolver.js', () => ({
  resolvePipeline: vi.fn(),
}))
vi.mock('../state/state-manager.js', () => {
  class MockStateManager {
    loadState(): PipelineState {
      return {
        'schema-version': 3, 'scaffold-version': '3.22.0',
        init_methodology: 'deep', config_methodology: 'deep',
        'init-mode': 'greenfield',
        created: '2026-04-21T00:00:00Z',
        in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
      } as PipelineState
    }
    saveState() {}
  }
  return { StateManager: MockStateManager }
})
vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    config: {
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        services: [
          { name: 'api', projectType: 'backend' },
          { name: 'web', projectType: 'web-app' },
        ],
      },
    },
    errors: [], warnings: [],
  })),
}))
vi.mock('../state/ensure-v3-migration.js', () => ({ ensureV3Migration: vi.fn() }))
vi.mock('../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))
vi.mock('../state/decision-logger.js', () => ({ readDecisions: vi.fn(() => []) }))
vi.mock('../cli/middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(() => '/tmp/fake-proj'),
}))
// CRITICAL: mock `utils/fs` to intercept atomicWriteFile. dashboard.ts calls
// atomicWriteFile(outputPath, html) — we need to capture `html` here.
// Module-level `let capturedHtml` allows the test block to read the captured
// payload after the handler runs.
let capturedHtml = ''
vi.mock('../utils/fs.js', async (importActual) => {
  const actual = await importActual<typeof import('../utils/fs.js')>()
  return {
    ...actual,
    atomicWriteFile: vi.fn((_p: string, contents: string) => {
      if (typeof contents === 'string' && contents.includes('<html')) capturedHtml = contents
    }),
  }
})
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))

// ---------- Test ----------

describe('dashboard.ts multi-service wiring — resolvePipeline integration', () => {
  it('test 26: resolvePipeline called per service; one service throwing does not crash the dashboard', async () => {
    capturedHtml = ''
    const { loadPipelineContext } = await import('../core/pipeline/context.js')
    const { resolvePipeline } = await import('../core/pipeline/resolver.js')
    vi.mocked(loadPipelineContext).mockReturnValue({
      projectRoot: '/tmp/fake-proj',
      metaPrompts: new Map(),
      config: undefined,
      configErrors: [],
      configWarnings: [],
      presets: { deep: undefined, mvp: undefined, custom: undefined },
      methodologyDir: '/tmp/fake-methodology',
    } as unknown as ReturnType<typeof loadPipelineContext>)
    vi.mocked(resolvePipeline).mockImplementation((_ctx, opts) => {
      if (opts?.serviceId === 'api') throw new Error('simulated overlay parse error')
      // 'web' resolves OK with empty overlay (no edges → null graph)
      return {
        graph: { nodes: [], edges: [] },
        preset: { name: 'deep', description: '', default_depth: 3, steps: {} },
        overlay: { steps: {}, knowledge: {}, reads: {}, dependencies: {}, crossReads: {} },
        stepMeta: new Map(),
        computeEligible: () => [],
        globalSteps: new Set<string>(),
        getPipelineHash: () => 'hash',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    })

    // dashboard.ts's handler calls process.exit(0) on success — intercept to
    // keep the test process alive while still asserting success.
    const origExit = process.exit
    let exitCode: number | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process as any).exit = (code?: number) => {
      exitCode = code ?? 0
      throw new Error('__exit__')
    }

    try {
      const dashboardCmd = (await import('../cli/commands/dashboard.js')).default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (dashboardCmd.handler as (a: any) => Promise<void>)({
        'no-open': true,
        _: [],
        $0: 'scaffold',
      })
    } catch (err) {
      if ((err as Error).message !== '__exit__') throw err
    } finally {
      process.exit = origExit
    }

    // Core assertion: resolvePipeline called once per configured service.
    expect(vi.mocked(resolvePipeline)).toHaveBeenCalledTimes(2)
    // Handler completed successfully despite api's throw.
    expect(exitCode).toBe(0)
    // HTML was written (atomicWriteFile was called with an <html> payload).
    expect(capturedHtml).toContain('<html')
    // Graph section absent (web has empty overlay, api threw → no edges).
    expect(capturedHtml).not.toContain('class="dep-graph"')
    // Service cards still rendered — the whole dashboard didn't crash.
    expect(capturedHtml).toContain('class="services-grid"')
  })
})
```

Note: this test exercises the EXACT import paths used by `src/cli/commands/dashboard.ts` (verify by reading the file's import block before/after Step 9.3's edits). `vi.mock('../utils/fs.js')` intercepts `atomicWriteFile` directly — more reliable than monkey-patching `fs.writeFileSync` after module resolution, because ESM local bindings inside `utils/fs.ts` cannot be retroactively rebound.

- [ ] **Step 9.2: Run tests to verify the expected pass/fail split**

Run: `npx vitest run src/e2e/dashboard-cross-service-graph.test.ts src/e2e/dashboard-cross-service-graph-wiring.test.ts`

Expected:
- Tests 21–25 in `dashboard-cross-service-graph.test.ts` (API-level composition): **PASS** against Tasks 1–8 implementation. They confirm that buildDependencyGraph → generateMultiServiceDashboardData → buildMultiServiceTemplate composes correctly. They are regression coverage.
- Test 26 in `dashboard-cross-service-graph-wiring.test.ts` (wiring-level): **FAIL** — dashboard.ts has not yet been modified to call `loadPipelineContext` + `resolvePipeline` per service, so `vi.mocked(resolvePipeline)` reports 0 calls. This is the TDD red signal for Step 9.3.

If tests 21–25 fail, Tasks 1–8 left a seam broken; investigate the failure BEFORE modifying dashboard.ts.

- [ ] **Step 9.3: Wire `dashboard.ts`**

This step uses three precise structural edits. The instructions below quote the CURRENT file content (verbatim, from `src/cli/commands/dashboard.ts` at HEAD before this task) and specify exactly what replaces it. Do NOT insert placeholder comments like `// ...` into production code.

**Edit 1 of 3 — add imports.** Locate the import block at the top of the file (around lines 1–27). The current block is:

```typescript
import type { CommandModule } from 'yargs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../../../package.json') as { version: string }
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { readDecisions } from '../../state/decision-logger.js'
import { loadConfig } from '../../config/loader.js'
import { guardSteplessCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'
import {
  generateDashboardData,
  generateHtml,
  generateMultiServiceDashboardData,
  generateMultiServiceHtml,
} from '../../dashboard/generator.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir, atomicWriteFile } from '../../utils/fs.js'
import type { PipelineState, ServiceConfig } from '../../types/index.js'
```

Insert four NEW import lines immediately AFTER the last existing import (`import type { PipelineState, ServiceConfig } ...`):

```typescript
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { buildDependencyGraph } from '../../dashboard/dependency-graph.js'
import type { OverlayState } from '../../core/assembly/overlay-state-resolver.js'
```

**Edit 2 of 3 — add context + overlay-map setup.** Locate the line that currently reads:

```typescript
      // Load meta-prompts ONCE and share across all services.
      const metaPrompts = discoverMetaPrompts(getPackagePipelineDir(projectRoot))
```

IMMEDIATELY AFTER that line (blank line, then the new block), insert:

```typescript

      // NEW: load pipeline context once (shared across all services). Default
      // includeTools: false — tool meta-prompts aren't pipeline participants;
      // their crossReads would leak into overlay.crossReads and into the graph.
      const pipelineContext = loadPipelineContext(projectRoot)

      // NEW: per-service overlay map populated alongside loadedServices below.
      const perServiceOverlay = new Map<string, OverlayState>()
      let capturedGlobalSteps: Set<string> | undefined
```

**Edit 3 of 3 — add per-service resolvePipeline + post-loop graph build + generator call update.** The current loop + aftermath block (lines roughly 142–193) is:

```typescript
      let fallbackStateMethodology: string | undefined
      for (const svc of configuredServices!) {
        const svcResolver = new StatePathResolver(projectRoot, svc.name)
        const svcStateManager = new StateManager(
          projectRoot,
          () => [],
          () => config ?? undefined,
          svcResolver,
          new Set<string>(),
          undefined,
        )
        let svcState: PipelineState
        try {
          svcState = svcStateManager.loadState()
          if (!fallbackStateMethodology) {
            fallbackStateMethodology = svcState.config_methodology
          }
        } catch (err) {
          // Only convert missing-state-file into a skeleton; re-throw anything
          // else (corrupt JSON, schema-version mismatch, permission errors) so
          // the user sees the real error instead of a confusing 0% row.
          // Codex/Claude MMR P2: bare catch collapsed every failure mode.
          const code = (err as { code?: string } | undefined)?.code
          if (code !== 'STATE_MISSING') throw err
          // Skeleton state: empty steps (total=0) renders as "Not started" in
          // the multi-service template, distinct from "Complete".
          svcState = {
            'schema-version': 3,
            'scaffold-version': pkg.version,
            init_methodology: configMethodology ?? 'unknown',
            config_methodology: configMethodology ?? 'unknown',
            'init-mode': 'greenfield',
            created: new Date().toISOString(),
            in_progress: null,
            steps: {},
            next_eligible: [],
            'extra-steps': [],
          } as PipelineState
        }
        loadedServices.push({
          name: svc.name,
          projectType: svc.projectType,
          state: svcState,
          metaPrompts,
        })
      }

      const methodology = configMethodology ?? fallbackStateMethodology ?? 'unknown'

      const dashboardData = generateMultiServiceDashboardData({
        services: loadedServices,
        methodology,
      })
```

Replace that entire block with this block (the only changes: (a) the `try/catch` around `resolvePipeline` at the START of the loop body, (b) the `buildDependencyGraph` call AFTER the loop, (c) the `dependencyGraph` argument added to `generateMultiServiceDashboardData`):

```typescript
      let fallbackStateMethodology: string | undefined
      for (const svc of configuredServices!) {
        // NEW: resolve pipeline per service to capture overlay + globalSteps.
        // Wrap in try/catch mirroring loadState's STATE_MISSING fallback — a
        // malformed overlay for one service must not crash the multi-service
        // dashboard. On failure, warn + skip this service's outgoing graph
        // contribution; the service's card still renders because the
        // loadState block below has its own fallback. Incoming edges FROM
        // other services INTO this service are still rendered — only this
        // service's OWN outgoing declarations are lost.
        try {
          const svcPipeline = resolvePipeline(pipelineContext, { output, serviceId: svc.name })
          perServiceOverlay.set(svc.name, svcPipeline.overlay)
          if (!capturedGlobalSteps) capturedGlobalSteps = svcPipeline.globalSteps
        } catch (err) {
          output.warn(
            `Could not resolve pipeline for service '${svc.name}' — `
            + `outgoing graph edges from this service omitted `
            + `(incoming edges from other services are still rendered) `
            + `(${(err as Error).message})`,
          )
        }

        // Existing state-loading block (unchanged from HEAD):
        const svcResolver = new StatePathResolver(projectRoot, svc.name)
        const svcStateManager = new StateManager(
          projectRoot,
          () => [],
          () => config ?? undefined,
          svcResolver,
          new Set<string>(),
          undefined,
        )
        let svcState: PipelineState
        try {
          svcState = svcStateManager.loadState()
          if (!fallbackStateMethodology) {
            fallbackStateMethodology = svcState.config_methodology
          }
        } catch (err) {
          const code = (err as { code?: string } | undefined)?.code
          if (code !== 'STATE_MISSING') throw err
          svcState = {
            'schema-version': 3,
            'scaffold-version': pkg.version,
            init_methodology: configMethodology ?? 'unknown',
            config_methodology: configMethodology ?? 'unknown',
            'init-mode': 'greenfield',
            created: new Date().toISOString(),
            in_progress: null,
            steps: {},
            next_eligible: [],
            'extra-steps': [],
          } as PipelineState
        }
        loadedServices.push({
          name: svc.name,
          projectType: svc.projectType,
          state: svcState,
          metaPrompts,
        })
      }

      const methodology = configMethodology ?? fallbackStateMethodology ?? 'unknown'

      // NEW: build the dependency graph (returns null if no edges after filtering).
      const dependencyGraph = buildDependencyGraph({
        config: config!,
        projectRoot,
        services: configuredServices!.map(s => ({ name: s.name, projectType: s.projectType })),
        perServiceOverlay,
        globalSteps: capturedGlobalSteps,
      })

      const dashboardData = generateMultiServiceDashboardData({
        services: loadedServices,
        methodology,
        dependencyGraph,  // NEW — threaded into generator
      })
```

Do not touch the single-service branch (the code path after `isMultiServiceMode` returns). That path must remain byte-identical to HEAD so spec §8.2 holds.

- [ ] **Step 9.4: Run tests to verify they pass**

Run: `npx vitest run src/e2e/dashboard-cross-service-graph.test.ts src/e2e/dashboard-cross-service-graph-wiring.test.ts`

Expected: PASS — all 6 tests (21–26) pass. In particular, test 26 now passes because the dashboard.ts handler calls `resolvePipeline` twice (once per configured service), handles the thrown error from the `api` mock without crashing, and writes HTML that contains `services-grid` but not `dep-graph` (web's overlay is empty in the mock).

If test 26 still fails, likely culprits: (a) `resolvePipeline` called 0 or ≠2 times — check the try/catch position inside the for-loop in Edit 3, (b) `capturedHtml` empty → mock of `atomicWriteFile` not hit, check that `vi.mock('../utils/fs.js')` path is relative to the test file and that dashboard.ts imports from `utils/fs.js` (NOT a sibling), (c) the `vi.mock` of `state-manager` doesn't satisfy the constructor-arity call pattern — compare against the actual `new StateManager(...)` call.

- [ ] **Step 9.5: Run full suite + type-check**

Run: `npm run type-check && npx vitest run`

Expected: PASS — no regressions.

- [ ] **Step 9.6: Smoke-test via CLI**

Run (optional, for maintainer confidence):

```bash
make check-all
```

Expected: PASS — lint + validate + test + eval + TypeScript gates all green.

- [ ] **Step 9.7: Commit**

```bash
git add src/cli/commands/dashboard.ts src/e2e/dashboard-cross-service-graph.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): wire cross-service dependency graph into multi-service path

Adds loadPipelineContext once + resolvePipeline per service (wrapped in
try/catch mirroring loadState's STATE_MISSING fallback pattern) to capture
each service's overlay and the shared globalSteps. Passes the built
DependencyGraphData to generateMultiServiceDashboardData; the template
omits the section when the builder returns null.

A malformed overlay for one service does not crash the whole dashboard —
the service's card still renders via the pre-existing loadState fallback;
only its outgoing graph edges are dropped. Incoming edges from other
services are still rendered.

Adds 5 E2E tests covering the happy/empty/single-service/orphan/malformed
paths.

Part of v3.22.0. See
docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md §5.1, §6.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 (orchestrator): Push branch + create PR + wait for CI

This task runs in the controlling session — not dispatched to a subagent.

- [ ] **Step 10.1: Verify branch is clean + all checks pass**

```bash
make check-all
git status --short
```

Expected: clean working tree; `make check-all` green.

- [ ] **Step 10.2: Push branch**

```bash
git push -u origin feat/cross-service-dep-viz
```

- [ ] **Step 10.3: Create PR**

```bash
gh pr create --title "feat(dashboard): cross-service dependency graph (v3.22.0)" --body "$(cat <<'EOF'
## Summary

Adds a service-level dependency-graph section to `scaffold dashboard` on multi-service monorepos. Consumer→producer cross-reads render as arrows between service nodes; step-level readiness detail surfaces in hover tooltips.

- Pure server-rendered inline SVG + minimal vanilla-JS tooltip. Zero new runtime dependencies.
- Layered Sugiyama-style layout (longest-path topological sort + cubic bezier edges). Deterministic — same input bytes produce same output bytes.
- Filters at aggregation time: drops self-references, cross-reads targeting services not in config, and cross-reads declared on disabled consumer steps. knownServices filter prevents layoutGraph crashes on service-unknown readiness.
- Full accessibility: each edge is keyboard-focusable (tabindex=0) with a nested `<title>`; tooltip uses `role=region` + `aria-live=polite`; JS writes content via textContent only (zero innerHTML).
- Graceful degradation: one service's malformed overlay does not crash the whole multi-service dashboard — the service's card still renders, only its outgoing graph edges are dropped.

## Design

See `docs/superpowers/specs/2026-04-21-cross-service-dep-viz-design.md`. The spec passed four rounds of multi-model review (Codex + Claude compensating; Gemini rate-limited in rounds 1–2).

## Test plan

- [ ] `npm run type-check` passes
- [ ] `npx vitest run` passes (13 unit tests in dependency-graph.test.ts, 10 template tests in multi-service.test.ts, 5 E2E tests in dashboard-cross-service-graph.test.ts, plus all pre-existing tests)
- [ ] `make check-all` passes (bash + TypeScript gates)
- [ ] Visual verification: `make dashboard-test` generates a test HTML; Playwright MCP to verify desktop + mobile + light/dark + tooltip-on-hover + tooltip-on-focus

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR number:

```bash
PR_NUMBER=$(gh pr view --json number --jq '.number')
echo "PR_NUMBER=$PR_NUMBER"
```

- [ ] **Step 10.4: Wait for CI green**

```bash
gh pr checks --watch
```

Expected: the `check` job reports SUCCESS. If CI fails, investigate the logs, fix the root cause, commit, push, and re-run this step. Do NOT skip CI.

---

## Task 11 (orchestrator): 3-channel PR MMR cycle + merge

This task runs in the controlling session — not dispatched to a subagent. Follows CLAUDE.md's mandatory 3-channel PR MMR discipline.

- [ ] **Step 11.1: Run 3-channel PR MMR**

Use `scaffold run review-pr` (or the `mmr` binary directly) to dispatch Codex + Gemini + Claude compensating review. Foreground only — never `run_in_background`, `&`, or `nohup`.

```bash
mmr review --pr "$PR_NUMBER" --sync --format json
```

Capture the job_id. If Gemini returns rate-limit or auth-expired errors, run a compensating `claude -p` pass labeled `[compensating: Gemini-equivalent]`:

```bash
claude -p "Review PR #$PR_NUMBER for architectural patterns and broad-context reasoning. Focus on design consistency, abstraction boundaries, and pattern alignment with existing code (v3.17.0 Wave 3c cross-reads, v3.20.0 multi-service dashboard, v3.21.0 multi-domain stacking). Return findings in P0/P1/P2/P3 severity buckets." --output-format json
```

- [ ] **Step 11.2: Fix all P0/P1/P2 findings; P3 when both channels agree**

For each round:

1. Fix findings inline, re-run `make check-all`, commit with message `fix: address PR MMR round N findings` (or more specific).
2. Push.
3. Re-run MMR for the next round.

3-round limit. If findings remain after round 3, STOP and surface to the user — do not merge.

- [ ] **Step 11.3: Playwright visual verification (spec §6.4)**

Spec §6.4 requires manual Playwright visual verification before merge. This is NOT optional — it's part of the pre-merge gate.

IMPORTANT: `make dashboard-test` runs the bash `scripts/generate-dashboard.sh` path, which is the legacy v1 pipeline and does NOT exercise `src/dashboard/*`. Use the TypeScript `scaffold dashboard` CLI against a throwaway temp project instead.

Create a throwaway fixture + generate HTML via the TypeScript dashboard:

```bash
TMP=$(mktemp -d -t scaffold-depgraph-preview-XXXX)
mkdir -p "$TMP/.scaffold/services/api" "$TMP/.scaffold/services/web"
cat > "$TMP/.scaffold/config.yml" <<'YAML'
version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: api
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: jwt
        asyncMessaging: none
        deployTarget: container
        domain: none
      exports:
        - step: create-prd
    - name: web
      projectType: web-app
YAML
cat > "$TMP/.scaffold/services/api/state.json" <<'JSON'
{"schema-version":3,"scaffold-version":"3.22.0","init_methodology":"deep","config_methodology":"deep","init-mode":"greenfield","created":"2026-04-21T00:00:00Z","in_progress":null,"steps":{"create-prd":{"status":"completed","source":"pipeline","produces":[]}},"next_eligible":[],"extra-steps":[]}
JSON
cat > "$TMP/.scaffold/services/web/state.json" <<'JSON'
{"schema-version":3,"scaffold-version":"3.22.0","init_methodology":"deep","config_methodology":"deep","init-mode":"greenfield","created":"2026-04-21T00:00:00Z","in_progress":null,"steps":{"implementation-plan":{"status":"in_progress","source":"pipeline","produces":[]}},"next_eligible":["implementation-plan"],"extra-steps":[]}
JSON
HTML_PATH="$TMP/dashboard.html"
( cd "$TMP" && scaffold dashboard --output "$HTML_PATH" --no-open )
echo "Preview HTML at: file://$HTML_PATH"
```

Note: for the graph to render, the cross-read declaration needs to live in an active pipeline step. If the default pipeline doesn't ship a step whose frontmatter declares the api:create-prd cross-read, add a `cross-reads-overrides` section to `content/methodology/multi-service-overlay.yml` in a SEPARATE local edit (do NOT commit) to seed one for preview. Revert after verification.

Then verify in a browser using Playwright MCP tools (`mcp__plugin_playwright_playwright__*`):

1. `browser_navigate` to `file://$HTML_PATH`.
2. Resize to 1280×800 (desktop) — `browser_take_screenshot`, save to `tests/screenshots/current/dep-graph_desktop_light.png`.
3. Resize to 375×812 (mobile) — screenshot `dep-graph_mobile_light.png`.
4. `browser_run_code` to set `document.documentElement.setAttribute('data-theme', 'dark')` — re-screenshot desktop + mobile as `_dark.png`.
5. `browser_hover` on a `.dep-edge` `<g>` → verify tooltip appears (`.dep-tooltip.visible`). Screenshot as `dep-graph_desktop_tooltip-hover.png`.
6. `browser_press_key` `Tab` repeatedly to focus an edge → verify tooltip appears on focus. Screenshot as `dep-graph_desktop_tooltip-focus.png`.
7. Scroll the page → verify tooltip dismisses.
8. `browser_snapshot` to sanity-check the accessibility tree (each edge announced, tooltip region live).

Clean up:

```bash
rm -rf "$TMP"
# And revert any local multi-service-overlay.yml edits if you seeded a cross-read override.
git diff -- content/methodology/multi-service-overlay.yml  # should show nothing
```

If any visual regression is detected (graph clips, tooltip off-screen, broken arrowhead, dark-mode colors wrong), fix inline on the feature branch and push — the PR reopens for review. Do NOT merge with visual regressions.

- [ ] **Step 11.4: Verdict check + merge**

Verdict handling per CLAUDE.md:
- `pass` or `degraded-pass` → proceed to merge.
- `blocked` or `needs-user-decision` → STOP, surface to user, do not merge.

If pass/degraded-pass:

```bash
gh pr merge "$PR_NUMBER" --squash --delete-branch
```

Capture the merge commit SHA:

```bash
git fetch origin main
git log -1 origin/main --format="%H %s"
```

---

## Task 12 (orchestrator): Release v3.22.0

This task runs in the controlling session. Follows `docs/architecture/operations-runbook.md`.

- [ ] **Step 12.1: Create release-prep branch from main**

```bash
git checkout main
git pull origin main
git checkout -b release/v3.22.0
```

- [ ] **Step 12.2: Bump `package.json` 3.21.0 → 3.22.0**

Edit `package.json`:

```
-  "version": "3.21.0",
+  "version": "3.22.0",
```

Sync the lockfile:

```bash
npm install
```

Expected: `package-lock.json` updates the root `"version"` field + the root package metadata entry to 3.22.0.

- [ ] **Step 12.3: Update `CHANGELOG.md`**

Prepend a new section at the top of `CHANGELOG.md` (or match whatever the file's existing format is — verify with `head -30 CHANGELOG.md`):

```markdown
## v3.22.0 (2026-04-21)

### Features

- **Cross-Service Dependency Visualization** — `scaffold dashboard` on multi-service monorepos now renders a service-level dependency graph between phase indicators and service cards. Consumer→producer cross-reads appear as arrows; step-level readiness detail surfaces on hover or keyboard focus.
  - Pure server-rendered inline SVG + minimal vanilla JS tooltip. Zero new runtime dependencies.
  - Layered Sugiyama-style layout with cubic bezier edges. Deterministic output.
  - Filters self-references, unknown-service targets, and disabled consumer steps at aggregation.
  - Accessibility: keyboard-focusable edges, nested SVG `<title>` announcements, `role="region"` + `aria-live="polite"` on tooltip, `textContent`-only DOM writes (zero `innerHTML`).
  - Graceful degradation: one service's malformed overlay does not crash the multi-service dashboard.

### Review discipline

- 4-round spec MMR (Codex + Claude compensating; Gemini rate-limited in rounds 1-2)
- 9 subagent-dispatched tasks each with per-task 4-gate review (implementer → spec-compliance → code-quality → Codex+Gemini MMR)
- 3-channel PR MMR on PR #<N>
- All P0/P1/P2 findings fixed before merge
```

- [ ] **Step 12.4: Update `docs/roadmap.md`**

Move the "Cross-Service Dependency Visualization" entry from `## Near-Term Enhancements` (around line 79) to the `## Completed Releases` section as a new `### v3.22.0 (2026-04-21)` block IMMEDIATELY ABOVE `### v3.21.0 (2026-04-21)`:

```markdown
### v3.22.0 (2026-04-21)

Cross-Service Dependency Visualization — `scaffold dashboard` on multi-service monorepos renders a service-level dependency graph between phase indicators and service cards, showing consumer→producer cross-reads as arrows with step-level readiness detail in hover tooltips. Completes roadmap Near-Term "Cross-Service Dependency Visualization (multi-service dashboard follow-up)".

- **New** `buildDependencyGraph` + `renderDependencyGraphSection`. New types: `DependencyGraphNode`, `StepEdgeDetail`, `DependencyGraphEdge`, `DependencyGraphData`.
- **Pure server-rendered SVG** — zero new runtime dependencies. Layered Sugiyama-style layout with cubic bezier edges. Deterministic.
- **Filters** self-refs, unknown-service targets, and disabled consumer steps at aggregation. knownServices guard prevents layout crashes on service-unknown readiness.
- **Accessibility** — tabindex=0 on edges, nested `<title>`, `role=region` + `aria-live=polite` tooltip, textContent-only JS (zero innerHTML).
- **Defensive** — one service's malformed overlay does not crash the multi-service dashboard; pre-existing loadState fallback still renders the card.
- **Review discipline** — 4-round spec MMR + per-task 4-gate review (9 subagent-dispatched tasks) + 3-channel PR MMR. PR #<N>.
```

Replace `<N>` with `$PR_NUMBER` captured in Task 10.

ALSO delete the "Cross-Service Dependency Visualization" section under `## Near-Term Enhancements`.

- [ ] **Step 12.5: Commit + push + release-prep PR**

```bash
git add package.json package-lock.json CHANGELOG.md docs/roadmap.md
git commit -m "$(cat <<'EOF'
chore(release): v3.22.0 — cross-service dependency visualization

Bumps version, updates CHANGELOG and roadmap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin release/v3.22.0
gh pr create --title "chore(release): v3.22.0" --body "Release prep for v3.22.0 (cross-service dependency visualization, PR #$PR_NUMBER).

## Test plan
- [ ] CI green
- [ ] After merge: tag + GitHub release + verify npm + Homebrew publish

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Wait for CI green, then squash-merge:

```bash
gh pr checks --watch
RELEASE_PR=$(gh pr view --json number --jq '.number')
gh pr merge "$RELEASE_PR" --squash --delete-branch
```

- [ ] **Step 12.6: Tag + push tag + GitHub release**

```bash
git checkout main
git pull origin main
git tag -a v3.22.0 -m "v3.22.0 — cross-service dependency visualization"
git push origin v3.22.0
gh release create v3.22.0 --title "v3.22.0 — Cross-Service Dependency Visualization" --generate-notes
```

- [ ] **Step 12.7: Verify npm + Homebrew**

Wait ~5 minutes for the publish and Homebrew workflows to complete (they run automatically on tag push).

```bash
gh run list --limit 10
npm view @zigrivers/scaffold version
brew update && brew info scaffold | head -3
```

Expected:
- `npm view` returns `3.22.0`.
- `brew info scaffold` reflects `3.22.0`.

If npm publish failed with auth errors, check the trusted-publisher config in npm package settings — the workflow uses OIDC, not a `NPM_TOKEN` secret.

Users can now update via `npm update -g @zigrivers/scaffold` or `brew upgrade scaffold`.
