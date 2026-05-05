import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harvestWorktree } from './harvester.js'
import { writeEvent } from './ledger-writer.js'
import { ensureIdentity, readIdentity } from './identity.js'

describe('harvester', () => {
  let primary: string
  let worktree: string

  beforeEach(() => {
    primary = mkdtempSync(join(tmpdir(), 'observe-primary-'))
    worktree = mkdtempSync(join(tmpdir(), 'observe-wt-'))
    ensureIdentity(worktree, 'agent-alice')
  })
  afterEach(() => {
    rmSync(primary, { recursive: true, force: true })
    rmSync(worktree, { recursive: true, force: true })
  })

  it('copies worktree ledger to <primary>/.scaffold/activity-archive/active/<id>.jsonl atomically', async () => {
    await writeEvent(worktree, { type: 'task_claimed', branch: 'b', task_id: 'T-1', payload: { task_title: 'Hi' } })
    const id = readIdentity(worktree)!

    await harvestWorktree({ primaryRoot: primary, worktreeRoot: worktree })

    const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
    expect(existsSync(archived)).toBe(true)
    const lines = readFileSync(archived, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).type).toBe('task_claimed')
  })

  it('overwrites prior archive (idempotent full-file replacement)', async () => {
    await writeEvent(worktree, { type: 'task_claimed', branch: 'b', task_id: 'T-1', payload: { task_title: 'Hi' } })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: worktree })
    await writeEvent(worktree, {
      type: 'task_completed', branch: 'b', task_id: 'T-1',
      payload: { outcome: 'pr_submitted', pr_number: 42 },
    })
    await harvestWorktree({ primaryRoot: primary, worktreeRoot: worktree })

    const id = readIdentity(worktree)!
    const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
    const lines = readFileSync(archived, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[1]).type).toBe('task_completed')
  })

  it('does nothing (returns silently) if the worktree has no ledger yet', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'observe-empty-'))
    ensureIdentity(empty, 'agent-bob')
    try {
      await harvestWorktree({ primaryRoot: primary, worktreeRoot: empty })
      const id = readIdentity(empty)!
      const archived = join(primary, '.scaffold/activity-archive/active', `${id.worktree_id}.jsonl`)
      expect(existsSync(archived)).toBe(false)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
