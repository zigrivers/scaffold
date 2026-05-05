import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { testsAdapter } from './tests.js'

describe('tests adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-t-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when no cached run exists', async () => {
    const s = await testsAdapter.probe(dir)
    expect(s.status).toBe('unavailable')
  })

  it('probe returns available when last-test-run.json exists', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/last-test-run.json'), JSON.stringify({
      ran_at: '2026-04-30T00:00:00Z',
      passed: 100,
      failed: 0,
      results: [{ name: 't1', file_path: 'src/a.test.ts', status: 'passing' }],
    }))
    const s = await testsAdapter.probe(dir)
    expect(s.status).toBe('available')
    expect(s.evidence_paths).toEqual(['.scaffold/last-test-run.json'])
  })

  it('lastRun returns parsed results when available', async () => {
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, '.scaffold/last-test-run.json'), JSON.stringify({
      ran_at: '2026-04-30T00:00:00Z',
      passed: 1,
      failed: 0,
      results: [{ name: 't1', file_path: 'src/a.test.ts', status: 'passing' }],
    }))
    const r = await testsAdapter.lastRun(dir)
    expect(r?.results[0].status).toBe('passing')
  })
})
