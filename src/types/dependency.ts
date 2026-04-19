export interface DependencyNode {
  slug: string
  phase: string | null
  order: number | null
  dependencies: string[]
  /** Cross-service dependency edges (informational, non-blocking). Populated from frontmatter.crossReads (Wave 3c). */
  crossDependencies?: Array<{ service: string; step: string }>
  enabled: boolean
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>
  edges: Map<string, string[]>
}
