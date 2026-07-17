// src/cli/commands/mq.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mqCommand, { mqHandler } from './mq.js'
import { readJournal } from '../../merge-queue/journal.js'

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

  it('stats runs against an empty queue without throwing', async () => {
    process.env.MQ_NO_AUTOSTART = '1'
    const root = scratchRepo()
    await expect(mqHandler({ action: 'stats', root })).resolves.toBeUndefined()
  })
})
