import { describe, it, expect } from 'vitest'
import { lensBAcCoverage } from './lens-b-ac-coverage.js'
import type { DocGraph, AvailabilityMap, Story, AcceptanceCriterion, Test, Edge, Finding } from '../engine/types.js'

function graphOf(input: { stories: Story[]; acs: AcceptanceCriterion[]; tests: Test[]; edges: Edge[] }): DocGraph {
  return {
    features: [], stories: input.stories,
    acceptance_criteria: input.acs,
    plan_tasks: [], playbook_tasks: [],
    tests: input.tests, pull_requests: [], files: [],
    rules: [], components: [], tokens: [], decisions: [],
    edges: input.edges, provenance: {}, unresolved_globs: [],
  }
}
function makeAvail(testsStatus: 'available' | 'unavailable'): AvailabilityMap {
  return {
    git: { status: 'available' }, gh: { status: 'unavailable' },
    pipeline_docs: { status: 'available' }, tests: { status: testsStatus },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 0, malformed_lines: 0, sources: [] },
  }
}

const story: Story = { id: 'story:s-1', title: 'Sign in', priority: 'must', source_anchor: '' }
const ac:    AcceptanceCriterion = { id: 'ac:s-1.1', story_id: 'story:s-1', text: 'AC', source_anchor: '' }
const test: Test = {
  id: 'test:src/x.test.ts::abc123', name: 'AC 1', file_path: 'src/x.test.ts', framework: 'vitest', last_status: 'fail',
}

describe('lensBAcCoverage', () => {
  it('emits P1 for AC without ac_to_test edge (structural)', async () => {
    const graph = graphOf({ stories: [story], acs: [ac], tests: [], edges: [] })
    const findings = await lensBAcCoverage(
      graph, { events: [] }, makeAvail('unavailable'), [], new Set(['B-ac-coverage']),
    )
    const f = findings.find((x: Finding) => x.evidence.kind === 'ac_not_covered')
    expect(f?.severity).toBe('P1')
  })

  it('emits P0 for AC with failing test when tests adapter is available', async () => {
    const edges = [{ kind: 'ac_to_test' as const, from: ac.id, to: test.id }]
    const graph = graphOf({ stories: [story], acs: [ac], tests: [test], edges })
    const findings = await lensBAcCoverage(
      graph, { events: [] }, makeAvail('available'), [], new Set(['B-ac-coverage']),
    )
    const f = findings.find((x: Finding) => /failing/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('does NOT emit failing-test findings when tests adapter is unavailable', async () => {
    const edges = [{ kind: 'ac_to_test' as const, from: ac.id, to: test.id }]
    const graph = graphOf({ stories: [story], acs: [ac], tests: [test], edges })
    const findings = await lensBAcCoverage(
      graph, { events: [] }, makeAvail('unavailable'), [], new Set(['B-ac-coverage']),
    )
    const failingFinding = findings.find((x: Finding) => /failing/i.test(x.title))
    expect(failingFinding).toBeUndefined()
  })

  it('emits no findings when ACs have passing tests and tests adapter is available', async () => {
    const passingTest: Test = { ...test, last_status: 'pass' }
    const graph = graphOf({
      stories: [story], acs: [ac], tests: [passingTest],
      edges: [{ kind: 'ac_to_test', from: ac.id, to: passingTest.id }],
    })
    const findings = await lensBAcCoverage(
      graph, { events: [] }, makeAvail('available'), [], new Set(['B-ac-coverage']),
    )
    expect(findings).toEqual([])
  })
})
