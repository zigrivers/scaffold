export interface DependencyNode {
  slug: string
  phase: string | null
  order: number | null
  dependencies: string[]
  /**
   * Cross-service dependency edges (informational, non-blocking).
   * Populated via overlay-first merge: `overlay.crossReads` takes precedence over
   * `frontmatter.crossReads` (Wave 3c+1 — cross-reads-overrides).
   */
  crossDependencies?: Array<{ service: string; step: string }>
  enabled: boolean
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>
  edges: Map<string, string[]>
}
