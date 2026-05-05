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
