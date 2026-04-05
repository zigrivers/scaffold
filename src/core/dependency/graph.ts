import type { DependencyGraph, DependencyNode } from '../../types/index.js'
import type { MetaPromptFrontmatter } from '../../types/index.js'

/**
 * Build a dependency graph from meta-prompt frontmatter and the preset
 * enablement map.
 *
 * edges maps slug → list of slugs that depend on it (successors / downstream).
 */
export function buildGraph(
  metaPrompts: MetaPromptFrontmatter[],
  presetSteps: Map<string, { enabled: boolean }>,
  dependencyMap?: Record<string, string[]>,
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>()
  const edges = new Map<string, string[]>()

  // Initialise nodes and empty successor lists
  for (const mp of metaPrompts) {
    // Tools (category: 'tool') are excluded from the dependency graph —
    // they have no phase/order and don't participate in topological sort
    if (mp.category === 'tool') continue

    const deps = dependencyMap?.[mp.name] ?? mp.dependencies
    const enabled = presetSteps.get(mp.name)?.enabled ?? true
    nodes.set(mp.name, {
      slug: mp.name,
      phase: mp.phase,
      order: mp.order,
      dependencies: deps,
      enabled,
    })
    edges.set(mp.name, [])
  }

  // Build edges: for each node, for each dep, push this step onto dep's successor list
  for (const [name, node] of nodes) {
    for (const dep of node.dependencies) {
      const successors = edges.get(dep)
      if (successors) {
        successors.push(name)
      }
      // Unknown deps are caught by detectCycles → DEP_TARGET_MISSING
    }
  }

  return { nodes, edges }
}
