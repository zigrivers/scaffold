# Cross-Service Dependency Visualization Design

**Goal**: Add a service-level dependency graph section to the multi-service dashboard (`scaffold dashboard` on a monorepo with `services[]`), showing consumer→producer cross-reads as arrows between service nodes, with step-level detail surfaced via hover tooltips.

**Prerequisites**: v3.20.0 (Multi-Service Dashboard ships `buildMultiServiceTemplate` and `MultiServiceDashboardData`); v3.17.0 Wave 3c (cross-reads + exports + transitive resolver) + v3.18.0 (overlay cross-reads-overrides).

**Scope**: ~400 LOC production (new file + dashboard integration) + ~550 LOC tests. Ships as v3.22.0. Pure server-rendered SVG — no new runtime dependencies.

---

## Decisions locked during brainstorming (Q1–Q9)

1. **Edge granularity**: Service-level aggregate edges. One arrow per (consumer, producer) pair regardless of how many steps contribute.
2. **Rendering**: Server-rendered inline SVG + minimal JS tooltip. Zero new external deps.
3. **Layout**: Layered (Sugiyama-style, simplified). Upstream producers on the left, downstream consumers on the right.
4. **Arrow convention**: Consumer → producer. Matches "A depends on B" mental model.
5. **Transitive edges**: Direct only. Transitive chains are already visible step-by-step in `scaffold next`/`status`.
6. **Tooltip content**: Both endpoints explicit (`consumer:step -> producer:step`) with readiness status per pair.
7. **Empty graph**: Section omitted entirely — no "no dependencies" placeholder.
8. **Placement**: Above service cards, below phase indicators. Progressive disclosure from aggregate → per-service.
9. **Isolated services**: All services render as nodes even if they have no edges. Orphans placed at layer 0.

---

## Section 1 — Data shape

New types, colocated in `src/dashboard/generator.ts`:

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
  /** Readiness from CrossReadStatus taxonomy (src/core/assembly/cross-reads.ts:177). */
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

Extended `MultiServiceDashboardData`:

```typescript
export interface MultiServiceDashboardData {
  // ...existing fields (v3.20.0)...
  /** null when zero cross-service edges (graph section omitted per §4). */
  dependencyGraph: DependencyGraphData | null
}
```

**Type invariant**: `dependencyGraph` is `null` iff at least one of: (a) no services configured, (b) zero cross-service edges resolved. A populated `DependencyGraphData` has `nodes.length === services.length` (all services appear, §2.2) and `edges.length >= 1`.

---

## Section 2 — Graph construction

New file: `src/dashboard/dependency-graph.ts`. Single exported entry point, plus private helpers.

### 2.1 Entry point

```typescript
import type { ScaffoldConfig, ServiceConfig } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'
import { resolveCrossReadReadiness } from '../core/assembly/cross-reads.js'
import type {
  DependencyGraphData, DependencyGraphEdge, DependencyGraphNode, StepEdgeDetail,
} from './generator.js'

export interface BuildGraphInput {
  config: ScaffoldConfig
  projectRoot: string
  services: ServiceConfig[]
  /** Per-service resolved overlay. Key: service name. */
  perServiceOverlay: Map<string, OverlayState>
  /**
   * Optional: set of global step slugs to short-circuit readiness lookup for
   * cross-reads that incorrectly target global steps (spec §2.3 defense in
   * depth). Passed through to resolveCrossReadReadiness.
   */
  globalSteps?: Set<string>
}

export function buildDependencyGraph(input: BuildGraphInput): DependencyGraphData | null {
  const { services, perServiceOverlay, config, projectRoot, globalSteps } = input

  // Shared foreign-state cache across all readiness lookups in this call.
  // Matches the pattern used by next.ts / status.ts — avoids re-reading the
  // same foreign state.json once per edge.
  const readinessCache = new Map()

  // 1. Aggregate step-level cross-reads into service-level edges.
  const edgeMap = new Map<string, StepEdgeDetail[]>()  // key: `${consumer}|${producer}`
  for (const svc of services) {
    const overlay = perServiceOverlay.get(svc.name)
    if (!overlay) continue
    for (const [consumerStep, crossReads] of Object.entries(overlay.crossReads)) {
      for (const cr of crossReads) {
        if (cr.service === svc.name) continue  // Defensive: skip self-references.
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

  // 2. Build nodes for ALL services (Q9), compute layer.
  const nodes: DependencyGraphNode[] = services.map(svc => ({
    name: svc.name,
    projectType: svc.projectType,
    layer: 0,   // filled by assignLayers
    x: 0, y: 0, // filled by layoutGraph
  }))
  assignLayers(nodes, edgeMap)

  // 3. Build edges array (step detail already aggregated).
  const edges: DependencyGraphEdge[] = [...edgeMap.entries()].map(([key, steps]) => {
    const [consumer, producer] = key.split('|')
    return { consumer, producer, steps, svgPath: '' }  // svgPath filled by layoutGraph
  })

  // 4. Run layout.
  return layoutGraph(nodes, edges)
}
```

### 2.2 Node-set invariants

- `nodes.length === services.length` — every configured service appears as a node, even orphans (Q9). The `services[]` array is the source of truth for node identity; edges merely determine layer placement.
- Node ordering within `nodes` array: **same as `services` input order** (config-declared order). Deterministic; callers can rely on array index if needed.
- Node `layer` field: computed by `assignLayers`. Layer 0 = no upstream (includes orphans + pure producers). Monotonic — every edge from consumer at layer N goes to producer at layer M < N.

---

## Section 3 — Layout algorithm

All functions in the same file, private (non-exported).

### 3.1 `assignLayers` — longest-path topological sort

```typescript
/**
 * Assign `layer` to each node. Layer 0 = no upstream (orphans + root producers).
 * Uses longest-path: node.layer = 1 + max(layer of producers it consumes).
 *
 * Cycle handling: if Kahn-style pull leaves nodes unassigned, all cycle
 * participants get the current max layer. Deterministic, no failure.
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

### 3.2 `layoutGraph` — position nodes + compute edge paths

```typescript
const NODE_WIDTH = 140
const NODE_HEIGHT = 44
const LAYER_GAP = 80
const NODE_GAP = 16
const PADDING = 24

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

### 3.3 Readiness resolution

`resolveCrossReadReadiness` (in `src/core/assembly/cross-reads.ts:215`) already returns the exact 6-value `CrossReadStatus` taxonomy this feature needs. It's the same helper `scaffold next --service` and `status --service` use for identical text-mode diagnostics. The graph builder calls it inline (see §2.1 entry-point code); no wrapper needed.

Key properties inherited from `resolveCrossReadReadiness`:

- Returns one `{ service, step, status }` per input cross-read.
- Status values: `'completed' | 'pending' | 'not-bootstrapped' | 'read-error' | 'service-unknown' | 'not-exported'`.
- Accepts an optional `ForeignStateCacheEntry` cache — the builder passes a single cache shared across all edge lookups so each foreign state file is read at most once per graph build.
- Accepts `globalSteps` to short-circuit incorrect cross-reads targeting global steps (defense-in-depth per spec §2.3 of v3.17.0).

**No new resolver code, no helper wrapper, no deferred mapping.** The graph builder is a thin aggregation layer over existing infrastructure.

### 3.4 Properties

- **Deterministic** — alphabetical within-layer ordering + longest-path layers + fresh `foreignCache` per call. Same input bytes → same output bytes.
- **Zero layout libs** — ~80 LOC pure TS math; no d3, no graphviz, no external packages.
- **Cycle-safe** — cycle participants collapse to one layer, no infinite loop, no crash.
- **Readable at our scale** — 2-8 service nodes, typical 1-15 edges. Layered bezier curves rarely cross for acyclic graphs.
- **Responsive** — SVG `viewBox` with CSS `width: 100%` scales natively. `max-height: 420px` caps growth.

---

## Section 4 — Template rendering

Code in `src/dashboard/template.ts` — same zero-dep server-rendered HTML string concatenation as the rest of the file.

### 4.1 New helper

```typescript
function renderDependencyGraphSection(
  data: MultiServiceDashboardData['dependencyGraph'],
): string {
  if (!data) return ''
  return [
    '<section class="dep-graph" id="dep-graph">',
    '  <h2 class="dep-graph-title">Cross-Service Dependencies</h2>',
    `  <svg class="dep-graph-svg" viewBox="0 0 ${data.viewBox.width} ${data.viewBox.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cross-service dependency graph">`,
    '    <defs>',
    '      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">',
    '        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/>',
    '      </marker>',
    '    </defs>',
    renderEdges(data),
    renderNodes(data),
    '  </svg>',
    '</section>',
  ].join('\n')
}
```

### 4.2 Edge rendering — hit target + visible path + native `<title>` fallback

```typescript
function renderEdges(data: DependencyGraphData): string {
  return data.edges.map(edge => {
    const tooltipLines = edge.steps.map(s =>
      `${edge.consumer}:${s.consumerStep} -> ${edge.producer}:${s.producerStep} (${s.status})`
    )
    const titleText = escapeHtml(tooltipLines.join('\n'))
    const edgeId = `edge-${escapeHtml(edge.consumer)}-to-${escapeHtml(edge.producer)}`
    const stepsJson = escapeHtml(JSON.stringify(edge.steps))
    return [
      `    <g class="dep-edge" data-edge-id="${edgeId}" data-consumer="${escapeHtml(edge.consumer)}" data-producer="${escapeHtml(edge.producer)}" data-steps="${stepsJson}">`,
      `      <title>${titleText}</title>`,
      `      <path class="dep-edge-hit" d="${edge.svgPath}" stroke="transparent" stroke-width="14" fill="none" pointer-events="stroke"/>`,
      `      <path class="dep-edge-line" d="${edge.svgPath}" stroke="currentColor" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`,
      '    </g>',
    ].join('\n')
  }).join('\n')
}
```

`<title>` inside `<g>` is browser-native accessibility + tooltip. JS tooltip (§4.5) enhances with styled positioning; the native fallback still works with JS disabled.

### 4.3 Node rendering

```typescript
function renderNodes(data: DependencyGraphData): string {
  return data.nodes.map(n => [
    `    <g class="dep-node" data-service="${escapeHtml(n.name)}" transform="translate(${n.x}, ${n.y})">`,
    `      <rect class="dep-node-box" width="140" height="44" rx="6"/>`,
    `      <text class="dep-node-name" x="70" y="20" text-anchor="middle">${escapeHtml(n.name)}</text>`,
    `      <text class="dep-node-type" x="70" y="36" text-anchor="middle">${escapeHtml(n.projectType)}</text>`,
    '    </g>',
  ].join('\n')).join('\n')
}
```

### 4.4 CSS

Added to the existing `<style>` block inside `buildMultiServiceTemplate`:

```css
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
.dep-edge-line { transition: stroke-width 0.1s ease; }
.dep-edge:hover .dep-edge-line { stroke: var(--accent); stroke-width: 2; }

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
.dep-tooltip-status-pending { color: var(--status-in-progress); }
.dep-tooltip-status-not-bootstrapped,
.dep-tooltip-status-read-error,
.dep-tooltip-status-service-unknown,
.dep-tooltip-status-not-exported { color: var(--status-pending); }
```

All colors reference existing `--*` tokens from the dashboard theme (consistent with design-system.md).

### 4.5 JS tooltip enhancement

Added to the existing `<script>` block at the bottom of `buildMultiServiceTemplate`. **Uses DOM APIs exclusively — no `innerHTML` writes anywhere.** Dynamic content is set via `textContent` only, so attacker-controlled strings never reach the HTML parser:

```javascript
(function(){
  var edges = document.querySelectorAll('.dep-edge');
  if (edges.length === 0) return;
  var tooltip = document.createElement('div');
  tooltip.className = 'dep-tooltip';
  document.body.appendChild(tooltip);

  function clearTooltip() {
    // Drain children via DOM API — no innerHTML writes.
    while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
  }

  edges.forEach(function(edge) {
    // Remove native <title> so the SVG default tooltip doesn't duplicate ours.
    var titleEl = edge.querySelector('title');
    if (titleEl) titleEl.remove();

    edge.addEventListener('mouseenter', function() {
      var consumer = edge.getAttribute('data-consumer');
      var producer = edge.getAttribute('data-producer');
      var stepsJson = edge.getAttribute('data-steps');
      var steps;
      try { steps = JSON.parse(stepsJson); } catch(_) { return; }
      clearTooltip();
      steps.forEach(function(s) {
        var row = document.createElement('div');
        // Status is a fixed 6-value enum (§3.3). The className concatenation is
        // enum-bounded; textContent holds all attacker-influenced substrings.
        row.className = 'dep-tooltip-row dep-tooltip-status-' + s.status;
        row.textContent = consumer + ':' + s.consumerStep
          + ' -> ' + producer + ':' + s.producerStep
          + ' (' + s.status + ')';
        tooltip.appendChild(row);
      });
      tooltip.classList.add('visible');
    });
    edge.addEventListener('mousemove', function(e) {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY + 12) + 'px';
    });
    edge.addEventListener('mouseleave', function() {
      tooltip.classList.remove('visible');
    });
  });
})();
```

**Security rationale**:
- Zero `innerHTML` writes. Clearing uses a `firstChild`/`removeChild` loop.
- All attacker-influenced content (service names, step slugs) flows through `textContent`, which never parses HTML.
- `className` concatenates a fixed enum value (`s.status`), not free-form user input. If `JSON.parse` ever produced a rogue `status`, it would still land in a class name, not in a scriptable context.
- `JSON.parse` failures are swallowed by the `try/catch` — failure mode is "no tooltip," never execution.

### 4.6 Integration into `buildMultiServiceTemplate`

One new line in the existing template string, placed between the phase-indicator row and the service-card grid:

```typescript
${renderDependencyGraphSection(data.dependencyGraph)}
```

---

## Section 5 — Dashboard command integration

### 5.1 `dashboard.ts` wiring

Multi-service branch already loads per-service pipelines + states. Add graph build between state loading and `generateMultiServiceDashboardData`:

```typescript
// src/cli/commands/dashboard.ts — multi-service branch
import { buildDependencyGraph } from '../../dashboard/dependency-graph.js'

// ...existing loop producing servicePipelines + serviceStates...

const perServiceOverlay = new Map<string, OverlayState>()
for (const svc of config.project!.services!) {
  const pipeline = servicePipelines.get(svc.name)
  if (pipeline) perServiceOverlay.set(svc.name, pipeline.overlay)
}

const dependencyGraph = buildDependencyGraph({
  config,
  projectRoot,
  services: config.project!.services!,
  perServiceOverlay,
  globalSteps,  // already in scope — computed elsewhere in dashboard.ts for the same reason next/status use it
})

const dashboardData = generateMultiServiceDashboardData({
  services: serviceSummaries,
  methodology,
  dependencyGraph,  // NEW — null if no edges
})
```

### 5.2 Generator change

`generateMultiServiceDashboardData` picks up one optional input:

```typescript
export interface MultiServiceGeneratorOptions {
  // ...existing fields...
  dependencyGraph?: DependencyGraphData | null
}

export function generateMultiServiceDashboardData(
  opts: MultiServiceGeneratorOptions,
): MultiServiceDashboardData {
  return {
    // ...existing assembly...
    dependencyGraph: opts.dependencyGraph ?? null,
  }
}
```

Optional input preserves source compatibility with existing tests that don't pass `dependencyGraph` (they get `null`, section omitted in template).

### 5.3 No changes in

- `src/core/pipeline/resolver.ts` — `resolvePipeline` already produces populated `overlay.crossReads` (since v3.18.0).
- `src/core/assembly/cross-reads.ts` — `resolveDirectCrossRead` used as-is. No API widening.
- Single-service dashboard path (`buildTemplate`, `generateDashboardData`) — graph is multi-service-only; single-service dashboards render unchanged.
- `src/types/dependency.ts` — `crossDependencies` on `DependencyNode` remains (used by `next`/`status`); graph builder doesn't consume it.

### 5.4 Data flow

```
config + metaPrompts
    |
resolvePipeline(ctx, { serviceId: svc.name }) x N services       [v3.17.0 Wave 3b flow]
    |
    v populates pipeline.overlay.crossReads per service          [v3.18.0 cross-reads-overrides]
buildDependencyGraph(perServiceOverlay, ...)                     [NEW — §2]
    |
    v aggregates step cross-reads into service-level edges
    v runs assignLayers + layoutGraph                            [§3]
generateMultiServiceDashboardData({ ..., dependencyGraph })      [§5.2]
    |
    v
buildMultiServiceTemplate(dataJson, data)
    v calls renderDependencyGraphSection(data.dependencyGraph)   [§4.1]
    v renders SVG <section>
HTML output
```

One read-side entry (`buildDependencyGraph`), one render-side entry (`renderDependencyGraphSection`). Both pure, both null-safe.

---

## Section 6 — Testing plan

### 6.1 Unit — `src/dashboard/dependency-graph.test.ts` (new)

Pure graph builder. Construct `OverlayState` objects inline (no filesystem, no fixtures):

1. Empty cross-reads across all services → returns `null`.
2. Single edge: `web` consumes `api:create-prd` → 1 edge, 2 nodes, `api` at layer 0, `web` at layer 1.
3. Multi-step aggregation: `web` has two steps each cross-reading different `api` steps → one edge with two `StepEdgeDetail` entries.
4. Three-layer chain: `web -> api -> shared-lib` → layers 0, 1, 2 assigned correctly.
5. Orphan service: 4 services, 1 with no edges → all 4 nodes present, orphan at layer 0, no edges touch it.
6. Cycle: `A <-> B` → both same layer (deterministic), edges in both directions, no crash.
7. Readiness threads from `resolveDirectCrossRead` → completed/pending/not-bootstrapped propagate to `StepEdgeDetail.status`.
8. Deterministic: same input twice → identical x/y + identical SVG paths.
9. viewBox dimensions scale with layer count (width) and tallest-layer node count (height).
10. Self-reference guard: edge from `svc -> svc` filtered (defensive).

### 6.2 Template — `src/dashboard/multi-service.test.ts` (append to existing file)

11. `renderDependencyGraphSection(null)` returns `''`.
12. Small graph: output contains `<section class="dep-graph">` with expected viewBox.
13. Escapes service names with special characters (`<`, `>`, `&`, `"`) using existing `escapeHtml`.
14. `data-steps` attribute contains JSON-parseable step details — parse back + assert.
15. Output includes `<marker id="arrow">` for arrowheads.
16. Each edge has both hit-target path AND visible path.

### 6.3 E2E — `src/e2e/dashboard-cross-service-graph.test.ts` (new)

Fixture: 3-service monorepo (`api` backend, `web` web-app, `shared-lib` library), one cross-read from `web:implementation-plan -> api:create-prd`. Hoisted `vi.mock` pattern from `service-execution.test.ts`.

17. Multi-service config with real cross-reads → HTML contains `<section class="dep-graph">`.
18. Multi-service config with zero cross-reads → HTML does NOT contain `class="dep-graph"`.
19. Edge's `data-steps` contains expected consumer/producer step pairs.
20. Orphan service → appears as node in graph even with no edges (Q9 invariant at E2E level).

### 6.4 Visual (Playwright)

**Manual only in v1.** Follow the existing `make dashboard-test` + Playwright MCP workflow in `CLAUDE.md` to verify dark/light mode, desktop/mobile, and the graph hover interaction. No automated pixel-diff tests — layout determinism is locked by test #8.

### 6.5 Assertion style

- Exact `.toEqual` for arrays (no `.toContain` for ordering-sensitive assertions).
- SVG path strings: exact string match (layout is deterministic).
- Status enum: exact literal match, never `.includes`.

### 6.6 Scope totals

| Artifact | LOC |
|---|---|
| dependency-graph.ts (production) | ~200 |
| generator.ts changes (types + option) | ~30 |
| template.ts changes (section + CSS + JS) | ~150 |
| dashboard.ts wiring | ~20 |
| **Production total** | **~400** |
| dependency-graph.test.ts | ~250 |
| multi-service.test.ts additions | ~120 |
| dashboard-cross-service-graph.test.ts | ~180 |
| **Test total** | **~550** |

---

## Section 7 — Out of scope

Explicitly deferred to future work. Each entry is a valid extension but intentionally excluded from v3.22.0 to keep the diff small and the contract simple.

1. **Step-level graph view (Q1 option b).** A node per step, cross-service edges explicitly drawn. Useful for detailed dependency tracing but visually dense for non-trivial monorepos.
2. **Drilldown interactivity (Q1 option c).** Click a service node to expand into its step-level edges. Requires client-side state and view switching.
3. **Transitive edges (Q5 option b).** Show the full upstream closure, not just direct edges. Conflicts with layered layout cleanliness.
4. **Empty-graph placeholder (Q7 option b).** A "no cross-service dependencies" label. Adds noise for a common case.
5. **Automated Playwright visual-regression tests.** Existing dashboard tests are also manual — adding pixel-diff tooling is a separate infrastructure change.
6. **Graph export (PNG/SVG download button).** Useful for docs, but out of the current dashboard contract.
7. **Animated layout transitions.** No moving state to animate in a static HTML dashboard.

---

## Section 8 — Migration / backward compatibility

### 8.1 Config compat

No config schema changes. `services[]`, `exports`, and `crossReads` are all pre-existing (v3.17.0). This feature is pure read/visualization.

### 8.2 Dashboard output compat

- **Single-service dashboards** (`buildTemplate`): byte-identical output to v3.21.0. No changes.
- **Multi-service dashboards with zero cross-service edges**: the new `<section class="dep-graph">` is absent from output. Everything else byte-identical to v3.21.0.
- **Multi-service dashboards with edges**: one new `<section>` appears between phase indicators and service cards. Existing sections' DOM positions unchanged; any integrator relying on `.service-card` selectors continues to work.

### 8.3 API compat

- `MultiServiceDashboardData` gains one optional field (`dependencyGraph: DependencyGraphData | null`). Extending a returned data shape with a new field is TypeScript-compatible — existing consumers ignore it.
- `MultiServiceGeneratorOptions` gains one optional input field. Existing callers that don't pass `dependencyGraph` continue to work unchanged (receive `null` on the output).

### 8.4 Deprecations

None.

---

## Section 9 — Release

Ships as **v3.22.0**. Follow the standard release workflow (`docs/architecture/operations-runbook.md`):

1. Feature PR: `feat(dashboard): cross-service dependency graph (v3.22.0)`
2. 3-channel PR MMR (Codex + Gemini + Claude compensating), fix all P0/P1/P2 findings.
3. Merge feature PR on `pass` or `degraded-pass`.
4. Release-prep branch: bump `package.json`/`package-lock.json` to 3.22.0, append feature PR number to roadmap v3.22.0 entry, CHANGELOG entry.
5. Merge release-prep PR after CI green.
6. Tag `v3.22.0`, push tag, create GitHub release.
7. Verify `npm view @zigrivers/scaffold version` returns `3.22.0` and `brew info scaffold` reflects `3.22.0`.
