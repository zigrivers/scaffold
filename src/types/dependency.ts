export interface DependencyNode {
  slug: string
  phase: string | null
  order: number | null
  dependencies: string[]
  enabled: boolean
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>
  edges: Map<string, string[]>
}
