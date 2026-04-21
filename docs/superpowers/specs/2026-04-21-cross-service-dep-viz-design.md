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
  /**
   * Optional. null or absent when zero cross-service edges exist (graph
   * section omitted per §4). Optional (not required-nullable) preserves
   * source compatibility with existing hand-written literals in
   * src/dashboard/multi-service.test.ts etc.
   */
  dependencyGraph?: DependencyGraphData | null
}
```

**Type invariant**: `dependencyGraph` is absent (`undefined`) or `null` iff at least one of: (a) no services configured, (b) zero cross-service edges resolved after filtering. A populated `DependencyGraphData` has `nodes.length === services.length` (all services appear, §2.2) and `edges.length >= 1`.

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

  // Service-name set — used to filter edges pointing to services not in config
  // (resolveCrossReadReadiness returns `service-unknown` for these; we must
  // drop them BEFORE building edgeMap because layoutGraph later does
  // byName.get(producer)! which would crash on unknown producers).
  const knownServices = new Set(services.map(s => s.name))

  // Shared foreign-state cache across all readiness lookups in this call.
  // Matches the pattern used by next.ts / status.ts — avoids re-reading the
  // same foreign state.json once per edge.
  // Type is not exported from cross-reads.ts; inference from resolveCrossReadReadiness
  // signature suffices. (Alternative: export `ForeignStateCacheEntry` — future refactor.)
  const readinessCache = new Map()

  // 1. Aggregate step-level cross-reads into service-level edges.
  //    Filter rules (applied at aggregation time so invalid edges never enter
  //    layout/rendering):
  //      (a) skip self-references (cr.service === svc.name) — defensive
  //      (b) skip cross-reads whose target service is not in config (would
  //          produce `service-unknown` readiness and crash layoutGraph)
  //      (c) skip cross-reads declared on DISABLED consumer steps — the graph
  //          reflects the active pipeline; disabled steps never run, so their
  //          declared cross-reads are not real dependencies for users reading
  //          the dashboard. Matches what scaffold next/status surface.
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

  // 2. Build nodes for ALL services (Q9), compute layer.
  const nodes: DependencyGraphNode[] = services.map(svc => ({
    name: svc.name,
    projectType: svc.projectType,
    layer: 0,   // filled by assignLayers
    x: 0, y: 0, // filled by layoutGraph
  }))
  assignLayers(nodes, edgeMap)

  // 3. Build edges array (step detail already aggregated). Sort explicitly by
  //    `consumer|producer` so SVG z-order is deterministic across runs — Map
  //    iteration preserves insertion order, which depends on Object.entries
  //    ordering of `overlay.crossReads`, which depends on services[] ordering
  //    upstream. Explicit sort breaks that implicit coupling and keeps test #8
  //    (deterministic output) honest.
  const edges: DependencyGraphEdge[] = [...edgeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, steps]) => {
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
- Node `layer` field: computed by `assignLayers`. Layer 0 = no upstream (includes orphans + pure producers). **Mostly-monotonic**: for acyclic graphs, every edge from consumer at layer N targets producer at layer M < N. For cycles (A ↔ B), participants share the same layer (§3.1), so edges between them satisfy M == N. Same-layer edges render as cubic beziers with control points offset horizontally (§3.2) — visually a shallow arc between siblings, which is awkward but honest. Cycles are discouraged in config; this is a graceful failure mode.
- Edges in `edges` array: all satisfy `knownServices.has(consumer) && knownServices.has(producer)` after §2.1's filtering, so `byName.get(edge.producer)` never returns `undefined` at layout time.

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

Constants are **exported** from `dependency-graph.ts` and imported by `template.ts` (§4.3) so node dimensions live in exactly one place. A future "make nodes wider" change edits one file.

```typescript
export const NODE_WIDTH = 140
export const NODE_HEIGHT = 44
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

- **Deterministic** — alphabetical within-layer ordering + longest-path layers + explicit edge sort by `consumer|producer` + fresh `foreignCache` per call. Same input bytes → same output bytes (including SVG z-order).
- **Zero layout libs** — ~80 LOC pure TS math; no d3, no graphviz, no external packages.
- **Cycle-safe** — cycle participants collapse to one layer, no infinite loop, no crash.
- **Cycle cascade limitation** — when a graph contains both a cycle AND nodes strictly downstream of the cycle (e.g., `root → A ↔ B → leaf`), the downstream nodes get lumped into the cycle layer alongside `A` and `B` instead of receiving their own strictly-downstream layer. This is a known limitation of the simplified layered algorithm (full SCC analysis would avoid it but triples the code size). Users are discouraged from creating cycles in config; if they do, the graph still renders honestly. §6.1 test 6 documents the expected behavior.
- **Readable at our scale** — 2-8 service nodes, typical 1-15 edges. Layered bezier curves rarely cross for acyclic graphs.
- **Responsive** — SVG `viewBox` with CSS `width: 100%` scales natively. `max-height: 420px` caps growth.

---

## Section 4 — Template rendering

Code in `src/dashboard/template.ts` — same zero-dep server-rendered HTML string concatenation as the rest of the file.

### 4.1 New helper

**Exported** from `src/dashboard/template.ts` for direct unit testability (see §6.2 tests 14–20). Consumer callers are internal to the dashboard pipeline; exporting doesn't widen the public API because `template.ts` isn't re-exported from `src/index.ts`.

```typescript
export function renderDependencyGraphSection(
  data: MultiServiceDashboardData['dependencyGraph'],
): string {
  if (!data) return ''
  return [
    '<section class="dep-graph" id="dep-graph">',
    '  <h2 class="dep-graph-title">Cross-Service Dependencies</h2>',
    // Do NOT use role="img" here — it flattens the accessibility tree and
    // suppresses descendant <title> elements in many AT combinations. The
    // native SVG accessibility model (SVG2/SVG AAM) handles focusable
    // descendants with <title> children correctly without an explicit role.
    // `aria-label` on the outer <svg> names the whole graph for intro context;
    // each edge's <title> names the individual relationship on focus/hover.
    `  <svg class="dep-graph-svg" viewBox="0 0 ${data.viewBox.width} ${data.viewBox.height}" xmlns="http://www.w3.org/2000/svg" aria-label="Cross-service dependency graph">`,
    '    <defs>',
    // marker-end only — `orient="auto"` matches the actual usage (no marker-start).
    // Fill set via currentColor; CSS hover rules (§4.4) update `color` alongside
    // `stroke` so the arrowhead re-colors in sync with the line.
    '      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">',
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
    const stepsJson = escapeHtml(JSON.stringify(edge.steps))
    return [
      `    <g class="dep-edge" data-consumer="${escapeHtml(edge.consumer)}" data-producer="${escapeHtml(edge.producer)}" data-steps="${stepsJson}" tabindex="0">`,
      // <title> is the accessible name for screen readers AND the no-JS
      // tooltip fallback. The JS tooltip (§4.5) overlays it on hover — the
      // native title has a ~1s delay so the overlap isn't user-visible. We do
      // NOT remove the <title> in JS (keeping it preserves accessibility).
      `      <title>${titleText}</title>`,
      `      <path class="dep-edge-hit" d="${edge.svgPath}" stroke="transparent" stroke-width="14" fill="none" pointer-events="stroke"/>`,
      `      <path class="dep-edge-line" d="${edge.svgPath}" stroke="currentColor" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`,
      '    </g>',
    ].join('\n')
  }).join('\n')
}
```

`<title>` inside `<g>` is both the SVG accessible name AND the no-JS hover fallback. The JS tooltip (§4.5) does NOT strip it; the two coexist. `tabindex="0"` makes each edge keyboard-focusable so screen-reader users can explore the graph without a pointer.

### 4.3 Node rendering

Imports the node-dimension constants from `dependency-graph.ts` (exported per §3.2) — single source of truth for box/text positioning:

```typescript
import { NODE_WIDTH, NODE_HEIGHT } from './dependency-graph.js'

const HALF_W = NODE_WIDTH / 2
const NAME_BASELINE = 20     // visually-centered baseline for name row
const TYPE_BASELINE = NODE_HEIGHT - 8  // bottom row

function renderNodes(data: DependencyGraphData): string {
  return data.nodes.map(n => [
    `    <g class="dep-node" data-service="${escapeHtml(n.name)}" transform="translate(${n.x}, ${n.y})">`,
    `      <rect class="dep-node-box" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="6"/>`,
    `      <text class="dep-node-name" x="${HALF_W}" y="${NAME_BASELINE}" text-anchor="middle">${escapeHtml(n.name)}</text>`,
    `      <text class="dep-node-type" x="${HALF_W}" y="${TYPE_BASELINE}" text-anchor="middle">${escapeHtml(n.projectType)}</text>`,
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
/* Animate all three properties so color + stroke + width change as one
   motion. Without `color, stroke`, the marker fill (fed by currentColor)
   jumps instantly while width fades — looks like the arrowhead pops. */
.dep-edge { transition: color 0.1s ease; }
.dep-edge-line { transition: stroke 0.1s ease, stroke-width 0.1s ease; }
/* `color: var(--accent)` propagates through `currentColor` to the arrowhead
   marker fill — without this, the line re-colors on hover but the marker
   stays `--muted`, which visually breaks the arrow. */
.dep-edge:hover,
.dep-edge:focus-visible {
  color: var(--accent);
}
.dep-edge:hover .dep-edge-line,
.dep-edge:focus-visible .dep-edge-line {
  stroke: var(--accent); stroke-width: 2;
}

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

/* Status severity grouping:
 *   success → completed
 *   in-flight → pending, not-bootstrapped (legitimate upstream-not-yet-done)
 *   config-error → service-unknown, not-exported, read-error (user action required)
 * Keeping three color buckets (not six) avoids overloading the user with
 * similar-but-different hues. */
.dep-tooltip-status-completed { color: var(--status-completed); }
.dep-tooltip-status-pending,
.dep-tooltip-status-not-bootstrapped { color: var(--status-in-progress); }
.dep-tooltip-status-read-error,
.dep-tooltip-status-service-unknown,
.dep-tooltip-status-not-exported {
  /* Reuse the stale-notice text token for config errors — consistent with
     the stale banner which already signals "action needed" in this theme. */
  color: var(--stale-text);
}
```

All colors reference existing `--*` tokens from the dashboard theme (consistent with design-system.md).

### 4.5 JS tooltip enhancement

Added to the existing `<script>` block at the bottom of `buildMultiServiceTemplate`. **Uses DOM APIs exclusively — no `innerHTML` writes anywhere.** Dynamic content is set via `textContent` only, so attacker-controlled strings never reach the HTML parser.

Enhancements over the v1 draft (addressing accessibility + viewport clipping):
- Keeps the native `<title>` on each edge — does NOT strip it. The JS tooltip and the native SVG title tooltip coexist without user-visible double-display (native tooltip has ~1s delay).
- Adds `focusin`/`focusout` handlers so keyboard users triggering the edge via Tab (each `<g>` has `tabindex="0"`) get the same tooltip experience.
- Clamps `left`/`top` against `window.innerWidth`/`innerHeight` so the tooltip doesn't scroll off-screen when hovering near the edge of the viewport.
- `role="region"` + `aria-live="polite"` on the tooltip div announces step-level detail to screen readers when the tooltip appears.

```javascript
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
      // Status is a fixed 6-value enum (§3.3). The className concatenation is
      // enum-bounded; textContent holds all attacker-influenced substrings.
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
    var MAX_W = 370;  // matches .dep-tooltip max-width + border
    var MAX_H = 200;  // pessimistic — most tooltips shorter
    var left = Math.min(x + MARGIN, window.innerWidth - MAX_W);
    var top = Math.min(y + MARGIN, window.innerHeight - MAX_H);
    tooltip.style.left = Math.max(0, left) + 'px';
    tooltip.style.top = Math.max(0, top) + 'px';
  }

  edges.forEach(function(edge) {
    edge.addEventListener('mouseenter', function() { showTooltip(edge); });
    edge.addEventListener('mousemove', function(e) { positionTooltip(e.clientX, e.clientY); });
    edge.addEventListener('mouseleave', hideTooltip);
    // Keyboard users: focusin/focusout + position to edge's rect center.
    edge.addEventListener('focusin', function() {
      showTooltip(edge);
      var rect = edge.getBoundingClientRect();
      positionTooltip(rect.right, rect.top);
    });
    edge.addEventListener('focusout', hideTooltip);
  });

  // Dismiss tooltip on page scroll — the tooltip uses position: fixed so it
  // stays pinned while the edge it describes scrolls away. Hiding is simpler
  // and clearer than trying to keep it pinned to a moving target.
  window.addEventListener('scroll', hideTooltip, { passive: true });
})();
```

**Security rationale**:
- Zero `innerHTML` writes. Clearing uses a `firstChild`/`removeChild` loop.
- All attacker-influenced content (service names, step slugs) flows through `textContent`, which never parses HTML.
- `className` concatenates a fixed enum value (`s.status`), not free-form user input. If `JSON.parse` ever produced a rogue `status`, it would still land in a class name, not in a scriptable context.
- `JSON.parse` failures are swallowed by the `try/catch` — failure mode is "no tooltip," never execution.

**Accessibility rationale**:
- `<title>` preserved on each edge — screen readers announce it when the edge gets focus/hover (fallback when JS tooltip fails to render).
- `aria-live="polite"` on the tooltip div — screen readers announce new detail content without interrupting other speech.
- `tabindex="0"` on each edge `<g>` (§4.2) enables Tab-based traversal of the graph.
- `focusin`/`focusout` parity with mouse events — keyboard users get identical tooltip UX.

### 4.6 Integration into `buildMultiServiceTemplate`

**Exact insertion point**: the `<section class="dep-graph">` is a **sibling** of the existing `.aggregate-block` (which holds phase indicators) and `.services-grid`, NOT a child of `.aggregate-block`. Place the call **after** `.aggregate-block`'s closing `</div>` and **before** `.services-grid`'s opening `<div>`:

```typescript
// Pseudocode — match existing template.ts indentation + string-concat style.
//
// ...existing lines rendering the aggregate-block close...
`</div>  <!-- /.aggregate-block -->`,
${renderDependencyGraphSection(data.dependencyGraph)},   // NEW — sibling block
`<div class="services-grid">`,
// ...existing lines rendering service cards...
```

The sibling placement keeps DOM hierarchy flat and matches the `margin: 0 0 24px` spacing in §4.4 CSS (which assumes block-level siblings with uniform vertical rhythm, not nested padding).

---

## Section 5 — Dashboard command integration

### 5.1 `dashboard.ts` wiring

**Current state in the multi-service branch** (pre-feature, as of v3.21.0): the branch iterates `configuredServices`, instantiates `StateManager` per service, and calls `loadState()` to populate `loadedServices[]` for the generator. It does NOT currently call `loadPipelineContext` or `resolvePipeline` — those helpers exist elsewhere but dashboard has historically only needed state, not resolved overlays.

**New work this feature introduces**: add one `loadPipelineContext` call (shared across services) and one `resolvePipeline(context, { serviceId })` call per service to capture the resolved overlay (which contains `crossReads`) and `globalSteps`. `globalSteps` is identical across per-service resolutions (derived from the multi-service structural overlay at `resolver.ts:108-120`, not from per-service config), so we can capture it from any one pipeline — we take the first:

```typescript
// src/cli/commands/dashboard.ts — multi-service branch
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { buildDependencyGraph } from '../../dashboard/dependency-graph.js'
import type { OverlayState } from '../../core/assembly/overlay-state-resolver.js'

// ... existing `isMultiServiceMode` guard ...

// NEW: load pipeline context once (shared across all services).
// `includeTools: false` (the default) — tool meta-prompts are not pipeline
// participants, and their `crossReads` declarations (if any) would leak into
// the graph via overlay.crossReads. Keep the graph pipeline-scoped.
const pipelineContext = loadPipelineContext(projectRoot)

// NEW: per-service overlay map populated alongside the existing loadedServices loop.
const perServiceOverlay = new Map<string, OverlayState>()
let capturedGlobalSteps: Set<string> | undefined

// Existing loop over `configuredServices!` — add resolvePipeline alongside the state load.
// (Keep the existing state-loading logic verbatim; just interleave the graph data capture.)
for (const svc of configuredServices!) {
  // NEW: resolve pipeline per service to get overlay.crossReads + globalSteps.
  // Wrap in try/catch mirroring the existing loadState() fallback pattern — a
  // malformed overlay for one service should not crash the whole multi-service
  // dashboard. On failure we skip this service's graph contribution; its card
  // still renders because the state-load block below has its own fallback.
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
    // Continue to state-load block; this service's card still renders.
    // Note: incoming edges (other services cross-reading INTO this service)
    // are still built during their own iterations because knownServices still
    // includes this service — only outgoing edges from this service's own
    // step crossReads are missing.
  }

  // Existing state-loading block (unchanged) — populates loadedServices.
  // ...
}

// NEW: build the graph (returns null if no edges after filtering).
const dependencyGraph = buildDependencyGraph({
  config,
  projectRoot,
  services: configuredServices!,
  perServiceOverlay,
  globalSteps: capturedGlobalSteps,
})

// Existing call — now threads dependencyGraph. loadedServices shape unchanged.
// dependencyGraph is `null` if buildDependencyGraph found zero edges after
// filtering (§2.1); the generator passes it through and the template omits
// the section (§4.1).
const dashboardData = generateMultiServiceDashboardData({
  services: loadedServices,
  methodology,
  dependencyGraph,  // NEW — null if no edges
})
```

Performance note: `resolvePipeline` is called N times (once per service). For the target scale (2-8 services) this is sub-second. At larger scale, it would become a candidate for caching — not in v1 scope.

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
    dependencyGraph: opts.dependencyGraph ?? null,  // normalize undefined -> null
  }
}
```

**null/undefined contract** (locked to avoid inconsistency — the spec initially had three different framings):
- **Input (`MultiServiceGeneratorOptions.dependencyGraph`)**: optional-nullable. Callers may omit the field (`undefined`), pass `null`, or pass a populated `DependencyGraphData`.
- **Output (`MultiServiceDashboardData.dependencyGraph`)**: the generator always normalizes to `null | DependencyGraphData` — `undefined` is never written. This matches the type's optional-nullable declaration and keeps consumer code simple (single branch: `if (data.dependencyGraph) { ... }` handles both "never set" and "explicitly absent").
- **Type declarations**: both kept optional-nullable (`?: T | null`) to preserve source compatibility with existing hand-written literals that don't supply the field.

Optional input + normalized null output preserves source compatibility with existing tests that don't pass `dependencyGraph` (they get `null` on the output, section omitted in template).

### 5.3 No changes in

- `src/core/pipeline/resolver.ts` — `resolvePipeline` already produces populated `overlay.crossReads` (since v3.18.0).
- `src/core/assembly/cross-reads.ts` — `resolveDirectCrossRead` used as-is. No API widening.
- Single-service dashboard path (`buildTemplate`, `generateDashboardData`) — graph is multi-service-only; single-service dashboards render unchanged.
- `src/types/dependency.ts` — `crossDependencies` on `DependencyNode` remains (used by `next`/`status`); graph builder doesn't consume it.

### 5.4 Data flow

Square-bracket annotations: `[NEW]` = introduced by this feature in the dashboard path; `[existing since vX.Y.Z]` = pre-existing machinery the feature reuses without modification.

```
config + metaPrompts
    |
loadPipelineContext(projectRoot)                                 [NEW — dashboard.ts never called this before; §5.1]
    |
resolvePipeline(ctx, { serviceId: svc.name }) x N services       [NEW in dashboard path — helper existing since v3.17.0 Wave 3b]
    |
    v populates pipeline.overlay.crossReads per service          [overlay machinery existing since v3.18.0]
buildDependencyGraph(perServiceOverlay, ...)                     [NEW — §2]
    |
    v filters self-refs, unknown-service targets, disabled steps [NEW — §2.1]
    v aggregates step cross-reads into service-level edges
    v runs assignLayers + layoutGraph                            [NEW — §3]
generateMultiServiceDashboardData({ ..., dependencyGraph })      [existing since v3.20.0; gains optional dependencyGraph input in §5.2]
    |
    v
buildMultiServiceTemplate(dataJson, data)                        [existing since v3.20.0]
    v calls renderDependencyGraphSection(data.dependencyGraph)   [NEW — §4.1]
    v renders SVG <section>
HTML output
```

One read-side entry (`buildDependencyGraph`), one render-side entry (`renderDependencyGraphSection`). Both pure, both null-safe.

---

## Section 6 — Testing plan

### 6.1 Unit — `src/dashboard/dependency-graph.test.ts` (new)

Graph builder tests. The builder calls `resolveCrossReadReadiness` which touches the filesystem (foreign state.json reads), so tests use hoisted `vi.mock('../core/assembly/cross-reads.js', ...)` to stub the helper with deterministic return values per test. Same pattern as `overlay-state-resolver.test.ts` mocks for `discoverMetaPrompts`.

Mock shape (one-liner per test):
```typescript
vi.mocked(resolveCrossReadReadiness).mockReturnValue([
  { service: 'api', step: 'create-prd', status: 'completed' },
])
```

When a test needs varied statuses across multiple per-edge calls (e.g. test #7 exercising all five reachable statuses), use `mockImplementation` that returns a status based on `cr.step` or `cr.service`, rather than `mockReturnValue` which returns the same array for every call:

```typescript
vi.mocked(resolveCrossReadReadiness).mockImplementation(([cr]) => [{
  ...cr,
  status: cr.step === 'create-prd' ? 'completed' : 'pending',
}])
```

`OverlayState` objects are constructed inline — no fixtures. `services[]` is a plain array of `{ name, projectType }` — enough for the builder.

Tests:

1. Empty cross-reads across all services → returns `null`.
2. Single edge: `web` consumes `api:create-prd` → 1 edge, 2 nodes, `api` at layer 0, `web` at layer 1.
3. Multi-step aggregation: `web` has two steps each cross-reading different `api` steps → one edge with two `StepEdgeDetail` entries.
4. Three-layer chain: `web -> api -> shared-lib` → layers 0, 1, 2 assigned correctly.
5. Orphan service: 4 services, 1 with no edges → all 4 nodes present, orphan at layer 0, no edges touch it.
6. Cycle: `A <-> B` → both same layer (deterministic), edges in both directions, no crash. `nodes.length === 2`, `edges.length === 2`.
7. Readiness threads from **`resolveCrossReadReadiness`** (not `resolveDirectCrossRead`): the helper is mocked to return specific statuses. Assert `StepEdgeDetail.status` matches each of the **five statuses that CAN reach a graph edge**: `completed`, `pending`, `not-bootstrapped`, `read-error`, `not-exported`. The sixth status (`service-unknown`) CANNOT appear on any edge because §2.1's `knownServices.has(cr.service)` filter drops those cross-reads BEFORE `resolveCrossReadReadiness` is ever called — this is the correct behavior, and tests 11/13 below separately verify the filter.
8. Deterministic: same input twice → identical x/y coordinates + identical SVG paths.
9. viewBox dimensions scale with layer count (width) and tallest-layer node count (height).
10. Self-reference guard: cross-read `svc -> svc` filtered (defensive).
11. **Service-unknown filter**: cross-read targeting a service NOT in `services[]` — edge dropped at aggregation time, no crash in `layoutGraph`. When ALL cross-reads target unknown services, the builder's `edgeMap.size === 0` short-circuit returns `null` — assert the return value is `null`, not `{ edges: [] }`.
12. **Disabled-step filter**: cross-read declared on a step whose `overlay.steps[step].enabled === false` — edge dropped.
13. **Mixed filter scenario**: 3 cross-reads where one self-references, one targets unknown service, one targets a disabled step — all three filtered; builder returns `null` (no edges survive filtering, `edgeMap.size === 0` → null per the entry-point short-circuit).

### 6.2 Template — `src/dashboard/multi-service.test.ts` (append to existing file)

`renderDependencyGraphSection` is exported from `template.ts` (§4.1, revised) so tests import it directly. Tests construct `DependencyGraphData` literals inline.

For `data-steps` extraction (tests 17 below), use regex to capture the attribute value, then `.replace(/&quot;/g, '"')` to decode the only HTML entity `escapeHtml` introduces inside a JSON payload. **Do not use `DOMParser`** — the repo's `vitest.config.ts` uses the default Node environment (no `jsdom` dependency in `package.json`). Example helper for tests:

```typescript
function extractDataSteps(html: string, consumer: string, producer: string): StepEdgeDetail[] {
  const pattern = new RegExp(
    `data-consumer="${consumer}"[^>]*data-producer="${producer}"[^>]*data-steps="([^"]*)"`,
  )
  const match = html.match(pattern)
  if (!match) throw new Error(`edge ${consumer} -> ${producer} not found`)
  const json = match[1].replace(/&quot;/g, '"')
  return JSON.parse(json)
}
```

The only HTML entity that appears in the JSON is `&quot;` (introduced by `escapeHtml` on each `"` in the JSON payload). `<`, `>`, `&` don't occur inside the JSON shape because status values are a fixed enum and step slugs are kebab-case. If a step slug ever contains those characters, the schema-level regex would have already rejected it upstream.

14. `renderDependencyGraphSection(null)` returns `''`. Also `renderDependencyGraphSection(undefined)` returns `''` (optional-field compat with the type).
15. Small graph: output contains `<section class="dep-graph">` with expected viewBox dimensions.
16. Escapes service names with special characters (`<`, `>`, `&`, `"`) using existing `escapeHtml`. Asserts the escaped form appears; the raw form does not.
17. `data-steps` attribute round-trips: extract via the `extractDataSteps` regex helper (above), `JSON.parse`, assert exact `StepEdgeDetail[]` content (consumer/producer/status per entry).
18. Output includes `<marker id="arrow"` with `orient="auto"` — locks the §4.1 revision.
19. Each edge has both hit-target path (class `dep-edge-hit`) AND visible path (class `dep-edge-line`) — pointer-events delegation.
20. Each edge `<g>` has `tabindex="0"` and a nested `<title>` — locks the accessibility contract.

### 6.3 E2E — `src/e2e/dashboard-cross-service-graph.test.ts` (new)

Fixture: 3-service monorepo (`api` backend, `web` web-app, `shared-lib` library), one cross-read from `web:implementation-plan -> api:create-prd`. Hoisted `vi.mock` pattern from `service-execution.test.ts`.

Test numbers continue from §6.2:

21. Multi-service config with real cross-reads → HTML contains `<section class="dep-graph">`.
22. Multi-service config with zero cross-reads → HTML does NOT contain `class="dep-graph"`.
23. Edge's `data-steps` (extracted via the `extractDataSteps` regex helper from §6.2) contains expected consumer/producer step pairs.
24. Orphan service → appears as node in graph even with no edges (Q9 invariant at E2E level).
25. Service-unknown edge (config declares a cross-read to a non-existent service) → graph renders without the bad edge, no crash. Locks the §2.1 service-unknown filter at E2E level.

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
| dependency-graph.test.ts (13 tests, adds filter-coverage) | ~320 |
| multi-service.test.ts additions (7 tests) | ~150 |
| dashboard-cross-service-graph.test.ts (5 tests) | ~200 |
| **Test total** | **~670** |

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

- `MultiServiceDashboardData` gains one optional field (`dependencyGraph?: DependencyGraphData | null`). The field is optional (not required-nullable) so pre-existing hand-written `MultiServiceDashboardData` literals — e.g., in `src/dashboard/multi-service.test.ts` fixtures — continue to compile without edits. Absence (`undefined`) and explicit `null` both render as "no graph section" per §4.1.
- `MultiServiceGeneratorOptions` gains one optional input field. Existing callers that don't pass `dependencyGraph` continue to work unchanged. The generator **normalizes** `undefined` input to `null` on the output (see §5.2 locked contract) — so template consumers and snapshot tests only ever see `null | DependencyGraphData` on the returned object.

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
