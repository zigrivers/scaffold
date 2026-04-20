import { describe, it, expect } from 'vitest'
import { generateMultiServiceDashboardData } from './generator.js'
import type { MultiServiceGeneratorOptions } from './generator.js'
import type { PipelineState, MetaPromptFile } from '../types/index.js'
import { PHASES } from '../types/frontmatter.js'

function makeState(
  steps: PipelineState['steps'],
  nextEligible: string[] = [],
): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps,
    next_eligible: nextEligible,
    'extra-steps': [],
  }
}

function makeMetaPrompt(
  name: string,
  phase: string,
  order: number,
  overrides: Partial<MetaPromptFile['frontmatter']> = {},
): MetaPromptFile {
  return {
    stepName: name,
    filePath: `/pipeline/${name}.md`,
    frontmatter: {
      name,
      description: `Description for ${name}`,
      summary: `Summary for ${name}`,
      phase,
      order,
      dependencies: [],
      outputs: [`docs/${name}.md`],
      conditional: null,
      knowledgeBase: [],
      reads: [],
      stateless: false,
      category: 'pipeline',
      ...overrides,
    },
    body: `# ${name}\n\nBody for ${name}.`,
    sections: {},
  }
}

function makeMetaPrompts(entries: Array<[string, string, number, Partial<MetaPromptFile['frontmatter']>?]>): Map<string, MetaPromptFile> {
  const map = new Map<string, MetaPromptFile>()
  for (const [name, phase, order, overrides] of entries) {
    map.set(name, makeMetaPrompt(name, phase, order, overrides ?? {}))
  }
  return map
}

describe('generateMultiServiceDashboardData', () => {
  it('aggregates two services with different progress levels', () => {
    const metaPrompts = makeMetaPrompts([
      ['create-prd', 'pre', 100],
      ['user-stories', 'pre', 110],
      ['tech-stack', 'foundation', 200],
      ['system-architecture', 'architecture', 700],
    ])

    // Service A: 2 completed out of 4 → 50%
    const stateA = makeState({
      'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
      'user-stories': { status: 'completed', source: 'pipeline', produces: [] },
      'tech-stack': { status: 'pending', source: 'pipeline', produces: [] },
      'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
    }, ['tech-stack'])

    // Service B: 1 completed + 1 skipped out of 4 → 50% too, but different
    const stateB = makeState({
      'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
      'user-stories': { status: 'skipped', source: 'pipeline', produces: [] },
      'tech-stack': { status: 'in_progress', source: 'pipeline', produces: [] },
      'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
    }, ['system-architecture'])

    const opts: MultiServiceGeneratorOptions = {
      services: [
        { name: 'svc-a', projectType: 'backend', state: stateA, metaPrompts },
        { name: 'svc-b', projectType: 'web-app', state: stateB, metaPrompts },
      ],
      methodology: 'deep',
    }

    const data = generateMultiServiceDashboardData(opts)

    expect(data.services).toHaveLength(2)
    expect(data.aggregate.totalServices).toBe(2)

    const a = data.services.find(s => s.name === 'svc-a')!
    const b = data.services.find(s => s.name === 'svc-b')!

    expect(a.completed).toBe(2)
    expect(a.skipped).toBe(0)
    expect(a.pending).toBe(2)
    expect(a.inProgress).toBe(0)
    expect(a.total).toBe(4)
    expect(a.percentage).toBe(50)
    expect(a.projectType).toBe('backend')

    expect(b.completed).toBe(1)
    expect(b.skipped).toBe(1)
    expect(b.pending).toBe(1)
    expect(b.inProgress).toBe(1)
    expect(b.total).toBe(4)
    expect(b.percentage).toBe(50)
    expect(b.projectType).toBe('web-app')

    expect(data.aggregate.averagePercentage).toBe(50)
    expect(data.aggregate.servicesComplete).toBe(0)
  })

  it('handles empty services array', () => {
    const data = generateMultiServiceDashboardData({
      services: [],
      methodology: 'deep',
    })

    expect(data.services).toEqual([])
    expect(data.aggregate.totalServices).toBe(0)
    expect(data.aggregate.averagePercentage).toBe(0)
    expect(data.aggregate.servicesComplete).toBe(0)
    expect(data.aggregate.servicesByPhase).toHaveLength(PHASES.length)
    for (const phase of data.aggregate.servicesByPhase) {
      expect(phase.reachedCount).toBe(0)
    }
  })

  it('single service at 100% → averagePercentage 100, servicesComplete 1', () => {
    const metaPrompts = makeMetaPrompts([
      ['create-prd', 'pre', 100],
      ['user-stories', 'pre', 110],
    ])

    const state = makeState({
      'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
      'user-stories': { status: 'skipped', source: 'pipeline', produces: [] },
    }, [])

    const data = generateMultiServiceDashboardData({
      services: [
        { name: 'svc-done', projectType: 'library', state, metaPrompts },
      ],
      methodology: 'deep',
    })

    expect(data.aggregate.averagePercentage).toBe(100)
    expect(data.aggregate.servicesComplete).toBe(1)
    expect(data.services[0].percentage).toBe(100)
    expect(data.services[0].currentPhaseNumber).toBeNull()
    expect(data.services[0].currentPhaseName).toBeNull()
  })

  it('currentPhaseNumber is lowest phase with pending/in_progress', () => {
    const metaPrompts = makeMetaPrompts([
      ['create-prd', 'pre', 100],
      ['tech-stack', 'foundation', 200],
      ['system-architecture', 'architecture', 700],
    ])

    // create-prd completed (pre), tech-stack pending (foundation),
    // system-architecture in_progress (architecture)
    // Lowest phase with pending/in_progress = foundation (number 2)
    const state = makeState({
      'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
      'tech-stack': { status: 'pending', source: 'pipeline', produces: [] },
      'system-architecture': { status: 'in_progress', source: 'pipeline', produces: [] },
    }, ['tech-stack'])

    const data = generateMultiServiceDashboardData({
      services: [
        { name: 'svc', projectType: 'backend', state, metaPrompts },
      ],
      methodology: 'deep',
    })

    expect(data.services[0].currentPhaseNumber).toBe(2)
    expect(data.services[0].currentPhaseName).toBe('Project Foundation')
  })

  it('currentPhaseNumber null when all steps completed/skipped', () => {
    const metaPrompts = makeMetaPrompts([
      ['create-prd', 'pre', 100],
      ['tech-stack', 'foundation', 200],
    ])

    const state = makeState({
      'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
      'tech-stack': { status: 'skipped', source: 'pipeline', produces: [] },
    }, [])

    const data = generateMultiServiceDashboardData({
      services: [
        { name: 'svc-done', projectType: 'backend', state, metaPrompts },
      ],
      methodology: 'deep',
    })

    expect(data.services[0].currentPhaseNumber).toBeNull()
    expect(data.services[0].currentPhaseName).toBeNull()
  })

  it('nextEligibleSlug reads from state.next_eligible[0]; null when empty', () => {
    const metaPrompts = makeMetaPrompts([
      ['create-prd', 'pre', 100],
      ['user-stories', 'pre', 110, { summary: 'Write user stories' }],
    ])

    const stateWithNext = makeState({
      'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
      'user-stories': { status: 'pending', source: 'pipeline', produces: [] },
    }, ['user-stories'])

    const stateEmptyNext = makeState({
      'create-prd': { status: 'pending', source: 'pipeline', produces: [] },
    }, [])

    const data = generateMultiServiceDashboardData({
      services: [
        { name: 'svc-a', projectType: 'backend', state: stateWithNext, metaPrompts },
        { name: 'svc-b', projectType: 'backend', state: stateEmptyNext, metaPrompts },
      ],
      methodology: 'deep',
    })

    const a = data.services.find(s => s.name === 'svc-a')!
    const b = data.services.find(s => s.name === 'svc-b')!

    expect(a.nextEligibleSlug).toBe('user-stories')
    expect(a.nextEligibleSummary).toBe('Write user stories')
    expect(b.nextEligibleSlug).toBeNull()
    expect(b.nextEligibleSummary).toBeNull()
  })

  it('servicesByPhase counts services with ≥1 completed/skipped step per phase', () => {
    const metaPrompts = makeMetaPrompts([
      ['create-prd', 'pre', 100],
      ['tech-stack', 'foundation', 200],
      ['system-architecture', 'architecture', 700],
    ])

    // Service A reached pre (completed) but not foundation
    const stateA = makeState({
      'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
      'tech-stack': { status: 'pending', source: 'pipeline', produces: [] },
    })
    // Service B reached pre (skipped) and foundation (completed)
    const stateB = makeState({
      'create-prd': { status: 'skipped', source: 'pipeline', produces: [] },
      'tech-stack': { status: 'completed', source: 'pipeline', produces: [] },
    })
    // Service C reached pre, foundation, and architecture
    const stateC = makeState({
      'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
      'tech-stack': { status: 'completed', source: 'pipeline', produces: [] },
      'system-architecture': { status: 'completed', source: 'pipeline', produces: [] },
    })

    const data = generateMultiServiceDashboardData({
      services: [
        { name: 'a', projectType: 'backend', state: stateA, metaPrompts },
        { name: 'b', projectType: 'backend', state: stateB, metaPrompts },
        { name: 'c', projectType: 'backend', state: stateC, metaPrompts },
      ],
      methodology: 'deep',
    })

    const pre = data.aggregate.servicesByPhase.find(p => p.phaseSlug === 'pre')!
    const foundation = data.aggregate.servicesByPhase.find(p => p.phaseSlug === 'foundation')!
    const architecture = data.aggregate.servicesByPhase.find(p => p.phaseSlug === 'architecture')!
    const vision = data.aggregate.servicesByPhase.find(p => p.phaseSlug === 'vision')!

    expect(pre.reachedCount).toBe(3)
    expect(foundation.reachedCount).toBe(2)
    expect(architecture.reachedCount).toBe(1)
    expect(vision.reachedCount).toBe(0)

    // metadata
    expect(pre.phaseName).toBe('Product Definition')
    expect(pre.phaseNumber).toBe(1)
  })

  it('preserves service order from input', () => {
    const metaPrompts = makeMetaPrompts([
      ['create-prd', 'pre', 100],
    ])
    const mkSt = () => makeState({
      'create-prd': { status: 'pending', source: 'pipeline', produces: [] },
    })

    const data = generateMultiServiceDashboardData({
      services: [
        { name: 'zeta', projectType: 'backend', state: mkSt(), metaPrompts },
        { name: 'alpha', projectType: 'backend', state: mkSt(), metaPrompts },
        { name: 'middle', projectType: 'backend', state: mkSt(), metaPrompts },
      ],
      methodology: 'deep',
    })

    expect(data.services.map(s => s.name)).toEqual(['zeta', 'alpha', 'middle'])
  })

  it('includes methodology and scaffoldVersion in output', () => {
    const data = generateMultiServiceDashboardData({
      services: [],
      methodology: 'mvp',
    })
    expect(data.methodology).toBe('mvp')
    expect(typeof data.scaffoldVersion).toBe('string')
    expect(data.scaffoldVersion.length).toBeGreaterThan(0)
    expect(typeof data.generatedAt).toBe('string')
  })
})
