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
