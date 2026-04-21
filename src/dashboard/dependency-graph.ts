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

// Module-private layout constants (template.ts imports only NODE_WIDTH/NODE_HEIGHT
// since those align text/box positioning; the rest are layout-internal).
const LAYER_GAP = 80
const NODE_GAP = 16
const PADDING = 24

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
  // state.json read per service per graph build. Derive the cache type from
  // resolveCrossReadReadiness's signature so we don't silently land on Map<any,
  // any> (cross-reads.ts doesn't export ForeignStateCacheEntry as of v3.22.0).
  const readinessCache: NonNullable<Parameters<typeof resolveCrossReadReadiness>[4]> = new Map()

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

  // Edge paths — cubic bezier. For normal acyclic edges (consumer at higher
  // layer than producer), route consumer-left → producer-right so the
  // arrowhead tangent points leftward into the producer's right face. For
  // same-layer cycle edges (A ↔ B), both nodes share a column; the normal
  // routing would send the bezier horizontally through both nodes and the
  // arrowhead would end pointing AWAY from the producer. Route cycle edges
  // via an arc OUTSIDE the column (consumer-right → producer-right, control
  // points displaced rightward by LAYER_GAP/2) so the tangent at the end
  // still points leftward into the producer. Matches spec §3.4 "graceful
  // failure" framing while keeping the arrow direction meaningful.
  const byName = new Map(nodes.map(n => [n.name, n]))
  for (const edge of edges) {
    const consumer = byName.get(edge.consumer)!
    const producer = byName.get(edge.producer)!
    if (consumer.layer === producer.layer) {
      const x1 = consumer.x + NODE_WIDTH                     // consumer right
      const y1 = consumer.y + NODE_HEIGHT / 2
      const x2 = producer.x + NODE_WIDTH                     // producer right
      const y2 = producer.y + NODE_HEIGHT / 2
      const cx = x2 + LAYER_GAP / 2                          // arc outside the column
      edge.svgPath = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
    } else {
      const x1 = consumer.x                                  // consumer left
      const y1 = consumer.y + NODE_HEIGHT / 2
      const x2 = producer.x + NODE_WIDTH                     // producer right
      const y2 = producer.y + NODE_HEIGHT / 2
      const cx = (x1 + x2) / 2
      edge.svgPath = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
    }
  }

  return { nodes, edges, viewBox: { width, height } }
}
