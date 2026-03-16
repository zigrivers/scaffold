export interface DependencyNode {
  slug: string
  phase: string
  order: number
  dependencies: string[]
  enabled: boolean
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>
  edges: Map<string, string[]>
}
