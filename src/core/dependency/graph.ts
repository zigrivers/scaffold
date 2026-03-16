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
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>()
  const edges = new Map<string, string[]>()

  // Initialise nodes and empty successor lists
  for (const mp of metaPrompts) {
    const enabled = presetSteps.get(mp.name)?.enabled ?? true
    nodes.set(mp.name, {
      slug: mp.name,
      phase: mp.phase,
      order: mp.order,
      dependencies: mp.dependencies,
      enabled,
    })
    edges.set(mp.name, [])
  }

  // Build edges: for each step, for each dep, push this step onto dep's successor list
  for (const mp of metaPrompts) {
    for (const dep of mp.dependencies) {
      const successors = edges.get(dep)
      if (successors) {
        successors.push(mp.name)
      }
      // Unknown deps are caught by detectCycles → DEP_TARGET_MISSING
    }
  }

  return { nodes, edges }
}
