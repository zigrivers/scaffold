import { describe, it, expect } from 'vitest'
import type { MetaPromptFrontmatter } from '../../types/index.js'
import type { DependencyGraph } from '../../types/index.js'
import { buildGraph } from './graph.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFm(
  name: string,
  phase: string,
  order: number,
  dependencies: string[],
): MetaPromptFrontmatter {
  return {
    name,
    description: `${name} step`,
    phase,
    order,
    dependencies,
    outputs: [`out/${name}.md`],
    conditional: null,
    knowledgeBase: [],
    reads: [],
    stateless: false,
    category: 'pipeline' as const,
  }
}

// ---------------------------------------------------------------------------
// buildGraph — dedicated test suite
// ---------------------------------------------------------------------------

describe('buildGraph', () => {
  // -------------------------------------------------------------------------
  // 1. Builds graph from array of frontmatter objects
  // -------------------------------------------------------------------------
  it('builds graph from an array of frontmatter objects', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('alpha', 'pre', 1, []),
      makeFm('beta', 'foundation', 2, ['alpha']),
      makeFm('gamma', 'modeling', 3, ['alpha', 'beta']),
    ]
    const preset = new Map([
      ['alpha', { enabled: true }],
      ['beta', { enabled: true }],
      ['gamma', { enabled: true }],
    ])

    const graph = buildGraph(fms, preset)

    expect(graph.nodes.size).toBe(3)
    expect(graph.edges.size).toBe(3)
    expect(graph.nodes.has('alpha')).toBe(true)
    expect(graph.nodes.has('beta')).toBe(true)
    expect(graph.nodes.has('gamma')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 2. Nodes contain correct slug, phase, order, dependencies
  // -------------------------------------------------------------------------
  it('populates nodes with correct slug, phase, order, and dependencies', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('step-a', 'pre', 100, []),
      makeFm('step-b', 'modeling', 500, ['step-a']),
    ]
    const preset = new Map([
      ['step-a', { enabled: true }],
      ['step-b', { enabled: true }],
    ])

    const graph = buildGraph(fms, preset)

    const nodeA = graph.nodes.get('step-a')
    expect(nodeA).toBeDefined()
    expect(nodeA).toMatchObject({
      slug: 'step-a',
      phase: 'pre',
      order: 100,
      dependencies: [],
    })

    const nodeB = graph.nodes.get('step-b')
    expect(nodeB).toBeDefined()
    expect(nodeB).toMatchObject({
      slug: 'step-b',
      phase: 'modeling',
      order: 500,
      dependencies: ['step-a'],
    })
  })

  // -------------------------------------------------------------------------
  // 3. Edges map dependencies correctly
  // -------------------------------------------------------------------------
  it('maps edges so each dependency points to its successors', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('root', 'pre', 1, []),
      makeFm('child-1', 'pre', 2, ['root']),
      makeFm('child-2', 'foundation', 3, ['root']),
      makeFm('grandchild', 'modeling', 4, ['child-1', 'child-2']),
    ]
    const preset = new Map([
      ['root', { enabled: true }],
      ['child-1', { enabled: true }],
      ['child-2', { enabled: true }],
      ['grandchild', { enabled: true }],
    ])

    const graph = buildGraph(fms, preset)

    // root is depended on by child-1 and child-2
    const rootSuccessors = graph.edges.get('root') ?? []
    expect(rootSuccessors).toContain('child-1')
    expect(rootSuccessors).toContain('child-2')
    expect(rootSuccessors).toHaveLength(2)

    // child-1 and child-2 each have grandchild as successor
    expect(graph.edges.get('child-1')).toEqual(['grandchild'])
    expect(graph.edges.get('child-2')).toEqual(['grandchild'])

    // grandchild has no successors
    expect(graph.edges.get('grandchild')).toEqual([])
  })

  // -------------------------------------------------------------------------
  // 4. Disabled steps (from preset) are marked enabled=false
  // -------------------------------------------------------------------------
  it('marks disabled steps per the preset enablement map', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('keep', 'pre', 1, []),
      makeFm('skip', 'pre', 2, []),
      makeFm('also-skip', 'foundation', 3, []),
    ]
    const preset = new Map([
      ['keep', { enabled: true }],
      ['skip', { enabled: false }],
      ['also-skip', { enabled: false }],
    ])

    const graph = buildGraph(fms, preset)

    expect(graph.nodes.get('keep')?.enabled).toBe(true)
    expect(graph.nodes.get('skip')?.enabled).toBe(false)
    expect(graph.nodes.get('also-skip')?.enabled).toBe(false)
  })

  // -------------------------------------------------------------------------
  // 5. Steps not in preset are enabled by default
  // -------------------------------------------------------------------------
  it('defaults enabled to true when step is not in the preset map', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('unlisted-a', 'pre', 1, []),
      makeFm('unlisted-b', 'foundation', 2, []),
      makeFm('listed', 'modeling', 3, []),
    ]
    // Only 'listed' appears in the preset
    const preset = new Map([
      ['listed', { enabled: true }],
    ])

    const graph = buildGraph(fms, preset)

    expect(graph.nodes.get('unlisted-a')?.enabled).toBe(true)
    expect(graph.nodes.get('unlisted-b')?.enabled).toBe(true)
    expect(graph.nodes.get('listed')?.enabled).toBe(true)
  })

  it('defaults all steps to enabled when preset map is completely empty', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('x', 'pre', 1, []),
      makeFm('y', 'pre', 2, ['x']),
    ]

    const graph = buildGraph(fms, new Map())

    for (const node of graph.nodes.values()) {
      expect(node.enabled).toBe(true)
    }
  })

  // -------------------------------------------------------------------------
  // 6. Empty frontmatter array produces empty graph
  // -------------------------------------------------------------------------
  it('returns an empty graph when given an empty frontmatter array', () => {
    const graph = buildGraph([], new Map())

    expect(graph.nodes.size).toBe(0)
    expect(graph.edges.size).toBe(0)
  })

  it('returns an empty graph even when preset has entries but frontmatter is empty', () => {
    const preset = new Map([
      ['phantom', { enabled: true }],
    ])
    const graph = buildGraph([], preset)

    expect(graph.nodes.size).toBe(0)
    expect(graph.edges.size).toBe(0)
  })

  // -------------------------------------------------------------------------
  // 7. Steps with dependencies produce correctly populated edges
  // -------------------------------------------------------------------------
  it('populates edges for a diamond dependency pattern', () => {
    //   a
    //  / \
    // b   c
    //  \ /
    //   d
    const fms: MetaPromptFrontmatter[] = [
      makeFm('a', 'pre', 1, []),
      makeFm('b', 'pre', 2, ['a']),
      makeFm('c', 'modeling', 3, ['a']),
      makeFm('d', 'modeling', 4, ['b', 'c']),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
      ['b', { enabled: true }],
      ['c', { enabled: true }],
      ['d', { enabled: true }],
    ])

    const graph = buildGraph(fms, preset)

    // a -> [b, c]
    const aSucc = graph.edges.get('a') ?? []
    expect(aSucc).toContain('b')
    expect(aSucc).toContain('c')

    // b -> [d]
    expect(graph.edges.get('b')).toContain('d')

    // c -> [d]
    expect(graph.edges.get('c')).toContain('d')

    // d -> [] (no successors)
    expect(graph.edges.get('d')).toEqual([])
  })

  it('handles a step depending on a non-existent step without crashing', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('only', 'pre', 1, ['missing-dep']),
    ]
    const preset = new Map([
      ['only', { enabled: true }],
    ])

    // Should not throw — unknown deps are caught by detectCycles
    const graph = buildGraph(fms, preset)

    expect(graph.nodes.size).toBe(1)
    expect(graph.nodes.get('only')?.dependencies).toEqual(['missing-dep'])
    // 'missing-dep' is not in the graph, so no edge gets updated
    expect(graph.edges.get('missing-dep')).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // 8. Graph structure matches DependencyGraph type
  // -------------------------------------------------------------------------
  it('returns a graph whose structure matches the DependencyGraph type', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('s1', 'pre', 1, []),
      makeFm('s2', 'foundation', 2, ['s1']),
    ]
    const preset = new Map([
      ['s1', { enabled: true }],
      ['s2', { enabled: false }],
    ])

    const graph: DependencyGraph = buildGraph(fms, preset)

    // nodes is a Map<string, DependencyNode>
    expect(graph.nodes).toBeInstanceOf(Map)
    // edges is a Map<string, string[]>
    expect(graph.edges).toBeInstanceOf(Map)

    // Verify each node conforms to DependencyNode shape
    for (const [key, node] of graph.nodes) {
      expect(typeof key).toBe('string')
      expect(typeof node.slug).toBe('string')
      expect(typeof node.phase).toBe('string')
      expect(typeof node.order).toBe('number')
      expect(Array.isArray(node.dependencies)).toBe(true)
      expect(typeof node.enabled).toBe('boolean')
    }

    // Verify each edge entry is string[]
    for (const [key, successors] of graph.edges) {
      expect(typeof key).toBe('string')
      expect(Array.isArray(successors)).toBe(true)
      for (const s of successors) {
        expect(typeof s).toBe('string')
      }
    }
  })

  it('ensures every node has a corresponding edge entry', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('p', 'pre', 1, []),
      makeFm('q', 'pre', 2, ['p']),
      makeFm('r', 'foundation', 3, []),
    ]

    const graph = buildGraph(fms, new Map())

    // Every node slug must also be a key in the edges map
    for (const slug of graph.nodes.keys()) {
      expect(graph.edges.has(slug)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// buildGraph with dependencyMap — overlay dependency overrides
// ---------------------------------------------------------------------------

describe('buildGraph with dependencyMap', () => {
  it('uses dependencyMap deps instead of frontmatter deps when provided', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['original-dep']),
      makeFm('b', 'foundation', 2, []),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
      ['b', { enabled: true }],
    ])
    const depMap = { a: ['b'], b: [] }
    const graph = buildGraph(fms, preset, depMap)
    expect(graph.nodes.get('a')?.dependencies).toEqual(['b'])
    expect(graph.edges.get('b')).toContain('a')
    expect(graph.edges.has('original-dep')).toBe(false)
  })

  it('falls back to frontmatter deps when dependencyMap entry is missing', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['b']),
      makeFm('b', 'foundation', 2, []),
    ]
    const preset = new Map([['a', { enabled: true }], ['b', { enabled: true }]])
    const depMap = { b: [] }
    const graph = buildGraph(fms, preset, depMap)
    expect(graph.nodes.get('a')?.dependencies).toEqual(['b'])
    expect(graph.edges.get('b')).toContain('a')
  })

  it('handles replace semantics (old dep gone, new dep present)', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['old-dep']),
      makeFm('old-dep', 'pre', 2, []),
      makeFm('new-dep', 'pre', 3, []),
    ]
    const preset = new Map([['a', { enabled: true }], ['old-dep', { enabled: true }], ['new-dep', { enabled: true }]])
    const depMap = { a: ['new-dep'], 'old-dep': [], 'new-dep': [] }
    const graph = buildGraph(fms, preset, depMap)
    expect(graph.nodes.get('a')?.dependencies).toEqual(['new-dep'])
    expect(graph.edges.get('new-dep')).toContain('a')
    expect(graph.edges.get('old-dep')).not.toContain('a')
  })

  it('handles append semantics (new dep alongside originals)', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['b']),
      makeFm('b', 'foundation', 2, []),
      makeFm('c', 'foundation', 3, []),
    ]
    const preset = new Map([['a', { enabled: true }], ['b', { enabled: true }], ['c', { enabled: true }]])
    const depMap = { a: ['b', 'c'], b: [], c: [] }
    const graph = buildGraph(fms, preset, depMap)
    expect(graph.nodes.get('a')?.dependencies).toEqual(['b', 'c'])
    expect(graph.edges.get('b')).toContain('a')
    expect(graph.edges.get('c')).toContain('a')
  })

  it('unknown dep from dependencyMap is stored on node (caught by detectCycles)', () => {
    const fms = [makeFm('a', 'pre', 1, [])]
    const preset = new Map([['a', { enabled: true }]])
    const depMap = { a: ['nonexistent'] }
    const graph = buildGraph(fms, preset, depMap)
    expect(graph.nodes.get('a')?.dependencies).toEqual(['nonexistent'])
    expect(graph.edges.has('nonexistent')).toBe(false)
  })

  it('without dependencyMap, behavior is unchanged (backward compat)', () => {
    const fms = [
      makeFm('a', 'pre', 1, ['b']),
      makeFm('b', 'foundation', 2, []),
    ]
    const preset = new Map([['a', { enabled: true }], ['b', { enabled: true }]])
    const graph = buildGraph(fms, preset)
    expect(graph.nodes.get('a')?.dependencies).toEqual(['b'])
    expect(graph.edges.get('b')).toContain('a')
  })
})
