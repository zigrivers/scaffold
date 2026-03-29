import { describe, it, expect } from 'vitest'
import { generateDashboardData, generateHtml } from './generator.js'
import type { GeneratorOptions } from './generator.js'
import type { PipelineState, MetaPromptFile } from '../types/index.js'
import type { DecisionEntry } from '../types/index.js'

function makeState(overrides: Partial<PipelineState['steps']> = {}): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps: {
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-02T00:00:00.000Z',
        completed_by: 'claude',
        depth: 2,
        produces: ['docs/prd.md'],
      },
      'user-stories': {
        status: 'pending',
        source: 'pipeline',
        produces: [],
      },
      'system-architecture': {
        status: 'skipped',
        source: 'pipeline',
        at: '2024-01-03T00:00:00.000Z',
        reason: 'not needed',
        completed_by: 'user',
        produces: [],
      },
      'tech-stack': {
        status: 'in_progress',
        source: 'pipeline',
        at: '2024-01-04T00:00:00.000Z',
        produces: [],
      },
      ...overrides,
    },
    next_eligible: ['user-stories'],
    'extra-steps': [],
  }
}

function makeDecisions(): DecisionEntry[] {
  return [
    {
      id: 'D-001',
      prompt: 'create-prd',
      decision: 'Use PostgreSQL',
      at: '2024-01-02T00:00:00.000Z',
      completed_by: 'claude',
      step_completed: true,
    },
    {
      id: 'D-002',
      prompt: 'system-architecture',
      decision: 'Microservices approach',
      at: '2024-01-03T00:00:00.000Z',
      completed_by: 'user',
      step_completed: false,
    },
  ]
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
    body: `# ${name}\n\nMeta-prompt body content for ${name}.`,
    sections: {},
  }
}

function makeMetaPrompts(): Map<string, MetaPromptFile> {
  const map = new Map<string, MetaPromptFile>()
  map.set('create-prd', makeMetaPrompt('create-prd', 'pre', 100, {
    dependencies: [],
    outputs: ['docs/prd.md'],
  }))
  map.set('user-stories', makeMetaPrompt('user-stories', 'pre', 110, {
    dependencies: ['create-prd'],
    outputs: ['docs/user-stories.md'],
  }))
  map.set('system-architecture', makeMetaPrompt('system-architecture', 'architecture', 700, {
    dependencies: ['create-prd', 'user-stories'],
    outputs: ['docs/architecture.md'],
  }))
  map.set('tech-stack', makeMetaPrompt('tech-stack', 'foundation', 200, {
    dependencies: ['create-prd'],
    outputs: ['docs/tech-stack.md'],
    conditional: 'if-needed',
  }))
  return map
}

function makeOpts(overrides: Partial<GeneratorOptions> = {}): GeneratorOptions {
  return {
    state: makeState(),
    decisions: makeDecisions(),
    methodology: 'deep',
    ...overrides,
  }
}

describe('generateDashboardData', () => {
  it('returns correct progress counts', () => {
    const data = generateDashboardData(makeOpts())
    expect(data.progress.completed).toBe(1)
    expect(data.progress.skipped).toBe(1)
    expect(data.progress.pending).toBe(1)
    expect(data.progress.inProgress).toBe(1)
    expect(data.progress.total).toBe(4)
  })

  it('calculates percentage as (completed + skipped) / total * 100', () => {
    const data = generateDashboardData(makeOpts())
    // (1 completed + 1 skipped) / 4 total = 50%
    expect(data.progress.percentage).toBe(50)
  })

  it('includes all steps from state', () => {
    const data = generateDashboardData(makeOpts())
    expect(data.steps).toHaveLength(4)
    const slugs = data.steps.map(s => s.slug)
    expect(slugs).toContain('create-prd')
    expect(slugs).toContain('user-stories')
    expect(slugs).toContain('system-architecture')
    expect(slugs).toContain('tech-stack')
  })

  it('maps step status correctly', () => {
    const data = generateDashboardData(makeOpts())
    const prd = data.steps.find(s => s.slug === 'create-prd')
    expect(prd?.status).toBe('completed')
    expect(prd?.completedAt).toBe('2024-01-02T00:00:00.000Z')
    expect(prd?.completedBy).toBe('claude')
    expect(prd?.depth).toBe(2)
  })

  it('marks provisional decisions (step_completed === false)', () => {
    const data = generateDashboardData(makeOpts())
    const d1 = data.decisions.find(d => d.id === 'D-001')
    const d2 = data.decisions.find(d => d.id === 'D-002')
    expect(d1?.provisional).toBe(false)
    expect(d2?.provisional).toBe(true)
  })

  it('maps decisions with correct fields', () => {
    const data = generateDashboardData(makeOpts())
    const d1 = data.decisions.find(d => d.id === 'D-001')
    expect(d1?.step).toBe('create-prd')
    expect(d1?.decision).toBe('Use PostgreSQL')
    expect(d1?.timestamp).toBe('2024-01-02T00:00:00.000Z')
  })

  it('includes methodology in result', () => {
    const data = generateDashboardData(makeOpts({ methodology: 'mvp' }))
    expect(data.methodology).toBe('mvp')
  })

  it('returns percentage 0 when no steps', () => {
    const emptyState = { ...makeState(), steps: {} }
    const data = generateDashboardData(makeOpts({ state: emptyState }))
    expect(data.progress.total).toBe(0)
    expect(data.progress.percentage).toBe(0)
  })
})

describe('generateDashboardData (enriched)', () => {
  it('groups steps into phases with descriptions', () => {
    const data = generateDashboardData(makeOpts())
    expect(data.phases).toBeDefined()
    expect(data.phases.length).toBeGreaterThan(0)
    const prePhase = data.phases.find(p => p.slug === 'pre')
    expect(prePhase).toBeDefined()
    expect(prePhase!.displayName).toBe('Product Definition')
    expect(prePhase!.description).toBeTruthy()
  })

  it('phase counts are accurate', () => {
    const metaPrompts = makeMetaPrompts()
    const data = generateDashboardData(makeOpts({ metaPrompts }))

    const prePhase = data.phases.find(p => p.slug === 'pre')!
    // create-prd is completed, user-stories is pending
    expect(prePhase.counts.completed).toBe(1)
    expect(prePhase.counts.pending).toBe(1)
    expect(prePhase.counts.skipped).toBe(0)
    expect(prePhase.counts.inProgress).toBe(0)
    expect(prePhase.counts.total).toBe(2)

    const foundationPhase = data.phases.find(p => p.slug === 'foundation')!
    // tech-stack is in_progress
    expect(foundationPhase.counts.inProgress).toBe(1)
    expect(foundationPhase.counts.total).toBe(1)

    const archPhase = data.phases.find(p => p.slug === 'architecture')!
    // system-architecture is skipped
    expect(archPhase.counts.skipped).toBe(1)
    expect(archPhase.counts.total).toBe(1)
  })

  it('steps within phases sorted by order', () => {
    const metaPrompts = makeMetaPrompts()
    const data = generateDashboardData(makeOpts({ metaPrompts }))

    const prePhase = data.phases.find(p => p.slug === 'pre')!
    expect(prePhase.steps).toHaveLength(2)
    expect(prePhase.steps[0].slug).toBe('create-prd')    // order 100
    expect(prePhase.steps[1].slug).toBe('user-stories')   // order 110
  })

  it('nextEligible populated from state.next_eligible', () => {
    const metaPrompts = makeMetaPrompts()
    const data = generateDashboardData(makeOpts({ metaPrompts }))

    expect(data.nextEligible).not.toBeNull()
    expect(data.nextEligible!.slug).toBe('user-stories')
    expect(data.nextEligible!.description).toBe('Description for user-stories')
    expect(data.nextEligible!.summary).toBe('Summary for user-stories')
    expect(data.nextEligible!.command).toBe('/scaffold user-stories')
  })

  it('nextEligible null when all completed/skipped', () => {
    const allDoneState = makeState()
    allDoneState.next_eligible = []
    const data = generateDashboardData(makeOpts({ state: allDoneState }))

    expect(data.nextEligible).toBeNull()
  })

  it('meta-prompt body included when metaPrompts provided', () => {
    const metaPrompts = makeMetaPrompts()
    const data = generateDashboardData(makeOpts({ metaPrompts }))

    const prd = data.steps.find(s => s.slug === 'create-prd')!
    expect(prd.metaPromptBody).toContain('Meta-prompt body content for create-prd')
    expect(prd.description).toBe('Description for create-prd')
    expect(prd.summary).toBe('Summary for create-prd')
    expect(prd.dependencies).toEqual([])
    expect(prd.outputs).toEqual(['docs/prd.md'])
  })

  it('backward compat: steps flat array still works', () => {
    const data = generateDashboardData(makeOpts())
    expect(Array.isArray(data.steps)).toBe(true)
    expect(data.steps).toHaveLength(4)
    const slugs = data.steps.map(s => s.slug)
    expect(slugs).toContain('create-prd')
    expect(slugs).toContain('user-stories')
    expect(slugs).toContain('system-architecture')
    expect(slugs).toContain('tech-stack')
  })

  it('scaffoldVersion is non-empty string', () => {
    const data = generateDashboardData(makeOpts())
    expect(typeof data.scaffoldVersion).toBe('string')
    expect(data.scaffoldVersion.length).toBeGreaterThan(0)
  })

  it('step defaults when metaPrompts not provided', () => {
    const data = generateDashboardData(makeOpts())
    const step = data.steps.find(s => s.slug === 'create-prd')!
    expect(step.description).toBe('')
    expect(step.summary).toBeNull()
    expect(step.dependencies).toEqual([])
    expect(step.outputs).toEqual([])
    expect(step.order).toBeNull()
    expect(step.conditional).toBeNull()
    expect(step.metaPromptBody).toBe('')
  })

  it('step metadata populated from metaPrompts', () => {
    const metaPrompts = makeMetaPrompts()
    const data = generateDashboardData(makeOpts({ metaPrompts }))
    const ts = data.steps.find(s => s.slug === 'tech-stack')!
    expect(ts.conditional).toBe('if-needed')
    expect(ts.order).toBe(200)
    expect(ts.phase).toBe('foundation')
    expect(ts.outputs).toEqual(['docs/tech-stack.md'])
    expect(ts.dependencies).toEqual(['create-prd'])
  })

  it('all 16 phases present regardless of steps', () => {
    const data = generateDashboardData(makeOpts())
    expect(data.phases).toHaveLength(16)
    // Phases with no matching steps have empty counts
    const visionPhase = data.phases.find(p => p.slug === 'vision')!
    expect(visionPhase.counts.total).toBe(0)
    expect(visionPhase.steps).toEqual([])
  })

  it('nextEligible defaults when metaPrompts not provided', () => {
    const data = generateDashboardData(makeOpts())
    expect(data.nextEligible).not.toBeNull()
    expect(data.nextEligible!.slug).toBe('user-stories')
    expect(data.nextEligible!.description).toBe('')
    expect(data.nextEligible!.summary).toBeNull()
    expect(data.nextEligible!.command).toBe('/scaffold user-stories')
  })
})

describe('generateHtml', () => {
  it('returns a string starting with <!DOCTYPE html>', () => {
    const data = generateDashboardData(makeOpts())
    const html = generateHtml(data)
    expect(html.trimStart().startsWith('<!DOCTYPE html>')).toBe(true)
  })

  it('contains <script id="scaffold-data" with embedded JSON', () => {
    const data = generateDashboardData(makeOpts())
    const html = generateHtml(data)
    expect(html).toContain('<script id="scaffold-data"')
    expect(html).toContain('"methodology"')
  })

  it('contains step status classes in HTML', () => {
    const data = generateDashboardData(makeOpts())
    const html = generateHtml(data)
    expect(html).toContain('status-completed')
    expect(html).toContain('status-pending')
    expect(html).toContain('status-skipped')
    expect(html).toContain('status-in-progress')
  })

  it('shows stale notice when generatedAt is more than 1 hour ago', () => {
    const data = generateDashboardData(makeOpts())
    // Set generatedAt to 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    const staleData = { ...data, generatedAt: twoHoursAgo }
    const html = generateHtml(staleData)
    expect(html).toContain('id="stale-notice"')
  })

  it('does not show stale notice when data is fresh', () => {
    const data = generateDashboardData(makeOpts())
    // generatedAt is just set to now inside generateDashboardData, so it is fresh
    const html = generateHtml(data)
    expect(html).not.toContain('id="stale-notice"')
  })

  it('escapes HTML in step slugs to prevent XSS in step rows', () => {
    const xssSlug = '<script>alert(1)</script>'
    const xssState = makeState({
      [xssSlug]: {
        status: 'pending',
        source: 'pipeline',
        produces: [],
      },
    })
    const data = generateDashboardData(makeOpts({ state: xssState }))
    const html = generateHtml(data)
    // The step row itself must escape the slug
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    // The raw unescaped tag must not appear in step rows (class="step-name" section)
    expect(html).not.toContain('<span class="step-name"><script>')
  })

  it('shows "No decisions recorded yet." when decisions array is empty', () => {
    const data = generateDashboardData(makeOpts({ decisions: [] }))
    const html = generateHtml(data)
    expect(html).toContain('No decisions recorded yet.')
  })
})
