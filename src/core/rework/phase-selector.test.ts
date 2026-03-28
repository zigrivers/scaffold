import { describe, it, expect } from 'vitest'
import { parsePhases, parseThrough, applyExclusions, resolveStepsForPhases } from './phase-selector.js'
import type { PipelineState, StepStatus } from '../../types/index.js'
import type { MetaPromptFrontmatter } from '../../types/index.js'
import { buildGraph } from '../dependency/graph.js'

describe('parsePhases', () => {
  it('parses a single number', () => {
    expect(parsePhases('3')).toEqual([3])
  })

  it('parses a comma-separated list', () => {
    expect(parsePhases('1,3,5')).toEqual([1, 3, 5])
  })

  it('parses a range', () => {
    expect(parsePhases('1-5')).toEqual([1, 2, 3, 4, 5])
  })

  it('parses mixed ranges and numbers', () => {
    expect(parsePhases('1-3,5')).toEqual([1, 2, 3, 5])
  })

  it('deduplicates and sorts', () => {
    expect(parsePhases('5,1-3,2')).toEqual([1, 2, 3, 5])
  })

  it('throws on invalid input', () => {
    expect(() => parsePhases('abc')).toThrow()
  })

  it('throws on out-of-range phase number', () => {
    expect(() => parsePhases('0')).toThrow()
    expect(() => parsePhases('15')).toThrow()
  })

  it('throws on reversed range', () => {
    expect(() => parsePhases('5-1')).toThrow()
  })
})

describe('parseThrough', () => {
  it('returns 1 through N', () => {
    expect(parseThrough(5)).toEqual([1, 2, 3, 4, 5])
  })

  it('returns [1] for through 1', () => {
    expect(parseThrough(1)).toEqual([1])
  })

  it('throws for invalid N', () => {
    expect(() => parseThrough(0)).toThrow()
    expect(() => parseThrough(15)).toThrow()
  })
})

describe('applyExclusions', () => {
  it('removes excluded phases', () => {
    expect(applyExclusions([1, 2, 3, 4, 5], [3])).toEqual([1, 2, 4, 5])
  })

  it('handles exclusions not in list', () => {
    expect(applyExclusions([1, 2, 3], [5])).toEqual([1, 2, 3])
  })

  it('returns empty array when all excluded', () => {
    expect(applyExclusions([1, 2], [1, 2])).toEqual([])
  })
})

describe('resolveStepsForPhases', () => {
  const makeState = (steps: Record<string, { status: StepStatus }>): PipelineState => ({
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-01-01T00:00:00Z',
    in_progress: null,
    steps: Object.fromEntries(
      Object.entries(steps).map(([k, v]) => [k, { status: v.status, source: 'pipeline' as const }]),
    ),
    next_eligible: [],
    'extra-steps': [],
  })

  const metaPrompts: MetaPromptFrontmatter[] = [
    { name: 'create-prd', description: 'Create PRD', phase: 'pre', order: 110, dependencies: [], outputs: [], conditional: null, knowledgeBase: [], reads: [] },
    { name: 'review-prd', description: 'Review PRD', phase: 'pre', order: 120, dependencies: ['create-prd'], outputs: [], conditional: null, knowledgeBase: [], reads: [] },
    { name: 'tech-stack', description: 'Tech stack', phase: 'foundation', order: 210, dependencies: [], outputs: [], conditional: null, knowledgeBase: [], reads: [] },
    { name: 'beads', description: 'Beads', phase: 'foundation', order: 200, dependencies: [], outputs: [], conditional: 'if-needed', knowledgeBase: [], reads: [] },
  ]

  it('returns steps for selected phases in topological order', () => {
    const state = makeState({
      'create-prd': { status: 'completed' },
      'review-prd': { status: 'completed' },
      'tech-stack': { status: 'completed' },
      'beads': { status: 'completed' },
    })
    const presetSteps = new Map(metaPrompts.map(m => [m.name, { enabled: true }]))
    const graph = buildGraph(metaPrompts, presetSteps)
    const result = resolveStepsForPhases([1], metaPrompts, state, graph)

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('create-prd')
    expect(result[1].name).toBe('review-prd')
    expect(result[0].phase).toBe(1)
  })

  it('filters out conditional steps that are skipped in state', () => {
    const state = makeState({
      'create-prd': { status: 'completed' },
      'review-prd': { status: 'completed' },
      'tech-stack': { status: 'completed' },
      'beads': { status: 'skipped' },
    })
    const presetSteps = new Map(metaPrompts.map(m => [m.name, { enabled: true }]))
    const graph = buildGraph(metaPrompts, presetSteps)
    const result = resolveStepsForPhases([2], metaPrompts, state, graph)

    // beads is conditional and skipped — should be filtered out
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('tech-stack')
  })

  it('returns steps across multiple phases in correct order', () => {
    const state = makeState({
      'create-prd': { status: 'completed' },
      'review-prd': { status: 'completed' },
      'tech-stack': { status: 'completed' },
      'beads': { status: 'completed' },
    })
    const presetSteps = new Map(metaPrompts.map(m => [m.name, { enabled: true }]))
    const graph = buildGraph(metaPrompts, presetSteps)
    const result = resolveStepsForPhases([1, 2], metaPrompts, state, graph)

    expect(result).toHaveLength(4)
    // Phase 1 steps come before phase 2 (by topological order)
    const names = result.map(s => s.name)
    expect(names.indexOf('create-prd')).toBeLessThan(names.indexOf('review-prd'))
  })

  it('returns empty array for empty phase', () => {
    const state = makeState({})
    const presetSteps = new Map(metaPrompts.map(m => [m.name, { enabled: true }]))
    const graph = buildGraph(metaPrompts, presetSteps)
    // Phase 4 (integration) has no steps in our test data
    const result = resolveStepsForPhases([4], metaPrompts, state, graph)
    expect(result).toEqual([])
  })
})
