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

  it('different globalSteps membership produces different hash (Codex MMR P2 lock)', () => {
    // Regression guard: the implementation includes isGlobal per spec §2, but
    // if the line were to drop globalSteps.has(slug), no test above would
    // catch it. Lock the contract: same graph, different globalSteps Set,
    // must produce different hashes.
    const g = mkGraph([
      { slug: 'a', enabled: true, deps: [] },
      { slug: 'b', enabled: true, deps: [] },
    ])
    const hNone = computePipelineHash(g, new Set(), 'global')
    const hAGlobal = computePipelineHash(g, new Set(['a']), 'global')
    const hBothGlobal = computePipelineHash(g, new Set(['a', 'b']), 'global')
    expect(hNone).not.toBe(hAGlobal)
    expect(hAGlobal).not.toBe(hBothGlobal)
  })

  it('dependency order within a node does not affect hash (dep-sort stability, Codex MMR P2 lock)', () => {
    // Regression guard: implementation sorts deps before joining, but no prior
    // test locks this. If the sort were removed and consumers happened to
    // insert deps in canonical order, the suite would still pass — failing
    // silently when a real caller inserts deps in a different order.
    const g1 = mkGraph([{ slug: 'x', enabled: true, deps: ['a', 'b', 'c'] }])
    const g2 = mkGraph([{ slug: 'x', enabled: true, deps: ['c', 'a', 'b'] }])
    expect(computePipelineHash(g1, new Set(), 'global'))
      .toBe(computePipelineHash(g2, new Set(), 'global'))
  })
})
