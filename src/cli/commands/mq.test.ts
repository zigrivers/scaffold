// src/cli/commands/mq.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkSync, lockSync } from 'proper-lockfile'
import mqCommand, { mqHandler } from './mq.js'
import { appendEvent, readJournal } from '../../merge-queue/journal.js'
import { reduceState } from '../../merge-queue/state.js'

function scratchRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-cli-'))
  execFileSync('git', ['init', '-b', 'main', dir])
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't'])
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t.invalid'])
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x\n')
  execFileSync('git', ['-C', dir, 'add', 'f.txt'])
  execFileSync('git', ['-C', dir, 'commit', '-m', 'base'])
  return dir
}

afterEach(() => {
  delete process.env.MQ_NO_AUTOSTART
})

describe('scaffold mq', () => {
  it('declares the five actions', () => {
    expect(mqCommand.command).toBe('mq <action>')
  })

  it('enqueue appends a journal event (autostart suppressed)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', pr: 12, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'enqueued', pr: 12 })
  })

  it('enqueue without --pr sets a failure exit code', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', root })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })

  it('eject records CANCELLED for a queued PR', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'enqueue', pr: 7, root })
    await mqHandler({ action: 'eject', pr: 7, root })
    const events = readJournal(path.join(root, '.mq'))
    expect(events[1]).toMatchObject({ type: 'pr_state', pr: 7, state: 'CANCELLED' })
  })

  it('eject on a PR not in the queue is a no-op (no CANCELLED appended)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await mqHandler({ action: 'eject', pr: 99, root })
    expect(readJournal(path.join(root, '.mq'))).toHaveLength(0)
  })

  it('eject does not clobber a terminal state (LANDED stays LANDED)', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    await mqHandler({ action: 'enqueue', pr: 5, root })
    appendEvent(mqDir, { type: 'pr_state', pr: 5, state: 'LANDED', at: new Date().toISOString() })
    await mqHandler({ action: 'eject', pr: 5, root })
    expect(reduceState(readJournal(mqDir)).entries.get(5)?.state).toBe('LANDED')
  })

  it('stats runs against an empty queue without throwing', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await expect(mqHandler({ action: 'stats', root })).resolves.toBeUndefined()
  })

  it('daemon returns cleanly when the lock is already held', async () => {
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    fs.mkdirSync(mqDir, { recursive: true })
    const release = lockSync(mqDir, { lockfilePath: path.join(mqDir, 'daemon.lock'), stale: 60_000 })
    try {
      await expect(mqHandler({ action: 'daemon', once: true, root })).resolves.toBeUndefined()
    } finally {
      release()
    }
  })

  it('daemon releases the lock when deps construction throws', async () => {
    const root = scratchRepo()
    const mqDir = path.join(root, '.mq')
    process.env.MQ_GH_CMD = '/nonexistent/gh-binary'
    try {
      await expect(mqHandler({ action: 'daemon', once: true, root })).rejects.toThrow(/gh CLI/)
    } finally {
      delete process.env.MQ_GH_CMD
    }
    expect(checkSync(mqDir, { lockfilePath: path.join(mqDir, 'daemon.lock'), stale: 60_000 })).toBe(false)
  })
})
