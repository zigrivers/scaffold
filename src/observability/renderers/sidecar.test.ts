import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSidecar, sidecarPath, deriveReportId } from './sidecar.js'
import type { EngineOutput } from '../engine/types.js'

const baseOut: EngineOutput = {
  schema_version: '1.0',
  invocation: {
    command: 'audit', args: { profile: 'fast', scope: 'all' },
    started_at: '2026-05-04T14:22:00Z', completed_at: '2026-05-04T14:22:01Z', scaffold_version: '3.25.1',
  },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable' },
    pipeline_docs: { status: 'available' }, tests: { status: 'available' },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 0, malformed_lines: 0, sources: [] },
  },
  snapshot: null, replay: null, findings: [], needs_attention: [],
  graph_stats: {
    nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0,
  },
  fix_threshold: 'P2', verdict: 'pass',
  summary: { total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
    by_severity_status: {
      P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 },
      P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 },
    },
    blocking: 0, acknowledged: 0, skipped_lenses: 0 },
}

describe('sidecar', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-sc-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('deriveReportId formats audit ids by date + profile + scope', () => {
    expect(deriveReportId(baseOut)).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{9}-fast-all-[a-f0-9]{6}$/)
  })

  it('deriveReportId formats single-lens audits as audit-<date>-<profile>-lens-<id>', () => {
    const out = {
      ...baseOut,
      invocation: { ...baseOut.invocation, args: { profile: 'fast', scope: 'all', lensIds: ['B-ac-coverage'] } },
    }
    expect(deriveReportId(out)).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{9}-fast-lens-B-ac-coverage-[a-f0-9]{6}$/)
  })

  it('deriveReportId formats multi-lens audits with sorted lens IDs joined by +', () => {
    const lensArgs = { profile: 'fast', scope: 'all', lensIds: ['B-ac-coverage', 'A-tdd'] }
    const out = { ...baseOut, invocation: { ...baseOut.invocation, args: lensArgs } }
    expect(deriveReportId(out)).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{9}-fast-lenses-A-tdd\+B-ac-coverage-[a-f0-9]{6}$/)
  })

  it('deriveReportId formats progress reports as progress-<date>', () => {
    const out = { ...baseOut, invocation: { ...baseOut.invocation, command: 'progress' as const, args: {} } }
    expect(deriveReportId(out)).toMatch(/^progress-\d{4}-\d{2}-\d{2}-\d{9}-[a-f0-9]{6}$/)
  })

  it('sidecarPath returns docs/audits/<id>.json for audit, docs/build-status/<id>.json for progress', () => {
    expect(sidecarPath(deriveReportId(baseOut), 'audit')).toMatch(/^docs\/audits\/audit-/)
    const pOut = { ...baseOut, invocation: { ...baseOut.invocation, command: 'progress' as const, args: {} } }
    const progressPattern = /^docs\/build-status\/progress-\d{4}-\d{2}-\d{2}-\d{9}-[a-f0-9]{6}\.json$/
    expect(sidecarPath(deriveReportId(pOut), 'progress')).toMatch(progressPattern)
  })

  it('writeSidecar writes a redacted EngineOutput wrapped under engine_output', async () => {
    const path = await writeSidecar(dir, baseOut)
    expect(existsSync(path)).toBe(true)
    const obj = JSON.parse(readFileSync(path, 'utf8')) as { report_id: string; engine_output: EngineOutput }
    expect(obj.report_id).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{9}-fast-all-[a-f0-9]{6}$/)
    expect(obj.engine_output.schema_version).toBe('1.0')
    expect(obj.engine_output.verdict).toBe('pass')
  })

  it('writeSidecar redacts paths/secrets in the persisted file', async () => {
    const tainted = JSON.parse(JSON.stringify(baseOut)) as EngineOutput
    tainted.invocation.args = { ...tainted.invocation.args, dirty: '/Users/alice/Documents/repo/file.ts' }
    const path = await writeSidecar(dir, tainted)
    const text = readFileSync(path, 'utf8')
    expect(text).not.toContain('/Users/alice')
    expect(text).toContain('~')
  })
})
