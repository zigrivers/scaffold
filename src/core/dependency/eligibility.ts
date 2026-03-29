import type { DependencyGraph } from '../../types/index.js'
import type { StepStateEntry } from '../../types/index.js'
import { PHASE_SORT_ORDER } from './dependency.js'

/**
 * Return the list of enabled, pending steps whose dependencies are all
 * satisfied (completed, skipped, or disabled).
 *
 * Steps absent from `steps` are treated as pending.
 */
export function computeEligible(
  graph: DependencyGraph,
  steps: Record<string, StepStateEntry>,
): string[] {
  const eligible: string[] = []

  for (const [slug, node] of graph.nodes) {
    // Skip disabled steps — they are never candidates for execution
    if (!node.enabled) continue

    const status = steps[slug]?.status
    // Only pending steps (or steps not yet in state) are candidates
    if (status !== 'pending' && status !== undefined) continue

    // All dependencies must be completed, skipped, or disabled
    const depsOk = node.dependencies.every(dep => {
      const depNode = graph.nodes.get(dep)
      // Disabled deps count as satisfied
      if (depNode && !depNode.enabled) return true
      const depStatus = steps[dep]?.status
      return depStatus === 'completed' || depStatus === 'skipped'
    })

    if (depsOk) eligible.push(slug)
  }

  // Stable sort: order field (primary), slug alphabetical (secondary)
  return eligible.sort((a, b) => {
    const nodeA = graph.nodes.get(a)!
    const nodeB = graph.nodes.get(b)!
    return (nodeA.order ?? 9999) - (nodeB.order ?? 9999) || a.localeCompare(b)
  })
}

/**
 * Group enabled steps into sets that can run concurrently.
 *
 * Simple implementation: group by phase, then sort phases by PHASE_SORT_ORDER.
 * Within each phase, steps are sorted by order field then slug.
 */
export function getParallelSets(graph: DependencyGraph): string[][] {
  const phaseMap = new Map<string, string[]>()

  for (const [slug, node] of graph.nodes) {
    if (!node.enabled) continue
    const phase = node.phase ?? '__none__'
    if (!phaseMap.has(phase)) phaseMap.set(phase, [])
    phaseMap.get(phase)!.push(slug)
  }

  const sortedPhases = [...phaseMap.keys()].sort(
    (a, b) => (PHASE_SORT_ORDER[a] ?? 99) - (PHASE_SORT_ORDER[b] ?? 99),
  )

  return sortedPhases.map(phase =>
    (phaseMap.get(phase) ?? []).sort((a, b) => {
      const nodeA = graph.nodes.get(a)!
      const nodeB = graph.nodes.get(b)!
      return (nodeA.order ?? 9999) - (nodeB.order ?? 9999) || a.localeCompare(b)
    }),
  )
}
