import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beadsAdapter } from './beads.js'

describe('beads adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-bd-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable without .beads dir', async () => {
    expect((await beadsAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('probe returns degraded when .beads/ exists but bd binary is missing', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const s = await beadsAdapter.probe(dir, { bdBin: '/no/such/bd' })
    expect(s.status).toBe('degraded')
    expect(s.reason).toMatch(/bd binary/)
  })

  it('probe returns available when .beads/ + bd both exist', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const s = await beadsAdapter.probe(dir, { bdBin: 'true' })
    expect(s.status).toBe('available')
  })
})
