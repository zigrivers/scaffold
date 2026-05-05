import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mmrAdapter } from './mmr.js'

describe('mmr adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-mmr-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when .mmr/jobs/ has no result.json files', async () => {
    expect((await mmrAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('probe returns available when at least one job result.json exists', async () => {
    const job = join(dir, '.mmr/jobs/job-001')
    mkdirSync(job, { recursive: true })
    writeFileSync(join(job, 'result.json'), JSON.stringify({ verdict: 'pass', completed_at: '2026-04-30T00:00:00Z' }))
    const s = await mmrAdapter.probe(dir)
    expect(s.status).toBe('available')
  })

  it('mostRecentJob returns the newest result.json by mtime', async () => {
    const a = join(dir, '.mmr/jobs/a'); mkdirSync(a, { recursive: true })
    writeFileSync(join(a, 'result.json'), JSON.stringify({ verdict: 'pass', completed_at: '2026-04-29T00:00:00Z' }))
    await new Promise((r) => setTimeout(r, 50))
    const b = join(dir, '.mmr/jobs/b'); mkdirSync(b, { recursive: true })
    writeFileSync(join(b, 'result.json'), JSON.stringify({ verdict: 'blocked', completed_at: '2026-04-30T00:00:00Z' }))
    const j = await mmrAdapter.mostRecentJob(dir)
    expect(j?.verdict).toBe('blocked')
  })
})
