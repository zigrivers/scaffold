import type { DependencyGraph } from '../../types/index.js'
import type { ScaffoldError } from '../../types/index.js'
import { ExitCode } from '../../types/index.js'

/** Primary phase ordering for topological sort tiebreaking. */
const PHASE_SORT_ORDER: Record<string, number> = {
  pre: 0,
  modeling: 1,
  decisions: 2,
  architecture: 3,
  specification: 4,
  quality: 5,
  planning: 6,
  validation: 7,
  finalization: 8,
  build: 9,
}

export { PHASE_SORT_ORDER }

/**
 * Topological sort using Kahn's algorithm.
 *
 * Tie-breaking: order field (primary), slug alphabetical (secondary).
 * Returns a partial list when cycles exist (callers should use detectCycles).
 */
export function topologicalSort(graph: DependencyGraph): string[] {
  const { nodes, edges } = graph

  // Compute in-degrees — count deps that actually exist in the graph
  const inDegree = new Map<string, number>()
  for (const [slug, node] of nodes) {
    inDegree.set(slug, node.dependencies.filter(dep => nodes.has(dep)).length)
  }

  // Seed queue with zero-in-degree nodes, sorted for determinism
  const queue: string[] = []
  for (const [slug, degree] of inDegree) {
    if (degree === 0) queue.push(slug)
  }
  queue.sort((a, b) => {
    const nodeA = nodes.get(a)!
    const nodeB = nodes.get(b)!
    return (nodeA.order ?? 9999) - (nodeB.order ?? 9999) || a.localeCompare(b)
  })

  const result: string[] = []

  while (queue.length > 0) {
    const slug = queue.shift()!
    result.push(slug)

    const successors = edges.get(slug) ?? []
    const newlyZero: string[] = []

    for (const successor of successors) {
      const newDegree = (inDegree.get(successor) ?? 0) - 1
      inDegree.set(successor, newDegree)
      if (newDegree === 0) newlyZero.push(successor)
    }

    // Insert newly-zero nodes in sorted order
    newlyZero.sort((a, b) => {
      const nodeA = nodes.get(a)!
      const nodeB = nodes.get(b)!
      return (nodeA.order ?? 9999) - (nodeB.order ?? 9999) || a.localeCompare(b)
    })
    queue.push(...newlyZero)
  }

  return result
}

/**
 * Detect structural errors in the dependency graph:
 *   DEP_CYCLE_DETECTED   — nodes unreachable via topological sort
 *   DEP_SELF_REFERENCE   — a step lists itself as a dependency
 *   DEP_TARGET_MISSING   — a dependency slug not present in the graph
 */
export function detectCycles(graph: DependencyGraph): ScaffoldError[] {
  const errors: ScaffoldError[] = []

  // Cycle detection via Kahn's algorithm: unvisited nodes after sort are in a cycle
  const sorted = topologicalSort(graph)
  if (sorted.length < graph.nodes.size) {
    const visited = new Set(sorted)
    const cycleNodes = [...graph.nodes.keys()].filter(k => !visited.has(k))
    errors.push({
      code: 'DEP_CYCLE_DETECTED',
      message: `Cycle detected in dependency graph involving: ${cycleNodes.join(', ')}`,
      exitCode: ExitCode.ValidationError,
      context: { steps: cycleNodes.join(', ') },
    })
  }

  // Per-node checks: self-reference and missing targets
  for (const [slug, node] of graph.nodes) {
    for (const dep of node.dependencies) {
      if (dep === slug) {
        errors.push({
          code: 'DEP_SELF_REFERENCE',
          message: `Step "${slug}" depends on itself`,
          exitCode: ExitCode.ValidationError,
          context: { step: slug },
        })
      } else if (!graph.nodes.has(dep)) {
        errors.push({
          code: 'DEP_TARGET_MISSING',
          message: `Step "${slug}" depends on unknown step "${dep}"`,
          exitCode: ExitCode.MissingDependency,
          context: { step: slug, dependency: dep },
        })
      }
    }
  }

  return errors
}
