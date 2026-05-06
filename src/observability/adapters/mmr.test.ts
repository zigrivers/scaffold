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

describe('mmr adapter — replayEvents', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-mmr-rep-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns ReplayEvent[] for completed MMR jobs', async () => {
    const a = join(dir, '.mmr/jobs/job-a'); mkdirSync(a, { recursive: true })
    const recentTs = new Date(Date.now() - 1 * 3_600_000).toISOString()
    writeFileSync(join(a, 'result.json'),
      JSON.stringify({ verdict: 'pass', completed_at: recentTs, fix_threshold: 'P2' }))
    const b = join(dir, '.mmr/jobs/job-b'); mkdirSync(b, { recursive: true })
    writeFileSync(join(b, 'result.json'), JSON.stringify({ verdict: 'blocked', completed_at: recentTs }))
    const events = await mmrAdapter.replayEvents(dir, { sinceHours: 24 })
    expect(events).toHaveLength(2)
    expect(events[0].source).toBe('mmr')
    expect(events[0].kind).toBe('job_completed')
    expect(events.find((e) => e.sort_id === 'mmr:job-a')?.summary).toContain('pass')
    expect(events.find((e) => e.sort_id === 'mmr:job-b')?.summary).toContain('blocked')
  })

  it('returns [] when no jobs in window', async () => {
    expect(await mmrAdapter.replayEvents(dir, { sinceHours: 24 })).toEqual([])
  })
})
