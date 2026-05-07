import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harvestWorktree, activeArchiveFile } from './harvester.js'
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

    const archived = activeArchiveFile(primary, id.worktree_id)
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
    const archived = activeArchiveFile(primary, id.worktree_id)
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
      const archived = activeArchiveFile(primary, id.worktree_id)
      expect(existsSync(archived)).toBe(false)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

import { mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { recoverStaleArchives } from './harvester.js'

describe('harvester.recoverStaleArchives', () => {
  let primary: string

  beforeEach(() => {
    primary = mkdtempSync(join(tmpdir(), 'observe-recover-'))
  })
  afterEach(() => { rmSync(primary, { recursive: true, force: true }) })

  it('rotates active-archive entries whose worktree path no longer exists', async () => {
    const activeDir = join(primary, '.scaffold/activity-archive/active')
    mkdirSync(activeDir, { recursive: true })
    const staleEntry = JSON.stringify({
      event_id: 'ulid-x', worktree_id: 'aaaa', actor_label: 'orphan', branch: 'b',
      task_id: 'T-1', type: 'task_claimed', ts: '2026-04-01T00:00:00Z', payload: { task_title: 'gone' },
    })
    writeFileSync(join(activeDir, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl'), `${staleEntry}\n`)

    const result = await recoverStaleArchives({ primaryRoot: primary })
    expect(result.rotated).toContain('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(existsSync(join(activeDir, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl'))).toBe(false)
    const archiveFiles = readdirSync(join(primary, '.scaffold/activity-archive'))
    expect(archiveFiles.some((f) => /^\d{4}-\d{2}\.jsonl(\.gz)?$/.test(f))).toBe(true)
  })

  it('leaves active archives whose worktree still exists alone', async () => {
    const activeDir = join(primary, '.scaffold/activity-archive/active')
    mkdirSync(activeDir, { recursive: true })
    const wtId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
    const wtPath = mkdtempSync(join(tmpdir(), 'observe-recover-wt-'))
    try {
      mkdirSync(join(wtPath, '.scaffold'), { recursive: true })
      const identity = JSON.stringify({ worktree_id: wtId, worktree_label: 'live', created_at: '2026-05-04T00:00:00Z' })
      writeFileSync(join(wtPath, '.scaffold/identity.json'), identity)
      writeFileSync(join(activeDir, `${wtId}.jsonl`), '{}\n')

      const result = await recoverStaleArchives({ primaryRoot: primary, listWorktrees: () => [wtPath] })
      expect(result.rotated).toEqual([])
      expect(existsSync(join(activeDir, `${wtId}.jsonl`))).toBe(true)
    } finally {
      rmSync(wtPath, { recursive: true, force: true })
    }
  })
})
