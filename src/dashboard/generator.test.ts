import { describe, it, expect } from 'vitest'
import { generateDashboardData, generateHtml } from './generator.js'
import type { GeneratorOptions } from './generator.js'
import type { PipelineState } from '../types/index.js'
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
