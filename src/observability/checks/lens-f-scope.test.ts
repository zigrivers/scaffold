import { describe, it, expect } from 'vitest'
import { lensFScope } from './lens-f-scope.js'
import type { DocGraph, AvailabilityMap } from '../engine/types.js'

const baseAvail = (overrides: Partial<AvailabilityMap> = {}): AvailabilityMap => ({
  git: { status: 'available' }, gh: { status: 'unavailable' },
  pipeline_docs: { status: 'available' }, tests: { status: 'available' },
  state: { status: 'available' }, beads: { status: 'unavailable' },
  mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
  ...overrides,
})

function emptyGraph(): DocGraph {
  return {
    cwd: '',
    features: [], stories: [], acceptance_criteria: [],
    plan_tasks: [], playbook_tasks: [], tests: [], pull_requests: [],
    files: [], rules: [], components: [], tokens: [], decisions: [],
    edges: [], provenance: {}, unresolved_globs: [],
  }
}

describe('lensFScope', () => {
  it('emits P0 for must-priority feature without a story', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '' }]
    const findings = await lensFScope(g, { events: [] }, baseAvail(), [], new Set(['F-scope']))
    const f = findings.find((x) => /no story/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('emits P1 for should-priority feature without a story', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'should', source_anchor: '' }]
    const findings = await lensFScope(g, { events: [] }, baseAvail(), [], new Set(['F-scope']))
    const f = findings.find((x) => /no story/i.test(x.title))
    expect(f?.severity).toBe('P1')
  })

  it('emits P0 for must-priority story without plan or playbook coverage', async () => {
    const g = emptyGraph()
    g.stories = [{ id: 'story:s-1', title: 'S1', priority: 'must', source_anchor: '' }]
    const findings = await lensFScope(g, { events: [] }, baseAvail(), [], new Set(['F-scope']))
    const f = findings.find((x) => /no plan task/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('skips the wave-budget P2 sub-check when state adapter is unavailable', async () => {
    const g = emptyGraph()
    g.stories = [{ id: 'story:s-1', title: 'S1', priority: 'must', source_anchor: '' }]
    g.plan_tasks = [{ id: 'plan_task:t', title: 't', status: 'todo', story_id: 'story:s-1', source_anchor: '' }]
    g.edges = [{ kind: 'story_to_plan_task', from: 'story:s-1', to: 'plan_task:t' }]
    const findings = await lensFScope(
      g, { events: [] }, baseAvail({ state: { status: 'unavailable' } }), [], new Set(['F-scope']),
    )
    expect(findings.find((x) => /untouched/i.test(x.title))).toBeUndefined()
  })

  it('emits no findings on a fully-covered must-priority graph', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '' }]
    g.stories = [{ id: 'story:s-1', title: 'S1', priority: 'must', feature_id: 'feature:fx', source_anchor: '' }]
    g.plan_tasks = [{ id: 'plan_task:t', title: 't', status: 'in_flight', story_id: 'story:s-1', source_anchor: '' }]
    g.edges = [
      { kind: 'feature_to_story', from: 'feature:fx', to: 'story:s-1' },
      { kind: 'story_to_plan_task', from: 'story:s-1', to: 'plan_task:t' },
    ]
    const findings = await lensFScope(g, { events: [] }, baseAvail(), [], new Set(['F-scope']))
    expect(findings).toEqual([])
  })
})
