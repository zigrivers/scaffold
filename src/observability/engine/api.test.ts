import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runProgress } from './api.js'
import { ensureIdentity } from './identity.js'
import { writeEvent } from './ledger-writer.js'
import { harvestWorktree } from './harvester.js'

describe('api.runProgress', () => {
  let primary: string
  let wt: string
  beforeEach(async () => {
    primary = mkdtempSync(join(tmpdir(), 'observe-api-pri-'))
    wt = mkdtempSync(join(tmpdir(), 'observe-api-wt-'))
    execSync('git init -q', { cwd: primary })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: primary, shell: '/bin/sh' })
    ensureIdentity(wt, 'agent-alice')
    await writeEvent(wt, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: wt })
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(wt, { recursive: true, force: true })
  })

  it('produces an EngineOutput with availability + snapshot + ledger summary', async () => {
    const out = await runProgress({
      primaryRoot: primary,
      sinceHours: 24,
      ghBin: '/no/such/gh',
      bdBin: '/no/such/bd',
    })
    expect(out.schema_version).toBe('1.0')
    expect(out.invocation.command).toBe('progress')
    expect(out.availability.git.status).toBe('available')
    expect(out.availability.ledger.events_read).toBe(1)
    expect(out.snapshot?.in_flight[0].task_id).toBe('T-1')
    expect(out.findings).toEqual([])
    expect(out.summary.total).toBe(0)
    expect(out.verdict).toBe('pass')
    expect(out.fix_threshold).toBe('P2')
  })
})
