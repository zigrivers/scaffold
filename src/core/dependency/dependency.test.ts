import { describe, it, expect } from 'vitest'
import type { MetaPromptFrontmatter } from '../../types/index.js'
import { buildGraph } from './graph.js'
import { topologicalSort, detectCycles } from './dependency.js'

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

const frontmatters: MetaPromptFrontmatter[] = [
  makeFm('a', 'pre', 1, []),
  makeFm('b', 'pre', 2, ['a']),
  makeFm('c', 'modeling', 3, ['a']),
  makeFm('d', 'modeling', 4, ['b', 'c']),
]

const allEnabled = new Map([
  ['a', { enabled: true }],
  ['b', { enabled: true }],
  ['c', { enabled: true }],
  ['d', { enabled: true }],
])

// ---------------------------------------------------------------------------
// buildGraph
// ---------------------------------------------------------------------------

describe('buildGraph', () => {
  it('builds graph from meta-prompt frontmatter', () => {
    const graph = buildGraph(frontmatters, allEnabled)

    expect(graph.nodes.size).toBe(4)
    expect(graph.nodes.get('a')).toMatchObject({ slug: 'a', phase: 'pre', order: 1, dependencies: [] })
    expect(graph.nodes.get('d')).toMatchObject({ slug: 'd', phase: 'modeling', order: 4, dependencies: ['b', 'c'] })

    // edges: a → [b, c] (b and c depend on a)
    const aSuccessors = graph.edges.get('a') ?? []
    expect(aSuccessors).toContain('b')
    expect(aSuccessors).toContain('c')

    // edges: b → [d], c → [d]
    expect(graph.edges.get('b')).toContain('d')
    expect(graph.edges.get('c')).toContain('d')
  })

  it('marks disabled steps per preset enablement map', () => {
    const preset = new Map([
      ['a', { enabled: true }],
      ['b', { enabled: false }],
      ['c', { enabled: true }],
      ['d', { enabled: true }],
    ])
    const graph = buildGraph(frontmatters, preset)

    expect(graph.nodes.get('b')?.enabled).toBe(false)
    expect(graph.nodes.get('a')?.enabled).toBe(true)
  })

  it('defaults enabled to true when step not in preset map', () => {
    const graph = buildGraph(frontmatters, new Map())
    for (const node of graph.nodes.values()) {
      expect(node.enabled).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------

describe('topologicalSort', () => {
  it('produces valid ordering — no step before its dependencies', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const order = topologicalSort(graph)

    expect(order).toHaveLength(4)

    const indexOf = (slug: string) => order.indexOf(slug)
    // b comes after a
    expect(indexOf('a')).toBeLessThan(indexOf('b'))
    // c comes after a
    expect(indexOf('a')).toBeLessThan(indexOf('c'))
    // d comes after b and c
    expect(indexOf('b')).toBeLessThan(indexOf('d'))
    expect(indexOf('c')).toBeLessThan(indexOf('d'))
  })

  it('is deterministic (same input → same order)', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const order1 = topologicalSort(graph)
    const order2 = topologicalSort(graph)
    expect(order1).toEqual(order2)
  })

  it('uses order field as primary tiebreaker', () => {
    // a and b both have no deps but different order values
    const fms: MetaPromptFrontmatter[] = [
      makeFm('z', 'pre', 10, []),
      makeFm('a', 'pre', 1, []),
    ]
    const preset = new Map([
      ['z', { enabled: true }],
      ['a', { enabled: true }],
    ])
    const graph = buildGraph(fms, preset)
    const order = topologicalSort(graph)
    // 'a' has lower order (1) → comes first
    expect(order[0]).toBe('a')
    expect(order[1]).toBe('z')
  })

  it('returns all nodes for an acyclic graph', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const result = topologicalSort(graph)
    expect(result).toHaveLength(graph.nodes.size)
  })
})

// ---------------------------------------------------------------------------
// detectCycles
// ---------------------------------------------------------------------------

describe('detectCycles', () => {
  it('returns empty array for acyclic graph', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const errors = detectCycles(graph)
    expect(errors).toHaveLength(0)
  })

  it('detects cycle and returns DEP_CYCLE_DETECTED error', () => {
    // x → y → x (cycle)
    const fms: MetaPromptFrontmatter[] = [
      makeFm('x', 'pre', 1, ['y']),
      makeFm('y', 'pre', 2, ['x']),
    ]
    const preset = new Map([
      ['x', { enabled: true }],
      ['y', { enabled: true }],
    ])
    const graph = buildGraph(fms, preset)
    const errors = detectCycles(graph)

    const cycleError = errors.find(e => e.code === 'DEP_CYCLE_DETECTED')
    expect(cycleError).toBeDefined()
    expect(cycleError?.exitCode).toBe(1) // ExitCode.ValidationError
  })

  it('detects self-reference (DEP_SELF_REFERENCE)', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('self', 'pre', 1, ['self']),
    ]
    const preset = new Map([['self', { enabled: true }]])
    const graph = buildGraph(fms, preset)
    const errors = detectCycles(graph)

    const selfErr = errors.find(e => e.code === 'DEP_SELF_REFERENCE')
    expect(selfErr).toBeDefined()
    expect(selfErr?.context?.step).toBe('self')
  })

  it('detects unknown dependency (DEP_TARGET_MISSING)', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('a', 'pre', 1, []),
      makeFm('b', 'pre', 2, ['a', 'nonexistent']),
    ]
    const preset = new Map([
      ['a', { enabled: true }],
      ['b', { enabled: true }],
    ])
    const graph = buildGraph(fms, preset)
    const errors = detectCycles(graph)

    const missingErr = errors.find(e => e.code === 'DEP_TARGET_MISSING')
    expect(missingErr).toBeDefined()
    expect(missingErr?.context?.step).toBe('b')
    expect(missingErr?.context?.dependency).toBe('nonexistent')
    expect(missingErr?.exitCode).toBe(2) // ExitCode.MissingDependency
  })
})
