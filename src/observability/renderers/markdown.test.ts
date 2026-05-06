import { describe, it, expect } from 'vitest'
import { renderProgressMarkdown } from './markdown.js'
import type { EngineOutput } from '../engine/types.js'

const fixture: EngineOutput = {
  schema_version: '1.0',
  invocation: { command: 'progress', args: { sinceHours: 24 }, started_at: '2026-05-04T14:00:00Z', completed_at: '2026-05-04T14:00:01Z', scaffold_version: '3.25.1' },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable', reason: 'gh not installed' },
    pipeline_docs: { status: 'available' }, tests: { status: 'available' },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 4, malformed_lines: 0, sources: [{ worktree_id: 'wid-a', events: 4 }] },
  },
  snapshot: {
    current_phase: 'build',
    active_agents: [{ worktree_id: 'wid-a', actor_label: 'agent-alice', branch: 'feat-auth',
      current_task: { id: 'T-031', title: 'refresh token rotation', claimed_at: '2026-05-04T13:55:00Z' }, open_pr: null }],
    completed_in_window: [{ task_id: 'T-029', task_title: 'login bug', outcome: 'pr_submitted', pr_number: 40, by: 'agent-alice' }],
    in_flight: [{ task_id: 'T-031', task_title: 'refresh token rotation', by: 'agent-alice', claimed_at: '2026-05-04T13:55:00Z', age_hours: 0.1, branch: 'feat-auth' }],
    blocked: [], upcoming: [],
    recent_decisions: [{ decision_id: 'decision:foo', key: 'foo', summary: 'bar', recorded_at: '2026-05-04T13:00:00Z', affects: ['src/foo/**'] }],
    story_coverage: [],
  },
  replay: null, findings: [], needs_attention: [],
  graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
  fix_threshold: 'P2', verdict: 'pass',
  summary: { total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
    by_severity_status: { P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 } },
    blocking: 0, acknowledged: 0, skipped_lenses: 0 },
}

describe('renderProgressMarkdown', () => {
  it('produces a heading + sections + availability table', () => {
    const md = renderProgressMarkdown(fixture)
    expect(md).toMatch(/^# Build Observability — Progress/m)
    expect(md).toContain('**Window:**')
    expect(md).toContain('## Active Agents')
    expect(md).toContain('agent-alice')
    expect(md).toContain('## Completed in Window')
    expect(md).toContain('PR #40')
    expect(md).toContain('## Recent Decisions')
    expect(md).toContain('## Availability')
    expect(md).toMatch(/\| git \|/)
    expect(md).toMatch(/\| gh \| .*unavailable/)
  })

  it('omits empty sections', () => {
    const empty = { ...fixture, snapshot: { ...fixture.snapshot!, active_agents: [], in_flight: [], completed_in_window: [], recent_decisions: [] } }
    const md = renderProgressMarkdown(empty)
    expect(md).not.toContain('## Active Agents')
    expect(md).not.toContain('## Completed in Window')
  })

  it('redacts secrets in narrative content', () => {
    const tainted = JSON.parse(JSON.stringify(fixture)) as EngineOutput
    tainted.snapshot!.recent_decisions[0].summary = 'token=ghp_1234567890abcdefABCDEF1234567890abcdef'
    const md = renderProgressMarkdown(tainted)
    expect(md).not.toContain('ghp_1234567890abcdefABCDEF1234567890abcdef')
    expect(md).toContain('[REDACTED:')
  })
})
