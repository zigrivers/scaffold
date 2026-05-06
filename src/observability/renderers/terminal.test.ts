import { describe, it, expect } from 'vitest'
import { renderProgressTerminal } from './terminal.js'
import type { EngineOutput } from '../engine/types.js'

const fixtureOutput: EngineOutput = {
  schema_version: '1.0',
  invocation: {
    command: 'progress',
    args: {},
    started_at: '2026-04-30T14:00:00Z',
    completed_at: '2026-04-30T14:00:01Z',
    scaffold_version: '3.25.1',
  },
  availability: {
    git: { status: 'available' },
    gh: { status: 'unavailable' },
    pipeline_docs: { status: 'available' },
    tests: { status: 'available' },
    state: { status: 'available' },
    beads: { status: 'unavailable' },
    mmr: { status: 'available' },
    audit_history: { status: 'unavailable' },
    ledger: { events_read: 4, malformed_lines: 0, sources: [{ worktree_id: 'wid-a', events: 4 }] },
  },
  snapshot: {
    current_phase: 'build',
    active_agents: [{
      worktree_id: 'wid-a',
      actor_label: 'agent-alice',
      branch: 'feat-auth',
      current_task: { id: 'T-031', title: 'refresh token rotation', claimed_at: '2026-04-30T13:55:00Z' },
      open_pr: null,
    }],
    completed_in_window: [{
      task_id: 'T-029',
      task_title: 'login bug',
      outcome: 'pr_submitted',
      pr_number: 40,
      by: 'agent-alice',
    }],
    in_flight: [{
      task_id: 'T-031',
      task_title: 'refresh token rotation',
      by: 'agent-alice',
      claimed_at: '2026-04-30T13:55:00Z',
      age_hours: 0.1,
      branch: 'feat-auth',
    }],
    blocked: [],
    upcoming: [],
    recent_decisions: [{
      decision_id: 'decision:foo',
      key: 'foo',
      summary: 'bar',
      recorded_at: '2026-04-30T13:00:00Z',
      affects: [],
    }],
    story_coverage: [],
  },
  replay: null,
  findings: [],
  needs_attention: [],
  graph_stats: {
    nodes_by_kind: {},
    edges_by_kind: {},
    orphans_by_kind: {},
    unsanctioned_uses: 0,
    ad_hoc_token_uses: 0,
  },
  fix_threshold: 'P2',
  verdict: 'pass',
  summary: {
    total: 0,
    by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
    by_severity_status: {
      P0: { open: 0, acknowledged: 0, skipped: 0 },
      P1: { open: 0, acknowledged: 0, skipped: 0 },
      P2: { open: 0, acknowledged: 0, skipped: 0 },
      P3: { open: 0, acknowledged: 0, skipped: 0 },
    },
    blocking: 0,
    acknowledged: 0,
    skipped_lenses: 0,
  },
}

describe('renderProgressTerminal', () => {
  it('produces a snapshot summary with active agents, in-flight, and completed sections', () => {
    const out = renderProgressTerminal(fixtureOutput)
    expect(out).toContain('build observability — progress')
    expect(out).toContain('active agents')
    expect(out).toContain('agent-alice')
    expect(out).toContain('T-031')
    expect(out).toContain('refresh token rotation')
    expect(out).toContain('completed in window')
    expect(out).toContain('PR #40')
    expect(out).toContain('availability:')
    expect(out).toContain('git ✓')
    expect(out).toContain('beads —')
  })

  it('omits empty sections (no Active Agents header when active_agents is empty)', () => {
    const empty = {
      ...fixtureOutput,
      snapshot: {
        ...fixtureOutput.snapshot!,
        active_agents: [],
        in_flight: [],
        completed_in_window: [],
        recent_decisions: [],
      },
    }
    const out = renderProgressTerminal(empty)
    expect(out).not.toContain('active agents')
    expect(out).not.toContain('completed in window')
  })

  it('redacts secrets from rendered output', () => {
    const tainted: EngineOutput = JSON.parse(JSON.stringify(fixtureOutput)) as EngineOutput
    tainted.snapshot!.recent_decisions[0].summary = 'token=ghp_1234567890abcdefABCDEF1234567890abcdef'
    const out = renderProgressTerminal(tainted)
    expect(out).not.toContain('ghp_1234567890abcdefABCDEF1234567890abcdef')
    expect(out).toContain('[REDACTED:')
  })
})

describe('renderProgressTerminal — replay + needs_attention', () => {
  it('prepends a "needs attention" banner when needs_attention is non-empty', () => {
    const out = JSON.parse(JSON.stringify(fixtureOutput)) as EngineOutput
    out.needs_attention = [{
      signal: 'task_stale', ref: { kind: 'task', id: 'T-031' },
      age_hours: 5.2, threshold_hours: 4,
      summary: 'task T-031 (agent-alice) claimed 5h ago, no recent activity',
    }]
    const text = renderProgressTerminal(out)
    expect(text).toMatch(/⚠ needs attention/i)
    expect(text).toContain('T-031')
    expect(text).toContain('5.2h')
  })

  it('prints a timeline section when replay is populated', () => {
    const out = JSON.parse(JSON.stringify(fixtureOutput)) as EngineOutput
    out.replay = {
      window: { from: '2026-05-04T13:00:00Z', to: '2026-05-04T14:00:00Z' },
      events: [
        {
          sort_id: 'ledger:ulid-A', correlation_id: null, ts: '2026-05-04T13:55:00Z',
          source: 'ledger', kind: 'task_claimed', actor_label: 'agent-alice',
          task_id: 'T-031', summary: 'T-031 claimed: refresh token rotation',
        },
        {
          sort_id: 'git:abc', correlation_id: null, ts: '2026-05-04T13:50:00Z',
          source: 'git', kind: 'commit', summary: 'wip', actor_label: 'agent-alice',
        },
      ],
    }
    const text = renderProgressTerminal(out)
    expect(text).toMatch(/timeline/i)
    expect(text).toContain('T-031 claimed')
    expect(text).toContain('git')
    expect(text).toContain('commit')
  })

  it('omits the timeline section when replay is null', () => {
    const out = JSON.parse(JSON.stringify(fixtureOutput)) as EngineOutput
    out.replay = null
    const text = renderProgressTerminal(out)
    expect(text).not.toMatch(/^timeline/im)
  })
})
