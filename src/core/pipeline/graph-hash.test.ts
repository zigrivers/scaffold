import { describe, it, expect } from 'vitest'
import { computePipelineHash } from './graph-hash.js'
import type { DependencyGraph } from '../../types/index.js'

function mkGraph(
  nodes: Array<{ slug: string; enabled: boolean; deps: string[]; order?: number }>,
): DependencyGraph {
  const nodeMap = new Map<string, {
    slug: string; phase: string | null; order: number | null;
    dependencies: string[]; enabled: boolean;
  }>()
  for (const n of nodes) {
    nodeMap.set(n.slug, {
      slug: n.slug,
      phase: null,
      order: n.order ?? null,
      dependencies: n.deps,
      enabled: n.enabled,
    })
  }
  return { nodes: nodeMap, edges: new Map() }
}

describe('computePipelineHash', () => {
  it('same graph + same scope produces same hash (determinism)', () => {
    const g = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: ['a'] },
    ])
    const h1 = computePipelineHash(g, new Set(), 'global')
    const h2 = computePipelineHash(g, new Set(), 'global')
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/) // SHA-256 hex
  })

  it('different scope produces different hash', () => {
    const g = mkGraph([{ slug: 'a', enabled: true, deps: [] }])
    const hGlobal = computePipelineHash(g, new Set(), 'global')
    const hService = computePipelineHash(g, new Set(), 'service')
    expect(hGlobal).not.toBe(hService)
  })

  it('null scope normalizes to global (Round-2 P2 fix)', () => {
    const g = mkGraph([{ slug: 'a', enabled: true, deps: [] }])
    const hNull = computePipelineHash(g, new Set(), null)
    const hGlobal = computePipelineHash(g, new Set(), 'global')
    expect(hNull).toBe(hGlobal)
  })

  it('different dependencies produce different hash', () => {
    const g1 = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: ['a'] },
    ])
    const g2 = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: [] }, // dep removed
    ])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .not.toBe(computePipelineHash(g2, new Set(), 'global'))
  })

  it('different enabled flag produces different hash', () => {
    const g1 = mkGraph([{ slug: 'a', enabled: true, deps: [] }])
    const g2 = mkGraph([{ slug: 'a', enabled: false, deps: [] }])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .not.toBe(computePipelineHash(g2, new Set(), 'global'))
  })

  it('different order produces different hash (Round-1 P1 lock)', () => {
    const g1 = mkGraph([
      { slug: 'a', enabled: true, deps: [], order: 1 },
      { slug: 'b', enabled: true, deps: [], order: 2 },
    ])
    const g2 = mkGraph([
      { slug: 'a', enabled: true, deps: [], order: 2 },
      { slug: 'b', enabled: true, deps: [], order: 1 },
    ])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .not.toBe(computePipelineHash(g2, new Set(), 'global'))
  })

  it('node-insertion order does not affect hash (stability)', () => {
    const g1 = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: ['a'] },
    ])
    const g2 = mkGraph([
      { slug: 'b', enabled: true, deps: ['a'] },
      { slug: 'a', enabled: true, deps: [] },
    ])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .toBe(computePipelineHash(g2, new Set(), 'global'))
  })
})
