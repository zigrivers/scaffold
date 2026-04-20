import { describe, it, expect, vi } from 'vitest'
import { readEligible } from './read-eligible.js'
import type { PipelineState } from '../../types/index.js'
import type { ResolvedPipeline } from './types.js'

function mkState(overrides: Partial<PipelineState>): PipelineState {
  return {
    'schema-version': 3,
    'scaffold-version': '1.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-04-20T00:00:00.000Z',
    in_progress: null,
    steps: {},
    next_eligible: [],
    'extra-steps': [],
    ...overrides,
  }
}

function mkPipeline(
  hashGlobal: string,
  hashService: string,
  liveEligible: string[] = ['live-step'],
): ResolvedPipeline {
  return {
    graph: { nodes: new Map(), edges: new Map() },
    preset: { name: 'deep', description: 'test', default_depth: 3, steps: {} },
    overlay: { steps: {}, knowledge: {}, reads: {}, dependencies: {}, crossReads: {} },
    stepMeta: new Map(),
    computeEligible: vi.fn(() => liveEligible) as unknown as ResolvedPipeline['computeEligible'],
    globalSteps: new Set(),
    getPipelineHash: (scope) => scope === 'service' ? hashService : hashGlobal,
  }
}

describe('readEligible', () => {
  it('returns cached list when hash matches (global scope)', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1')
    const state = mkState({
      next_eligible: ['cached-a', 'cached-b'],
      next_eligible_hash: 'hash-global-v1',
    })
    expect(readEligible(state, pipeline, undefined, undefined)).toEqual(['cached-a', 'cached-b'])
    expect(pipeline.computeEligible).not.toHaveBeenCalled()
  })

  it('falls back to live compute when hash is absent', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1', ['fallback'])
    const state = mkState({
      next_eligible: ['stale'],
    })
    expect(readEligible(state, pipeline, undefined, undefined)).toEqual(['fallback'])
    expect(pipeline.computeEligible).toHaveBeenCalled()
  })

  it('falls back to live compute when hash mismatches', () => {
    const pipeline = mkPipeline('hash-global-v2', 'hash-service-v2', ['fallback'])
    const state = mkState({
      next_eligible: ['stale'],
      next_eligible_hash: 'hash-global-v1',
    })
    expect(readEligible(state, pipeline, undefined, undefined)).toEqual(['fallback'])
  })

  it('service scope: uses cache when hash matches AND root counter matches', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1')
    const state = mkState({
      next_eligible: ['svc-cached'],
      next_eligible_hash: 'hash-service-v1',
      next_eligible_root_counter: 5,
    })
    const rootReader = () => 5
    expect(readEligible(
      state,
      pipeline,
      { scope: 'service', globalSteps: new Set() },
      rootReader,
    )).toEqual(['svc-cached'])
    expect(pipeline.computeEligible).not.toHaveBeenCalled()
  })

  it('service scope: falls back when root counter mismatches', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1', ['fallback'])
    const state = mkState({
      next_eligible: ['svc-stale'],
      next_eligible_hash: 'hash-service-v1',
      next_eligible_root_counter: 5,
    })
    const rootReader = () => 6
    expect(readEligible(
      state,
      pipeline,
      { scope: 'service', globalSteps: new Set() },
      rootReader,
    )).toEqual(['fallback'])
  })

  it('service scope: falls back when cache lacks counter and root reader returns null', () => {
    // Stamped-counter semantics: an absent next_eligible_root_counter means
    // the cache was never stamped with a counter (legacy or never-saved).
    // `undefined !== null` triggers live recompute. Title + body match.
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1')
    const state = mkState({
      next_eligible: ['svc-cached'],
      next_eligible_hash: 'hash-service-v1',
      // no next_eligible_root_counter — cache never stamped
    })
    const rootReader = () => null
    expect(readEligible(
      state,
      pipeline,
      { scope: 'service', globalSteps: new Set() },
      rootReader,
    )).not.toEqual(['svc-cached'])
  })

  it('scope: undefined normalizes to global (uses global hash)', () => {
    const pipeline = mkPipeline('hash-global-v1', 'hash-service-v1')
    const state = mkState({
      next_eligible: ['g-cached'],
      next_eligible_hash: 'hash-global-v1',
    })
    expect(readEligible(state, pipeline, undefined, undefined)).toEqual(['g-cached'])
    expect(readEligible(state, pipeline, { scope: undefined }, undefined)).toEqual(['g-cached'])
  })
})
