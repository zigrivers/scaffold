import { describe, it, expect } from 'vitest'
import { generateMultiServiceDashboardData, generateMultiServiceHtml } from './generator.js'
import type { MultiServiceGeneratorOptions, MultiServiceDashboardData } from './generator.js'
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

type FmOverrides = Partial<MetaPromptFile['frontmatter']>
function makeMetaPrompts(
  entries: Array<[string, string, number, FmOverrides?]>,
): Map<string, MetaPromptFile> {
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

// ---------- HTML rendering ----------

function makeMultiData(overrides: Partial<MultiServiceDashboardData> = {}): MultiServiceDashboardData {
  const base: MultiServiceDashboardData = {
    generatedAt: new Date().toISOString(),
    methodology: 'deep',
    scaffoldVersion: '3.20.0',
    services: [
      {
        name: 'api-service',
        projectType: 'backend',
        percentage: 42,
        completed: 3,
        skipped: 1,
        pending: 5,
        inProgress: 1,
        total: 10,
        currentPhaseNumber: 3,
        currentPhaseName: 'System Architecture',
        nextEligibleSlug: 'create-prd',
        nextEligibleSummary: 'Define the product',
      },
      {
        name: 'web-client',
        projectType: 'web-app',
        percentage: 100,
        completed: 8,
        skipped: 2,
        pending: 0,
        inProgress: 0,
        total: 10,
        currentPhaseNumber: null,
        currentPhaseName: null,
        nextEligibleSlug: null,
        nextEligibleSummary: null,
      },
    ],
    aggregate: {
      totalServices: 2,
      averagePercentage: 71,
      servicesComplete: 1,
      servicesByPhase: [
        { phaseSlug: 'pre', phaseName: 'Product Definition', phaseNumber: 1, reachedCount: 2 },
        { phaseSlug: 'foundation', phaseName: 'Project Foundation', phaseNumber: 2, reachedCount: 1 },
      ],
    },
  }
  return { ...base, ...overrides }
}

describe('generateMultiServiceHtml', () => {
  it('renders service names', () => {
    const html = generateMultiServiceHtml(makeMultiData())
    expect(html).toContain('api-service')
    expect(html).toContain('web-client')
  })

  it('renders project types', () => {
    const html = generateMultiServiceHtml(makeMultiData())
    expect(html).toContain('backend')
    expect(html).toContain('web-app')
  })

  it('renders progress percentages', () => {
    const html = generateMultiServiceHtml(makeMultiData())
    expect(html).toContain('42%')
    expect(html).toContain('100%')
    // aggregate
    expect(html).toContain('71%')
  })

  it('renders current phase or Complete badge', () => {
    const html = generateMultiServiceHtml(makeMultiData())
    // api-service has phase 3 → System Architecture
    expect(html).toContain('Phase 3')
    expect(html).toContain('System Architecture')
    // web-client is complete
    expect(html).toContain('Complete')
  })

  it('renders next eligible slug when present', () => {
    const html = generateMultiServiceHtml(makeMultiData())
    expect(html).toContain('create-prd')
    expect(html).toContain('Next')
  })

  it('escapes HTML in service names (XSS guard)', () => {
    const data = makeMultiData({
      services: [
        {
          name: '<script>alert(1)</script>',
          projectType: '<img src=x>',
          percentage: 0,
          completed: 0,
          skipped: 0,
          pending: 1,
          inProgress: 0,
          total: 1,
          currentPhaseNumber: 1,
          currentPhaseName: 'Product Definition',
          nextEligibleSlug: '<b>evil</b>',
          nextEligibleSummary: null,
        },
      ],
    })
    const html = generateMultiServiceHtml(data)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;')
  })

  it('embeds data JSON in a script tag', () => {
    const data = makeMultiData()
    const html = generateMultiServiceHtml(data)
    expect(html).toContain('<script id="scaffold-data" type="application/json">')
    // JSON payload is embedded — service names should appear within the JSON block
    expect(html).toContain('"api-service"')
    expect(html).toContain('"web-client"')
  })

  it('renders services-by-phase aggregate row', () => {
    const html = generateMultiServiceHtml(makeMultiData())
    expect(html).toContain('Product Definition')
    expect(html).toContain('Project Foundation')
  })

  it('renders "Not started" badge for skeleton service with total=0 (MMR P1 lock)', () => {
    // Regression guard: previously currentPhaseNumber === null was treated as
    // "Complete" — but missing-state skeletons also have null phase. Must be
    // distinguished by total > 0.
    const data: ReturnType<typeof generateMultiServiceDashboardData> = {
      generatedAt: '2026-04-20T00:00:00.000Z',
      methodology: 'deep',
      scaffoldVersion: '3.20.0',
      services: [{
        name: 'skeleton', projectType: 'backend',
        percentage: 0, completed: 0, skipped: 0, pending: 0, inProgress: 0, total: 0,
        currentPhaseNumber: null, currentPhaseName: null,
        nextEligibleSlug: null, nextEligibleSummary: null,
      }],
      aggregate: {
        totalServices: 1, averagePercentage: 0, servicesComplete: 0,
        servicesByPhase: [],
      },
    }
    const html = generateMultiServiceHtml(data)
    expect(html).toContain('Not started')
    // The "Complete" label MUST NOT be rendered (CSS class definition for the
    // badge can exist in the stylesheet — but the span with that class should not).
    expect(html).not.toMatch(/<span class="service-complete-badge">/)
  })

  it('uses data-copy attribute instead of inline onclick (XSS hardening, Codex MMR P1)', () => {
    const data: ReturnType<typeof generateMultiServiceDashboardData> = {
      generatedAt: '2026-04-20T00:00:00.000Z',
      methodology: 'deep',
      scaffoldVersion: '3.20.0',
      services: [{
        name: 'evil\\\');alert(1)//', projectType: 'backend',
        percentage: 50, completed: 1, skipped: 0, pending: 1, inProgress: 0, total: 2,
        currentPhaseNumber: 1, currentPhaseName: 'Product Definition',
        nextEligibleSlug: null, nextEligibleSummary: null,
      }],
      aggregate: {
        totalServices: 1, averagePercentage: 50, servicesComplete: 0,
        servicesByPhase: [],
      },
    }
    const html = generateMultiServiceHtml(data)
    // No inline onclick on the service card (attribute-based click handler only).
    expect(html).not.toMatch(/<div class="service-card"[^>]*onclick=/)
    // data-copy attribute carries the command — HTML-escaped but not
    // JS-string-escaped, so the backslash/quote attacker payload cannot
    // escape any JS context.
    expect(html).toContain('data-copy="scaffold dashboard --service')
  })
})

describe('generateMultiServiceDashboardData — averagePercentage rounding', () => {
  it('computes averagePercentage from raw ratios, not double-rounded per-service percentages (Codex MMR P3)', () => {
    // Service A: 1/40 = 2.5% (rounds to 3). Service B: 0/1 = 0% (rounds to 0).
    // Raw mean of ratios: (0.025 + 0) / 2 = 0.0125 → 1% after one round.
    // Double-rounded would give (3 + 0) / 2 = 1.5 → 2%. Lock the correct value.
    const stepsA: Record<string, { status: 'completed' | 'pending'; source: 'pipeline'; produces: string[] }> = {}
    for (let i = 0; i < 40; i++) {
      stepsA[`a${i}`] = i === 0
        ? { status: 'completed', source: 'pipeline', produces: [] }
        : { status: 'pending', source: 'pipeline', produces: [] }
    }
    const data = generateMultiServiceDashboardData({
      methodology: 'deep',
      services: [
        {
          name: 'svc-a', projectType: 'backend',
          state: {
            'schema-version': 3, 'scaffold-version': '1.0.0',
            init_methodology: 'deep', config_methodology: 'deep',
            'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
            in_progress: null, steps: stepsA,
            next_eligible: [], 'extra-steps': [],
          },
        },
        {
          name: 'svc-b', projectType: 'backend',
          state: {
            'schema-version': 3, 'scaffold-version': '1.0.0',
            init_methodology: 'deep', config_methodology: 'deep',
            'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
            in_progress: null,
            steps: { 'b0': { status: 'pending', source: 'pipeline', produces: [] } },
            next_eligible: [], 'extra-steps': [],
          },
        },
      ],
    })
    expect(data.aggregate.averagePercentage).toBe(1)
  })

  it('nextEligibleSummary does NOT fall back to description (MMR P2 lock)', () => {
    // Regression guard: earlier code used `fm?.summary ?? fm?.description ?? null`.
    // Single-service behavior is summary-only; multi-service must match so the
    // card line doesn't get flooded with long descriptions.
    const stepSteps: Record<string, { status: 'pending'; source: 'pipeline'; produces: string[] }> = {
      'desc-only-step': { status: 'pending', source: 'pipeline', produces: [] },
    }
    // Meta prompt with description but NO summary
    const mp: Map<string, MetaPromptFile> = new Map([
      ['desc-only-step', {
        stepName: 'desc-only-step',
        filePath: '/fake.md',
        frontmatter: {
          name: 'desc-only-step', description: 'A long description that should NOT leak',
          summary: null,
          phase: 'architecture', order: 1,
          dependencies: [], outputs: [], conditional: null,
          knowledgeBase: [], reads: [], crossReads: [],
          stateless: false, category: 'pipeline',
        },
        body: '', sections: {},
      }],
    ])
    const data = generateMultiServiceDashboardData({
      methodology: 'deep',
      services: [{
        name: 's', projectType: 'backend', metaPrompts: mp,
        state: {
          'schema-version': 3, 'scaffold-version': '1.0.0',
          init_methodology: 'deep', config_methodology: 'deep',
          'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
          in_progress: null, steps: stepSteps,
          next_eligible: ['desc-only-step'], 'extra-steps': [],
        },
      }],
    })
    expect(data.services[0].nextEligibleSlug).toBe('desc-only-step')
    expect(data.services[0].nextEligibleSummary).toBeNull()
  })

  it('skeleton service (total=0) is not counted as complete in servicesComplete', () => {
    const data = generateMultiServiceDashboardData({
      methodology: 'deep',
      services: [{
        name: 'skel', projectType: 'backend',
        state: {
          'schema-version': 3, 'scaffold-version': '1.0.0',
          init_methodology: 'deep', config_methodology: 'deep',
          'init-mode': 'greenfield', created: '2026-04-20T00:00:00.000Z',
          in_progress: null, steps: {},
          next_eligible: [], 'extra-steps': [],
        },
      }],
    })
    expect(data.aggregate.servicesComplete).toBe(0)
    expect(data.services[0].total).toBe(0)
    expect(data.services[0].percentage).toBe(0)
  })
})
