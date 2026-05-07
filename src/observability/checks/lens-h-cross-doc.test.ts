import { describe, it, expect, vi } from 'vitest'
import { lensHCrossDoc } from './lens-h-cross-doc.js'
import type { DocGraph, AvailabilityMap, Finding } from '../engine/types.js'

const stubAvail: AvailabilityMap = {
  git: { status: 'available' }, gh: { status: 'unavailable' },
  pipeline_docs: { status: 'available' }, tests: { status: 'available' },
  state: { status: 'available' }, beads: { status: 'unavailable' },
  mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}
const baseAvail = stubAvail

function emptyGraph(): DocGraph {
  return {
    cwd: '',
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
    const f = findings.find((x: Finding) => /no story/i.test(x.title))
    expect(f?.severity).toBe('P1')
    expect(f?.lens_id).toBe('H-cross-doc')
  })

  it('emits P0 for must-priority story not covered by plan or playbook', async () => {
    const g = emptyGraph()
    g.stories = [{ id: 'story:s-1', title: 'Sign in', priority: 'must', source_anchor: '' }]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    const f = findings.find((x: Finding) => /not covered/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('emits P1 for should-priority story not covered', async () => {
    const g = emptyGraph()
    g.stories = [{ id: 'story:s-1', title: 'Settings', priority: 'should', source_anchor: '' }]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    const f = findings.find((x: Finding) => /not covered/i.test(x.title))
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
    expect(findings.some((f: Finding) => /orphan/i.test(f.title))).toBe(true)
  })

  it('emits P0 for decision_supersedes targeting non-existent decision', async () => {
    const g = emptyGraph()
    g.decisions = [{
      id: 'decision:current', key: 'current', summary: 'now',
      affects: [], source_anchor: '', recorded_at: '2026-04-30T00:00:00Z',
    }]
    g.edges = [{ kind: 'decision_supersedes', from: 'decision:current', to: 'decision:nonexistent' }]
    const findings = await lensHCrossDoc(g, { events: [] }, stubAvail, [], new Set(['H-cross-doc']))
    const f = findings.find((x: Finding) => /supersedes/i.test(x.title))
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

describe('lensHCrossDoc — full-profile tech-stack-supports-PRD (LLM-graded)', () => {
  it('emits P0 when LLM returns a contradiction finding', async () => {
    const dispatchModule = await import('../engine/llm-dispatcher.js')
    const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({
      ok: true,
      parsed: { findings: [{
        severity: 'P0', kind: 'tech-stack-vs-prd',
        title: 'PRD requires offline operation but tech-stack mandates Postgres',
        description: 'PRD §Constraints says "must work offline"; tech-stack chose Postgres which has no offline mode.',
      }] },
      raw: '',
    })
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '', prose: 'Must work offline.' }]
    g.components = [{ id: 'component:postgres', package_or_url: 'postgres@16', layer: 'data', source_anchor: '' }]
    const ctx = { profile: 'full' as const, cwd: process.cwd() }
    const findings = await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
    const llmFinding = findings.find((f) => /tech-stack/i.test(f.title))
    expect(llmFinding?.severity).toBe('P0')
    stub.mockRestore()
  })

  it('does NOT run the full-profile checks when profile=fast', async () => {
    const dispatchModule = await import('../engine/llm-dispatcher.js')
    const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({
      ok: true, parsed: { findings: [] }, raw: '',
    })
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '' }]
    g.components = [{ id: 'component:x', package_or_url: 'x@1', source_anchor: '' }]
    const ctx = { profile: 'fast' as const, cwd: process.cwd() }
    await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
    expect(stub).not.toHaveBeenCalled()
    stub.mockRestore()
  })

  it('skips the full-profile check (no P0 emitted) when LLM dispatcher fails', async () => {
    const dispatchModule = await import('../engine/llm-dispatcher.js')
    const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({
      ok: false, reason: 'dispatcher unavailable',
    })
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '' }]
    g.components = [{ id: 'component:x', package_or_url: 'x@1', source_anchor: '' }]
    const ctx = { profile: 'full' as const, cwd: process.cwd() }
    const findings = await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
    expect(findings.find((f) => /tech-stack/i.test(f.title))).toBeUndefined()
    stub.mockRestore()
  })
})

describe('lensHCrossDoc — full-profile PRD-to-stories semantic coverage (LLM-graded)', () => {
  it('emits P1 when LLM finds a PRD-prose feature with no covering story', async () => {
    const dispatchModule = await import('../engine/llm-dispatcher.js')
    const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({
      ok: true,
      parsed: { findings: [{
        severity: 'P1', kind: 'prd-feature-no-story',
        title: 'PRD describes "anonymous browsing" but no story covers it',
        description: 'PRD §Features describes anonymous browsing in prose; no Story captures it.',
      }] },
      raw: '',
    })
    const g = emptyGraph()
    g.features = [{
      id: 'feature:auth', title: 'User Auth', priority: 'must', source_anchor: '',
      prose: 'Users sign in.\n\nAlso anyone can browse anonymously.',
    }]
    g.stories = [{ id: 'story:auth-1', title: 'Sign in', priority: 'must', source_anchor: '' }]
    const ctx = { profile: 'full' as const, cwd: process.cwd() }
    const findings = await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
    expect(findings.find((f) => /anonymous browsing/i.test(f.description))?.severity).toBe('P1')
    stub.mockRestore()
  })
})

describe('lensHCrossDoc — full-profile cross-doc terminology drift (LLM-graded)', () => {
  it('emits P2 when LLM detects terminology drift across docs', async () => {
    const dispatchModule = await import('../engine/llm-dispatcher.js')
    const stub = vi.spyOn(dispatchModule, 'dispatchLlm').mockResolvedValue({
      ok: true,
      parsed: { findings: [{
        severity: 'P2', kind: 'terminology-drift',
        title: 'terminology drift: "user account" vs "profile"',
        description: 'Concept inconsistency: PRD says "user account"; user-stories.md uses "profile".',
      }] },
      raw: '',
    })
    const g = emptyGraph()
    g.features = [{
      id: 'feature:auth', title: 'Auth', priority: 'must', source_anchor: '', prose: 'Users have user accounts.',
    }]
    g.stories = [{ id: 'story:s-1', title: 'Edit profile', priority: 'must', source_anchor: '' }]
    const ctx = { profile: 'full' as const, cwd: process.cwd() }
    const findings = await lensHCrossDoc(g, { events: [] }, baseAvail, [], new Set(['H-cross-doc']), ctx)
    expect(findings.find((f) => /terminology/i.test(f.title))?.severity).toBe('P2')
    stub.mockRestore()
  })
})
