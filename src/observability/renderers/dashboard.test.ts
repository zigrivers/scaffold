import { describe, it, expect } from 'vitest'
import { renderProgressFragment, renderAuditFragment, verdictToSeverityToken } from './dashboard.js'
import type { EngineOutput } from '../engine/types.js'

const baseOut: EngineOutput = {
  schema_version: '1.0',
  invocation: {
    command: 'progress', args: { sinceHours: 24 },
    started_at: '2026-05-04T14:00:00Z', completed_at: '2026-05-04T14:00:01Z', scaffold_version: '3.25.1',
  },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable' },
    pipeline_docs: { status: 'available' }, tests: { status: 'available' },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 4, malformed_lines: 0, sources: [{ worktree_id: 'wid-a', events: 4 }] },
  },
  snapshot: {
    current_phase: 'build',
    active_agents: [{
      worktree_id: 'wid-a', actor_label: 'agent-alice', branch: 'feat-auth',
      current_task: { id: 'T-031', title: 'refresh token rotation', claimed_at: '2026-05-04T13:55:00Z' },
      open_pr: null,
    }],
    completed_in_window: [], in_flight: [], blocked: [], upcoming: [],
    recent_decisions: [{
      decision_id: 'decision:foo', key: 'foo', summary: 'bar',
      recorded_at: '2026-05-04T13:00:00Z', affects: [],
    }],
    story_coverage: [],
  },
  replay: null, findings: [], needs_attention: [],
  graph_stats: {
    nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0,
  },
  fix_threshold: 'P2', verdict: 'pass',
  summary: {
    total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
    by_severity_status: {
      P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 },
      P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 },
    },
    blocking: 0, acknowledged: 0, skipped_lenses: 0,
  },
}

describe('verdictToSeverityToken', () => {
  it('maps blocked to --sev-p0', () => { expect(verdictToSeverityToken('blocked')).toBe('--sev-p0') })
  it('maps degraded-pass to --sev-p2', () => { expect(verdictToSeverityToken('degraded-pass')).toBe('--sev-p2') })
  it('maps pass to --sev-pass', () => { expect(verdictToSeverityToken('pass')).toBe('--sev-pass') })
})

describe('renderProgressFragment', () => {
  it('emits a self-contained <section id="build-progress"> with active-agents data', () => {
    const html = renderProgressFragment(baseOut)
    expect(html).toMatch(/<section id="build-progress"/)
    expect(html).toContain('agent-alice')
    expect(html).toContain('T-031')
    expect(html).toContain('refresh token rotation')
  })

  it('reflects sinceHours from invocation args in the meta span', () => {
    const out = JSON.parse(JSON.stringify(baseOut)) as EngineOutput
    out.invocation.args = { sinceHours: 48 }
    const html = renderProgressFragment(out)
    expect(html).toContain('last 48h')
  })

  it('escapes HTML special characters in user-controlled fields', () => {
    const tainted = JSON.parse(JSON.stringify(baseOut)) as EngineOutput
    tainted.snapshot!.active_agents[0].current_task!.title = 'evil <script>alert(1)</script>'
    const html = renderProgressFragment(tainted)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('renderAuditFragment', () => {
  const auditOut: EngineOutput = { ...baseOut,
    invocation: { ...baseOut.invocation, command: 'audit', args: { profile: 'fast', scope: 'all' } },
    snapshot: null, verdict: 'blocked', fix_threshold: 'P1',
    findings: [
      { id: '3a8c1f02aabbccdd', lens_id: 'B-ac-coverage', severity: 'P0',
        title: 'AC failing', description: 'd', source_doc: 'docs/user-stories.md#s-1',
        evidence: { kind: 'rule_violation', rule_id: 'r', file: 'f' },
        confidence: 'high', first_seen: '', last_seen: '', status: 'open' },
    ],
    summary: {
      total: 1, by_severity: { P0: 1, P1: 0, P2: 0, P3: 0 },
      by_severity_status: {
        P0: { open: 1, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 },
        P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 },
      },
      blocking: 1, acknowledged: 0, skipped_lenses: 0,
    },
  }

  it('emits a self-contained <section id="build-audit"> with verdict + finding data', () => {
    const html = renderAuditFragment(auditOut)
    expect(html).toMatch(/<section id="build-audit"/)
    expect(html).toContain('blocked')
    expect(html).toContain('B-ac-coverage')
    expect(html).toContain('3a8c1f02')
    expect(html).toContain('data-verdict="blocked"')
  })

  it('renders empty-state when no findings', () => {
    const out = { ...auditOut, findings: [], verdict: 'pass' as const,
      summary: { ...auditOut.summary, total: 0, blocking: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 } } }
    const html = renderAuditFragment(out)
    expect(html).toMatch(/no findings/i)
  })
})
