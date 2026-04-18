// NOTE: These tests cover core eligibility logic including overlay-disabled deps.
// Full integration testing of eligibility with overlay-resolved state (e.g., game
// overlay changing which steps are enabled/disabled) is covered by E2E tests.

import { describe, it, expect } from 'vitest'
import type { MetaPromptFrontmatter, StepStateEntry } from '../../types/index.js'
import { buildGraph } from './graph.js'
import { computeEligible, getParallelSets } from './eligibility.js'

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

function makeEntry(status: StepStateEntry['status']): StepStateEntry {
  return { status, source: 'pipeline' }
}

// Graph: a → b → d, a → c → d
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
// computeEligible
// ---------------------------------------------------------------------------

describe('computeEligible', () => {
  it('returns steps with no deps when all pending', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const steps: Record<string, StepStateEntry> = {
      a: makeEntry('pending'),
      b: makeEntry('pending'),
      c: makeEntry('pending'),
      d: makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps)
    // Only 'a' has no deps
    expect(eligible).toEqual(['a'])
  })

  it('returns steps whose deps are all completed', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const steps: Record<string, StepStateEntry> = {
      a: makeEntry('completed'),
      b: makeEntry('pending'),
      c: makeEntry('pending'),
      d: makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps)
    // b and c both depend only on a (completed)
    expect(eligible).toContain('b')
    expect(eligible).toContain('c')
    expect(eligible).not.toContain('d') // d needs b and c
    expect(eligible).not.toContain('a') // a is completed
  })

  it('excludes in_progress steps', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const steps: Record<string, StepStateEntry> = {
      a: makeEntry('in_progress'),
      b: makeEntry('pending'),
      c: makeEntry('pending'),
      d: makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps)
    // a is in_progress (not pending) → excluded
    expect(eligible).not.toContain('a')
    // b and c deps (a) not completed → not eligible
    expect(eligible).not.toContain('b')
    expect(eligible).not.toContain('c')
  })

  it('excludes completed steps', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const steps: Record<string, StepStateEntry> = {
      a: makeEntry('completed'),
      b: makeEntry('completed'),
      c: makeEntry('completed'),
      d: makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps)
    // Only d remains pending with all deps completed
    expect(eligible).toEqual(['d'])
  })

  it('treats skipped deps as satisfied', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const steps: Record<string, StepStateEntry> = {
      a: makeEntry('skipped'),
      b: makeEntry('pending'),
      c: makeEntry('pending'),
      d: makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps)
    expect(eligible).toContain('b')
    expect(eligible).toContain('c')
  })

  it('treats disabled steps as satisfied for dependency resolution', () => {
    // Disable 'a'; b and c depend on it
    const preset = new Map([
      ['a', { enabled: false }],
      ['b', { enabled: true }],
      ['c', { enabled: true }],
      ['d', { enabled: true }],
    ])
    const graph = buildGraph(frontmatters, preset)
    const steps: Record<string, StepStateEntry> = {
      b: makeEntry('pending'),
      c: makeEntry('pending'),
      d: makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps)
    // b and c should be eligible since their dep (a) is disabled
    expect(eligible).toContain('b')
    expect(eligible).toContain('c')
  })

  it('excludes disabled steps from eligible list', () => {
    const preset = new Map([
      ['a', { enabled: false }],
      ['b', { enabled: true }],
      ['c', { enabled: true }],
      ['d', { enabled: true }],
    ])
    const graph = buildGraph(frontmatters, preset)
    const steps: Record<string, StepStateEntry> = {
      a: makeEntry('pending'),
      b: makeEntry('pending'),
      c: makeEntry('pending'),
      d: makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps)
    expect(eligible).not.toContain('a')
  })

  // ---------------------------------------------------------------------------
  // Scope filtering and fan-in
  // ---------------------------------------------------------------------------

  // Graph for scope tests:
  //   global-init (global, no deps)
  //   svc-setup (service, depends on global-init)
  //   global-finalize (global, depends on svc-setup — fan-in case)
  const scopeFrontmatters: MetaPromptFrontmatter[] = [
    makeFm('global-init', 'pre', 1, []),
    makeFm('svc-setup', 'pre', 2, ['global-init']),
    makeFm('global-finalize', 'pre', 3, ['svc-setup']),
  ]

  const scopeAllEnabled = new Map([
    ['global-init', { enabled: true }],
    ['svc-setup', { enabled: true }],
    ['global-finalize', { enabled: true }],
  ])

  // global-init and global-finalize are "global"; svc-setup is per-service
  const globalStepsSet = new Set(['global-init', 'global-finalize'])

  it("scope='service' filters out global steps", () => {
    const graph = buildGraph(scopeFrontmatters, scopeAllEnabled)
    const steps: Record<string, StepStateEntry> = {
      'global-init': makeEntry('completed'),
      'svc-setup': makeEntry('pending'),
      'global-finalize': makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps, {
      scope: 'service',
      globalSteps: globalStepsSet,
    })
    // global-init and global-finalize must be excluded
    expect(eligible).not.toContain('global-init')
    expect(eligible).not.toContain('global-finalize')
    // svc-setup dep (global-init) is completed → eligible
    expect(eligible).toContain('svc-setup')
  })

  it("scope='global' filters out per-service steps", () => {
    const graph = buildGraph(scopeFrontmatters, scopeAllEnabled)
    const steps: Record<string, StepStateEntry> = {
      'global-init': makeEntry('pending'),
      'svc-setup': makeEntry('pending'),
      'global-finalize': makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps, {
      scope: 'global',
      globalSteps: globalStepsSet,
    })
    // svc-setup is per-service → must be excluded
    expect(eligible).not.toContain('svc-setup')
    // global-init has no deps → eligible
    expect(eligible).toContain('global-init')
  })

  it("scope='global' auto-satisfies per-service deps (fan-in)", () => {
    const graph = buildGraph(scopeFrontmatters, scopeAllEnabled)
    // global-finalize depends on svc-setup (per-service); svc-setup is not completed
    // but in global scope, per-service deps are auto-satisfied
    const steps: Record<string, StepStateEntry> = {
      'global-init': makeEntry('completed'),
      'svc-setup': makeEntry('pending'), // NOT completed — fan-in should still satisfy it
      'global-finalize': makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps, {
      scope: 'global',
      globalSteps: globalStepsSet,
    })
    // global-finalize's dep on svc-setup (per-service) should be auto-satisfied
    expect(eligible).toContain('global-finalize')
  })

  it('no scope = default behavior (backward compat)', () => {
    // Without options, behaves exactly as before: both global and service steps visible
    const graph = buildGraph(scopeFrontmatters, scopeAllEnabled)
    const steps: Record<string, StepStateEntry> = {
      'global-init': makeEntry('pending'),
      'svc-setup': makeEntry('pending'),
      'global-finalize': makeEntry('pending'),
    }
    const eligible = computeEligible(graph, steps)
    // Only global-init has no deps → eligible; others have unsatisfied deps
    expect(eligible).toEqual(['global-init'])
    expect(eligible).not.toContain('svc-setup')
    expect(eligible).not.toContain('global-finalize')
  })
})

// ---------------------------------------------------------------------------
// getParallelSets
// ---------------------------------------------------------------------------

describe('getParallelSets', () => {
  it('groups steps by phase', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const sets = getParallelSets(graph)

    // Two phases: 'pre' and 'modeling'
    expect(sets).toHaveLength(2)

    const preSet = sets[0]
    const modelingSet = sets[1]

    expect(preSet).toContain('a')
    expect(preSet).toContain('b')
    expect(modelingSet).toContain('c')
    expect(modelingSet).toContain('d')
  })

  it('sorts phases by PHASE_SORT_ORDER', () => {
    const fms: MetaPromptFrontmatter[] = [
      makeFm('fin', 'finalization', 9, []),
      makeFm('pre', 'pre', 1, []),
      makeFm('plan', 'planning', 7, []),
    ]
    const preset = new Map([
      ['fin', { enabled: true }],
      ['pre', { enabled: true }],
      ['plan', { enabled: true }],
    ])
    const graph = buildGraph(fms, preset)
    const sets = getParallelSets(graph)

    // pre (0) < planning (6) < finalization (8)
    const phases = sets.map(set => {
      const slug = set[0]
      return graph.nodes.get(slug)?.phase
    })
    expect(phases).toEqual(['pre', 'planning', 'finalization'])
  })

  it('excludes disabled steps', () => {
    const preset = new Map([
      ['a', { enabled: false }],
      ['b', { enabled: true }],
      ['c', { enabled: true }],
      ['d', { enabled: true }],
    ])
    const graph = buildGraph(frontmatters, preset)
    const sets = getParallelSets(graph)
    const allSlugs = sets.flat()
    expect(allSlugs).not.toContain('a')
  })

  it('sorts steps within a phase by order field', () => {
    const graph = buildGraph(frontmatters, allEnabled)
    const sets = getParallelSets(graph)

    const preSet = sets[0] // contains a (order 1) and b (order 2)
    expect(preSet.indexOf('a')).toBeLessThan(preSet.indexOf('b'))
  })
})
