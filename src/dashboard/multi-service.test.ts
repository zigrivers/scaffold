import { describe, it, expect } from 'vitest'
import {
  generateMultiServiceDashboardData, generateMultiServiceHtml,
  generateHtml, generateDashboardData,
} from './generator.js'
import type { MultiServiceGeneratorOptions, MultiServiceDashboardData } from './generator.js'
import type { PipelineState, MetaPromptFile } from '../types/index.js'
import { PHASES } from '../types/frontmatter.js'
import { renderDependencyGraphSection } from './template.js'

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

describe('generateMultiServiceDashboardData — dependencyGraph pass-through', () => {
  const baseOpts = (): MultiServiceGeneratorOptions => ({
    services: [],
    methodology: 'deep',
  })

  it('returns dependencyGraph as null when option omitted', () => {
    const data = generateMultiServiceDashboardData(baseOpts())
    expect(data.dependencyGraph).toBeNull()
  })

  it('normalizes undefined input to null', () => {
    const data = generateMultiServiceDashboardData({ ...baseOpts(), dependencyGraph: undefined })
    expect(data.dependencyGraph).toBeNull()
  })

  it('normalizes null input to null', () => {
    const data = generateMultiServiceDashboardData({ ...baseOpts(), dependencyGraph: null })
    expect(data.dependencyGraph).toBeNull()
  })

  it('passes populated DependencyGraphData through unchanged', () => {
    const graph = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 10, y: 20 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 230, y: 20 },
      ],
      edges: [{
        consumer: 'web', producer: 'api',
        steps: [{ consumerStep: 'impl', producerStep: 'prd', status: 'completed' as const }],
        svgPath: 'M 230 42 C 175 42, 175 42, 150 42',
      }],
      viewBox: { width: 380, height: 92 },
    }
    const data = generateMultiServiceDashboardData({ ...baseOpts(), dependencyGraph: graph })
    expect(data.dependencyGraph).toBe(graph)
  })
})

describe('renderDependencyGraphSection', () => {
  // Helper: extract data-steps attribute JSON for an edge (works around no jsdom).
  function extractDataSteps(html: string, consumer: string, producer: string) {
    const pattern = new RegExp(
      `data-consumer="${consumer}"[^>]*data-producer="${producer}"[^>]*data-steps="([^"]*)"`,
    )
    const match = html.match(pattern)
    if (!match) throw new Error(`edge ${consumer} -> ${producer} not found`)
    const json = match[1].replace(/&quot;/g, '"')
    return JSON.parse(json)
  }

  it('test 14: returns empty string for null and undefined', () => {
    expect(renderDependencyGraphSection(null)).toBe('')
    expect(renderDependencyGraphSection(undefined)).toBe('')
  })

  it('test 15: small graph renders <section class="dep-graph"> with expected viewBox', () => {
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 24, y: 24 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 244, y: 24 },
      ],
      edges: [
        { consumer: 'web', producer: 'api', steps: [
          { consumerStep: 'impl', producerStep: 'prd', status: 'completed' as const },
        ], svgPath: 'M 244 46 C 192 46, 192 46, 164 46' },
      ],
      viewBox: { width: 408, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toContain('<section class="dep-graph"')
    expect(html).toContain('viewBox="0 0 408 92"')
    expect(html).toContain('data-consumer="web"')
    expect(html).toContain('data-producer="api"')
  })

  it('test 16: service names with special characters are HTML-escaped', () => {
    const data = {
      nodes: [
        { name: '<svc>&"a', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [
        { consumer: 'web', producer: '<svc>&"a', steps: [
          { consumerStep: 's', producerStep: 't', status: 'completed' as const },
        ], svgPath: 'M 0 0' },
      ],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toContain('&lt;svc&gt;&amp;&quot;a')
    // Raw form must NOT appear inside attribute values or text content.
    // Narrowed regex avoids matching inside SVG path bytes.
    expect(html).not.toMatch(/data-producer="<svc>&"a"/)
    expect(html).not.toMatch(/<text[^>]*>.*<svc>&"a.*<\/text>/)
  })

  it('test 17: data-steps round-trips via extractDataSteps helper', () => {
    const steps = [
      { consumerStep: 'impl-plan', producerStep: 'create-prd', status: 'completed' as const },
      { consumerStep: 'tech-stack', producerStep: 'arch', status: 'pending' as const },
    ]
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [{ consumer: 'web', producer: 'api', steps, svgPath: 'M 0 0' }],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    const extracted = extractDataSteps(html, 'web', 'api')
    expect(extracted).toEqual(steps)
  })

  it('test 18: defs contain <marker id="arrow" ... orient="auto">', () => {
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [{ consumer: 'web', producer: 'api', steps: [
        { consumerStep: 's', producerStep: 't', status: 'completed' as const },
      ], svgPath: 'M 0 0' }],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toMatch(/<marker\s+id="arrow"[^>]*orient="auto"/)
  })

  it('test 19: each edge has both dep-edge-hit and dep-edge-line paths', () => {
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [{ consumer: 'web', producer: 'api', steps: [
        { consumerStep: 's', producerStep: 't', status: 'completed' as const },
      ], svgPath: 'M 0 0' }],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toMatch(/class="dep-edge-hit"/)
    expect(html).toMatch(/class="dep-edge-line"/)
  })

  it('test 20: each edge <g> has tabindex="0" and a nested <title>', () => {
    const data = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 0, y: 0 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 220, y: 0 },
      ],
      edges: [{ consumer: 'web', producer: 'api', steps: [
        { consumerStep: 'impl', producerStep: 'prd', status: 'completed' as const },
      ], svgPath: 'M 0 0' }],
      viewBox: { width: 360, height: 92 },
    }
    const html: string = renderDependencyGraphSection(data)
    expect(html).toMatch(/<g class="dep-edge"[^>]*tabindex="0"/)
    expect(html).toMatch(/<title>[^<]*web:impl -&gt; api:prd \(completed\)[^<]*<\/title>/)
  })
})

describe('buildMultiServiceTemplate — dependency-graph CSS + JS', () => {
  function makeDashboardData(): MultiServiceDashboardData {
    return {
      generatedAt: new Date().toISOString(),
      methodology: 'deep',
      scaffoldVersion: '3.22.0',
      services: [],
      aggregate: {
        totalServices: 0,
        averagePercentage: 0,
        servicesComplete: 0,
        servicesByPhase: [],
      },
      dependencyGraph: null,
    }
  }

  it('CSS block declares .dep-graph, .dep-node-box, .dep-edge, and .dep-tooltip rules', () => {
    const html = generateMultiServiceHtml(makeDashboardData())
    expect(html).toMatch(/\.dep-graph\s*\{/)
    expect(html).toMatch(/\.dep-node-box\s*\{/)
    expect(html).toMatch(/\.dep-edge\s*\{/)
    expect(html).toMatch(/\.dep-tooltip\s*\{/)
  })

  it('JS block contains the dep-edge tooltip IIFE with textContent writes and no innerHTML', () => {
    const html = generateMultiServiceHtml(makeDashboardData())
    // IIFE presence
    expect(html).toMatch(/querySelectorAll\(['"]\.dep-edge['"]\)/)
    // Uses textContent (not innerHTML) for attacker-influenced strings
    expect(html).toContain('row.textContent =')
    // No innerHTML writes in the dep-tooltip JS segment
    const depSegmentMatch = html.match(/\/\/ ---------- Cross-service dependency graph JS ----------[\s\S]*?\}\)\(\);/)
    if (depSegmentMatch) {
      expect(depSegmentMatch[0]).not.toContain('innerHTML =')
    }
  })
})

describe('buildMultiServiceTemplate — dependencyGraph integration', () => {
  it('renders <section class="dep-graph"> between .aggregate-block and .services-grid when graph has edges', () => {
    const graph = {
      nodes: [
        { name: 'api', projectType: 'backend', layer: 0, x: 24, y: 24 },
        { name: 'web', projectType: 'web-app', layer: 1, x: 244, y: 24 },
      ],
      edges: [{
        consumer: 'web', producer: 'api', steps: [
          { consumerStep: 'impl', producerStep: 'prd', status: 'completed' as const },
        ],
        svgPath: 'M 244 46 C 192 46, 192 46, 164 46',
      }],
      viewBox: { width: 408, height: 92 },
    }
    const data: MultiServiceDashboardData = {
      generatedAt: new Date().toISOString(),
      methodology: 'deep',
      scaffoldVersion: '3.22.0',
      services: [],
      aggregate: {
        totalServices: 0, averagePercentage: 0, servicesComplete: 0,
        servicesByPhase: [],
      },
      dependencyGraph: graph,
    }
    const html = generateMultiServiceHtml(data)
    const aggPos = html.indexOf('<div class="aggregate-block">')
    const depPos = html.indexOf('<section class="dep-graph"')
    const gridPos = html.indexOf('<div class="services-grid">')
    expect(aggPos).toBeGreaterThan(-1)
    expect(depPos).toBeGreaterThan(-1)
    expect(gridPos).toBeGreaterThan(-1)
    expect(aggPos).toBeLessThan(depPos)
    expect(depPos).toBeLessThan(gridPos)
  })

  it('omits <section class="dep-graph"> entirely when dependencyGraph is null', () => {
    const data: MultiServiceDashboardData = {
      generatedAt: new Date().toISOString(),
      methodology: 'deep',
      scaffoldVersion: '3.22.0',
      services: [],
      aggregate: {
        totalServices: 0, averagePercentage: 0, servicesComplete: 0,
        servicesByPhase: [],
      },
      dependencyGraph: null,
    }
    const html = generateMultiServiceHtml(data)
    expect(html).not.toContain('<section class="dep-graph"')
  })

  it('single-service dashboard output does NOT include dep-graph section (spec §8.2 compat)', () => {
    // Use the single-service path via generateHtml + generateDashboardData.
    // The single-service path has NO dependencyGraph awareness at all; this
    // test locks that v3.21.0 single-service output remains unaffected.
    const state: PipelineState = {
      'schema-version': 3, 'scaffold-version': '3.22.0',
      init_methodology: 'deep', config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-21T00:00:00Z',
      in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
    } as PipelineState
    const html = generateHtml(generateDashboardData({
      state, decisions: [], methodology: 'deep',
    }))
    expect(html).not.toContain('dep-graph')
    expect(html).not.toContain('dep-edge')
    expect(html).not.toContain('dep-tooltip')
  })
})
