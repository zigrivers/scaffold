import { describe, it, expect } from 'vitest'
import { lensHCrossDoc } from './lens-h-cross-doc'
import type { DocGraph, AvailabilityMap } from '../engine/types'

const stubAvail: AvailabilityMap = {
  git: { status: 'available' }, gh: { status: 'unavailable' },
  pipeline_docs: { status: 'available' }, tests: { status: 'available' },
  state: { status: 'available' }, beads: { status: 'unavailable' },
  mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

function emptyGraph(): DocGraph {
  return {
    features: [], stories: [], acceptance_criteria: [],
    plan_tasks: [], playbook_tasks: [], tests: [], pull_requests: [],
    files: [], rules: [], components: [], tokens: [], decisions: [],
    edges: [], provenance: {}, unresolved_globs: [],
  }
}

describe('lensHCrossDoc', () => {
  it('emits P1 for must-priority feature without feature_to_story edge', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:user-auth', title: 'User Auth', priority: 'must', source_anchor: '' }]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    const f = findings.find((x) => /no story/i.test(x.title))
    expect(f?.severity).toBe('P1')
    expect(f?.lens_id).toBe('H-cross-doc')
  })

  it('emits P0 for must-priority story not covered by plan or playbook', async () => {
    const g = emptyGraph()
    g.stories = [{ id: 'story:s-1', title: 'Sign in', priority: 'must', source_anchor: '' }]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    const f = findings.find((x) => /not covered/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('emits P1 for should-priority story not covered', async () => {
    const g = emptyGraph()
    g.stories = [{ id: 'story:s-1', title: 'Settings', priority: 'should', source_anchor: '' }]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    const f = findings.find((x) => /not covered/i.test(x.title))
    expect(f?.severity).toBe('P1')
  })

  it('emits P1 for orphan stories (no inbound feature_to_story edge when features exist)', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:a', title: 'A', priority: 'must', source_anchor: '' }]
    g.stories = [{ id: 'story:s-1', title: 'Untraced', priority: 'must', source_anchor: '' }]
    g.edges = [
      { kind: 'feature_to_story', from: 'feature:a', to: 'story:other' }, // unrelated
      { kind: 'story_to_plan_task', from: 'story:s-1', to: 'plan_task:t' }, // s-1 has plan task → not "not covered"
    ]
    g.plan_tasks = [{ id: 'plan_task:t', title: 't', status: 'todo', source_anchor: '' }]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    expect(findings.some((f) => /orphan/i.test(f.title))).toBe(true)
  })

  it('emits P0 for decision_supersedes targeting non-existent decision', async () => {
    const g = emptyGraph()
    g.decisions = [{ id: 'decision:current', key: 'current', summary: 'now', affects: [], source_anchor: '', recorded_at: '2026-04-30T00:00:00Z' }]
    g.edges = [{ kind: 'decision_supersedes', from: 'decision:current', to: 'decision:nonexistent' }]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    const f = findings.find((x) => /supersedes/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('emits no findings on a fully-coherent graph', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:a', title: 'A', priority: 'must', source_anchor: '' }]
    g.stories = [{ id: 'story:s-1', title: 'A1', priority: 'must', feature_id: 'feature:a', source_anchor: '' }]
    g.plan_tasks = [{ id: 'plan_task:t', title: 't', status: 'todo', story_id: 'story:s-1', source_anchor: '' }]
    g.edges = [
      { kind: 'feature_to_story', from: 'feature:a', to: 'story:s-1' },
      { kind: 'story_to_plan_task', from: 'story:s-1', to: 'plan_task:t' },
    ]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    expect(findings).toEqual([])
  })
})
