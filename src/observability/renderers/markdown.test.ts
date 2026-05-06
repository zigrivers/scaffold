import { describe, it, expect } from 'vitest'
import { renderProgressMarkdown, renderAuditMarkdown } from './markdown.js'
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

describe('renderAuditMarkdown', () => {
  const auditFixture: EngineOutput = {
    ...fixture,
    invocation: { ...fixture.invocation, command: 'audit', args: { profile: 'fast', scope: 'all' } },
    snapshot: null,
    findings: [
      { id: '3a8c1f0211223344', lens_id: 'B-ac-coverage', severity: 'P0',
        title: 'AC has failing test', description: 'src/auth/test.spec.ts is failing.',
        source_doc: 'docs/user-stories.md#user-auth-1',
        evidence: { kind: 'rule_violation', rule_id: 'ac-test-failing', file: 'file:src/auth/test.spec.ts' },
        confidence: 'high', first_seen: '2026-05-04T00:00:00Z', last_seen: '2026-05-04T00:00:00Z', status: 'open',
        fix_hint: { kind: 'add_test', target: 'src/auth/test.spec.ts', prompt: 'Re-enable test' } },
      { id: '9d1e02f455667788', lens_id: 'A-tdd', severity: 'P1',
        title: 'AC without test', description: 'AC has no test.', source_doc: 'docs/user-stories.md#story-s-1',
        evidence: { kind: 'ac_not_covered', story_id: 'story:s-1', ac_id: 'ac:s-1.1', missing_tests: [] },
        confidence: 'medium', first_seen: '2026-05-04T00:00:00Z', last_seen: '2026-05-04T00:00:00Z', status: 'acknowledged', ack_note: 'tracked separately' },
    ],
    fix_threshold: 'P1', verdict: 'blocked',
    summary: {
      total: 2, by_severity: { P0: 1, P1: 1, P2: 0, P3: 0 },
      by_severity_status: {
        P0: { open: 1, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 1, skipped: 0 },
        P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 },
      },
      blocking: 1, acknowledged: 1, skipped_lenses: 0,
    },
  }

  it('renders verdict, threshold, summary table, and one section per finding', () => {
    const md = renderAuditMarkdown(auditFixture)
    expect(md).toMatch(/^# Build Observability — Audit/m)
    expect(md).toContain('**Verdict:** blocked')
    expect(md).toContain('**Profile:** fast')
    expect(md).toContain('**Scope:** all')
    expect(md).toContain('**Fix threshold:** P1')
    expect(md).toContain('## Summary')
    expect(md).toMatch(/\| P0 \| 1 \| 1 \| 0 \|/)
    expect(md).toContain('## Findings')
    expect(md).toContain('### [P0] B-ac-coverage — AC has failing test')
    expect(md).toContain('`3a8c1f02')
    expect(md).toContain('## Acknowledged')
    expect(md).toContain('tracked separately')
  })

  it('omits Acknowledged section when there are none', () => {
    const out = JSON.parse(JSON.stringify(auditFixture)) as EngineOutput
    out.findings = out.findings.filter((f) => f.status !== 'acknowledged')
    out.summary.acknowledged = 0
    out.summary.by_severity_status.P1 = { open: 1, acknowledged: 0, skipped: 0 }
    const md = renderAuditMarkdown(out)
    expect(md).not.toContain('## Acknowledged')
  })

  it('emits a Skipped Lenses section when any lens skipped', () => {
    const out = JSON.parse(JSON.stringify(auditFixture)) as EngineOutput
    out.findings.push({
      id: 'ffeeddccbbaa9988', lens_id: 'D-stack', severity: 'P3',
      title: 'D-stack: skipped', description: 'pipeline_docs unavailable',
      source_doc: '', evidence: { kind: 'lens_skipped', reason: 'adapter_unavailable', needed: ['pipeline_docs'] },
      confidence: 'high', first_seen: '', last_seen: '', status: 'skipped',
    })
    out.summary.skipped_lenses = 1
    const md = renderAuditMarkdown(out)
    expect(md).toContain('## Skipped Lenses')
    expect(md).toContain('D-stack')
  })
})
