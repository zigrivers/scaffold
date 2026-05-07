import { describe, it, expect } from 'vitest'
import { renderMmrFindings } from './mmr-findings.js'
import type { EngineOutput } from '../engine/types.js'

const baseOut: EngineOutput = {
  schema_version: '1.0',
  invocation: {
    command: 'audit',
    args: { profile: 'fast', scope: 'all' },
    started_at: '2026-05-04T14:00:00Z',
    completed_at: '2026-05-04T14:00:01Z',
    scaffold_version: '3.25.1',
  },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable' },
    pipeline_docs: { status: 'available' }, tests: { status: 'available' },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 0, malformed_lines: 0, sources: [] },
  },
  snapshot: null, replay: null,
  findings: [
    {
      id: '3a8c1f0211223344', lens_id: 'B-ac-coverage', severity: 'P0',
      title: 'AC has failing test', description: 'Test refresh.spec.ts is failing.',
      source_doc: 'docs/user-stories.md#user-auth-1',
      evidence: { kind: 'rule_violation', rule_id: 'ac-test-failing', file: 'file:src/auth/test.spec.ts' },
      confidence: 'high', first_seen: '', last_seen: '', status: 'open',
      fix_hint: { kind: 'add_test', target: 'src/auth/test.spec.ts', prompt: 'Re-enable the test' },
    },
    {
      id: '9d1e02f455667788', lens_id: 'A-tdd', severity: 'P1',
      title: 'AC without test', description: 'AC has no test.',
      source_doc: 'docs/user-stories.md#story-s-1',
      evidence: { kind: 'ac_not_covered', story_id: 'story:s-1', ac_id: 'ac:s-1.1', missing_tests: [] },
      confidence: 'medium', first_seen: '', last_seen: '', status: 'acknowledged',
    },
    {
      id: 'ffeeddccbbaa9988', lens_id: 'D-stack', severity: 'P3',
      title: 'D-stack: skipped', description: 'pipeline_docs unavailable',
      source_doc: '',
      evidence: { kind: 'lens_skipped', reason: 'adapter_unavailable', needed: ['pipeline_docs'] },
      confidence: 'high', first_seen: '', last_seen: '', status: 'skipped',
    },
  ],
  needs_attention: [],
  graph_stats: {
    nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {},
    unsanctioned_uses: 0, ad_hoc_token_uses: 0,
  },
  fix_threshold: 'P1', verdict: 'blocked',
  summary: {
    total: 3,
    by_severity: { P0: 1, P1: 1, P2: 0, P3: 1 },
    by_severity_status: {
      P0: { open: 1, acknowledged: 0, skipped: 0 },
      P1: { open: 0, acknowledged: 1, skipped: 0 },
      P2: { open: 0, acknowledged: 0, skipped: 0 },
      P3: { open: 0, acknowledged: 0, skipped: 1 },
    },
    blocking: 1, acknowledged: 1, skipped_lenses: 1,
  },
}

describe('renderMmrFindings', () => {
  it('emits a JSON array — one entry per non-skipped finding (skipped lenses excluded)', () => {
    const out = renderMmrFindings(baseOut)
    const parsed = JSON.parse(out) as Array<{ severity: string; location: string; description: string; suggestion?: string }>
    expect(parsed).toHaveLength(2)
    expect(parsed.every((f) => ['P0', 'P1', 'P2', 'P3'].includes(f.severity))).toBe(true)
  })

  it('builds composite location <source_doc>::<lens_id>::<short_id> for stable cross-run identity', () => {
    const arr = JSON.parse(renderMmrFindings(baseOut)) as Array<{ location: string }>
    expect(arr[0].location).toBe('docs/user-stories.md#user-auth-1::B-ac-coverage::3a8c1f02')
    expect(arr[1].location).toBe('docs/user-stories.md#story-s-1::A-tdd::9d1e02f4')
  })

  it('description prefixes lens_id and includes the engine title', () => {
    const arr = JSON.parse(renderMmrFindings(baseOut)) as Array<{ description: string }>
    expect(arr[0].description).toMatch(/^\[doc-conformance\/B-ac-coverage\]/)
    expect(arr[0].description).toContain('AC has failing test')
  })

  it('suggestion is fix_hint.prompt when present, else fix_hint.target, else empty string', () => {
    const arr = JSON.parse(renderMmrFindings(baseOut)) as Array<{ suggestion?: string }>
    expect(arr[0].suggestion).toBe('Re-enable the test')
    expect(arr[1].suggestion).toBe('')
  })

  it('emits a stable JSON shape that is valid JSON.parse-able', () => {
    expect(() => JSON.parse(renderMmrFindings(baseOut))).not.toThrow()
  })
})
