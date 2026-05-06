import { describe, it, expect } from 'vitest'
import { lensGDecisions } from './lens-g-decisions.js'
import { gitAdapter } from '../adapters/git.js'
import type { DocGraph, AvailabilityMap, Event, Finding } from '../engine/types.js'

const baseAvail: AvailabilityMap = {
  git: { status: 'available' }, gh: { status: 'unavailable' },
  pipeline_docs: { status: 'available' }, tests: { status: 'available' },
  state: { status: 'available' }, beads: { status: 'unavailable' },
  mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

function emptyGraph(): DocGraph {
  return {
    cwd: '',
    features: [], stories: [], acceptance_criteria: [],
    plan_tasks: [], playbook_tasks: [], tests: [], pull_requests: [],
    files: [], rules: [], components: [], tokens: [], decisions: [],
    edges: [], provenance: {}, unresolved_globs: [],
  }
}

function decisionEvent(key: string, summary: string, ts = '2026-05-04T00:00:00Z'): Event {
  return {
    event_id: `ulid-${key}`, worktree_id: 'wid', actor_label: 'a', branch: 'b', task_id: null,
    type: 'decision_recorded', ts,
    payload: { key, summary, affects: [], links: [] },
  } as Event
}

describe('lensGDecisions', () => {
  it('emits P1 for ledger event without matching doc decision', async () => {
    const g = emptyGraph()
    const events = [decisionEvent('caching-strategy', 'TTL=60s')]
    const findings = await lensGDecisions(g, { events }, baseAvail, [], new Set(['G-decisions']))
    const f = findings.find((x) => /event without doc/i.test(x.title))
    expect(f?.severity).toBe('P1')
  })

  it('emits P1 for doc decision without matching ledger event (when ledger has any decisions)', async () => {
    const g = emptyGraph()
    g.decisions = [
      {
        id: 'decision:archive-policy', key: 'archive-policy', summary: 'After 90 days',
        affects: [], source_anchor: 'docs/decisions/archive-policy.md', recorded_at: '2026-05-04T00:00:00Z',
      },
    ]
    const events = [decisionEvent('different-key', 'unrelated')]
    const findings = await lensGDecisions(g, { events }, baseAvail, [], new Set(['G-decisions']))
    const f = findings.find((x) => /doc without event/i.test(x.title))
    expect(f?.severity).toBe('P1')
  })

  it('emits P0 when D-stack reports unsanctioned-dependency without a covering decision', async () => {
    const g = emptyGraph()
    g.files = [{ id: 'file:src/lib/x.ts', path: 'src/lib/x.ts' }]
    const upstream: Finding[] = [{
      id: 'fake-d-finding',
      lens_id: 'D-stack', severity: 'P0',
      title: 'unsanctioned dependency: src/lib/x.ts',
      description: 'lodash imported in src/lib/x.ts',
      source_doc: 'docs/tech-stack.md',
      evidence: { kind: 'rule_violation', rule_id: 'tech-stack-unsanctioned', file: 'file:src/lib/x.ts' },
      confidence: 'high', first_seen: '2026-05-04T00:00:00Z', last_seen: '2026-05-04T00:00:00Z', status: 'open',
    }]
    const findings = await lensGDecisions(g, { events: [] }, baseAvail, upstream, new Set(['G-decisions']))
    const f = findings.find((x) => /unsanctioned dep/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('does not emit the P0 cross-correlation when a covering decision_recorded event exists', async () => {
    const g = emptyGraph()
    g.files = [{ id: 'file:src/lib/x.ts', path: 'src/lib/x.ts' }]
    const upstream: Finding[] = [{
      id: 'fake-d-finding',
      lens_id: 'D-stack', severity: 'P0',
      title: 'unsanctioned dependency: src/lib/x.ts',
      description: 'lodash imported in src/lib/x.ts',
      source_doc: 'docs/tech-stack.md',
      evidence: { kind: 'rule_violation', rule_id: 'tech-stack-unsanctioned', file: 'file:src/lib/x.ts' },
      confidence: 'high', first_seen: '2026-05-04T00:00:00Z', last_seen: '2026-05-04T00:00:00Z', status: 'open',
    }]
    const events = [{
      event_id: 'ulid-cover', worktree_id: 'wid', actor_label: 'a', branch: 'b', task_id: null,
      type: 'decision_recorded', ts: '2026-05-04T00:00:00Z',
      payload: { key: 'lodash-allowed', summary: 'Allow lodash', affects: ['src/lib/**'], links: [] },
    } as Event]
    const findings = await lensGDecisions(g, { events }, baseAvail, upstream, new Set(['G-decisions']))
    expect(findings.find((x) => /unsanctioned dep/i.test(x.title))).toBeUndefined()
  })
})

describe('lensGDecisions — decision-keyword commit scan', () => {
  it('emits P2 for commits with decision-keyword messages that lack matching event/doc', async () => {
    const orig = gitAdapter.recentCommits
    gitAdapter.recentCommits = async () => [{
      sha: 'a'.repeat(40), branch: null, ts: new Date().toISOString(),
      author: 'alice', subject: 'decided to migrate to Postgres',
    }]
    try {
      const findings = await lensGDecisions(emptyGraph(), { events: [] }, baseAvail, [], new Set(['G-decisions']))
      const f = findings.find((x) => /decision-keyword commit/i.test(x.title))
      expect(f?.severity).toBe('P2')
    } finally {
      gitAdapter.recentCommits = orig
    }
  })

  it('does not emit when a matching ledger event covers the commit subject', async () => {
    const orig = gitAdapter.recentCommits
    gitAdapter.recentCommits = async () => [{
      sha: 'b'.repeat(40), branch: null, ts: new Date().toISOString(),
      author: 'alice', subject: 'decided to migrate to Postgres',
    }]
    try {
      const events = [decisionEvent('migrate-to-postgres', 'switched to postgres')]
      const findings = await lensGDecisions(emptyGraph(), { events }, baseAvail, [], new Set(['G-decisions']))
      expect(findings.find((x) => /decision-keyword commit/i.test(x.title))).toBeUndefined()
    } finally {
      gitAdapter.recentCommits = orig
    }
  })
})
