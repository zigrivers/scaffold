import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditHistoryAdapter } from './audit-history.js'

describe('audit_history adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-ah-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when docs/audits/ has no JSON sidecars', async () => {
    expect((await auditHistoryAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('probe returns available when at least one sidecar exists', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(
      join(dir, 'docs/audits/2026-04-30-1422-fast-all.json'),
      JSON.stringify({ report_id: 'audit-…', engine_output: { schema_version: '1.0', findings: [] } }),
    )
    expect((await auditHistoryAdapter.probe(dir)).status).toBe('available')
  })

  it('listSidecars returns sidecar paths sorted newest-first', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/2026-04-29.json'), '{}')
    await new Promise((r) => setTimeout(r, 30))
    writeFileSync(join(dir, 'docs/audits/2026-04-30.json'), '{}')
    const list = await auditHistoryAdapter.listSidecars(dir)
    expect(list[0]).toMatch(/2026-04-30/)
  })
})

describe('audit_history adapter — parse trend data', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-ah2-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('listSidecars returns sidecar paths sorted newest-first', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/audit-2026-04-30-1422-fast-all.json'), JSON.stringify({
      report_id: 'audit-2026-04-30-1422-fast-all',
      engine_output: {
        schema_version: '1.0',
        invocation: { command: 'audit', started_at: '2026-04-30T14:22:00Z' },
        summary: { total: 5 },
      },
    }))
    await new Promise((r) => setTimeout(r, 30))
    writeFileSync(join(dir, 'docs/audits/audit-2026-05-01-0900-fast-all.json'), JSON.stringify({
      report_id: 'audit-2026-05-01-0900-fast-all',
      engine_output: {
        schema_version: '1.0',
        invocation: { command: 'audit', started_at: '2026-05-01T09:00:00Z' },
        summary: { total: 3 },
      },
    }))
    const list = await auditHistoryAdapter.listSidecars(dir)
    expect(list[0]).toMatch(/2026-05-01/)
  })

  it('readTrends returns severity counts over time, newest first', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/audit-2026-04-30-1422-fast-all.json'), JSON.stringify({
      report_id: 'audit-2026-04-30-1422-fast-all',
      engine_output: { schema_version: '1.0',
        invocation: { command: 'audit', started_at: '2026-04-30T14:22:00Z' },
        summary: {
          total: 5, by_severity: { P0: 1, P1: 2, P2: 2, P3: 0 },
          blocking: 3, acknowledged: 0, skipped_lenses: 0,
        },
      },
    }))
    writeFileSync(join(dir, 'docs/audits/audit-2026-05-01-0900-fast-all.json'), JSON.stringify({
      report_id: 'audit-2026-05-01-0900-fast-all',
      engine_output: {
        schema_version: '1.0',
        invocation: { command: 'audit', started_at: '2026-05-01T09:00:00Z' },
        summary: {
          total: 3, by_severity: { P0: 0, P1: 1, P2: 2, P3: 0 },
          blocking: 1, acknowledged: 0, skipped_lenses: 0,
        },
      },
    }))
    const trends = await auditHistoryAdapter.readTrends(dir)
    expect(trends).toHaveLength(2)
    expect(trends[0]).toMatchObject({ ts: '2026-05-01T09:00:00Z', total: 3, blocking: 1 })
    expect(trends[1]).toMatchObject({ ts: '2026-04-30T14:22:00Z', total: 5, blocking: 3 })
  })

  it('lensSkippedStreaks counts consecutive recent runs where a lens was skipped', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    const mkRun = (path: string, ts: string, skippedLenses: string[]) =>
      writeFileSync(join(dir, path), JSON.stringify({
        report_id: path.replace(/^docs\/audits\//, '').replace(/\.json$/, ''),
        engine_output: {
          schema_version: '1.0',
          invocation: { command: 'audit', started_at: ts },
          summary: {
            total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
            blocking: 0, acknowledged: 0, skipped_lenses: skippedLenses.length,
          },
          findings: skippedLenses.map((id) => ({
            id: `skipped-${id}`, lens_id: id, severity: 'P3', status: 'skipped',
            evidence: { kind: 'lens_skipped', reason: 'adapter_unavailable', needed: ['gh'] },
            confidence: 'high', title: '', description: '', source_doc: '', first_seen: '', last_seen: '',
          })),
        },
      }))
    mkRun('docs/audits/audit-2026-04-29-fast-all.json', '2026-04-29T00:00:00Z', ['B-ac-coverage'])
    mkRun('docs/audits/audit-2026-04-30-fast-all.json', '2026-04-30T00:00:00Z', ['B-ac-coverage'])
    mkRun('docs/audits/audit-2026-05-01-fast-all.json', '2026-05-01T00:00:00Z', ['B-ac-coverage', 'F-scope'])
    const streaks = await auditHistoryAdapter.lensSkippedStreaks(dir)
    expect(streaks['B-ac-coverage']).toBe(3)
    expect(streaks['F-scope']).toBe(1)
  })

  it('probe returns available when sidecars exist (regression of Plan 1 contract)', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/x.json'), '{}')
    expect((await auditHistoryAdapter.probe(dir)).status).toBe('available')
  })

  it('latestFindings returns findings from the most recent audit sidecar', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    const finding = {
      id: 'abc123', lens_id: 'A-tdd', severity: 'P1', status: 'open',
      title: 'test', description: 'd', source_doc: '',
      evidence: { kind: 'rule_violation', rule_id: 'r', file: 'f' },
      confidence: 'high', first_seen: '2026-05-01T00:00:00Z', last_seen: '2026-05-01T00:00:00Z',
    }
    writeFileSync(join(dir, 'docs/audits/audit-2026-05-01.json'), JSON.stringify({
      report_id: 'audit-2026-05-01',
      engine_output: {
        schema_version: '1.0',
        invocation: { command: 'audit', started_at: '2026-05-01T00:00:00Z' },
        findings: [finding],
      },
    }))
    const found = await auditHistoryAdapter.latestFindings(dir)
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('abc123')
    expect(found[0].severity).toBe('P1')
  })

  it('latestFindings returns [] when no audit sidecars exist', async () => {
    const found = await auditHistoryAdapter.latestFindings(dir)
    expect(found).toEqual([])
  })
})
