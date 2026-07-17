import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { appendEvent, readJournal, JOURNAL_FILE } from './journal.js'
import type { JournalEvent } from './types.js'

function tmpMqDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-journal-'))
}

const e1: JournalEvent = { type: 'enqueued', pr: 12, at: '2026-07-17T00:00:00.000Z' }
const e2: JournalEvent = {
  type: 'pr_state', pr: 12, state: 'IN_BATCH', batchId: 'b1', at: '2026-07-17T00:01:00.000Z',
}

describe('journal', () => {
  it('appends and reads events round-trip in order', () => {
    const dir = tmpMqDir()
    appendEvent(dir, e1)
    appendEvent(dir, e2)
    expect(readJournal(dir)).toEqual([e1, e2])
  })

  it('creates the mq dir on first append', () => {
    const dir = path.join(tmpMqDir(), 'nested')
    appendEvent(dir, e1)
    expect(fs.existsSync(path.join(dir, JOURNAL_FILE))).toBe(true)
  })

  it('returns [] when no journal exists', () => {
    expect(readJournal(tmpMqDir())).toEqual([])
  })

  it('tolerates a torn final line (crash mid-write)', () => {
    const dir = tmpMqDir()
    appendEvent(dir, e1)
    fs.appendFileSync(path.join(dir, JOURNAL_FILE), '{"type":"pr_state","pr":13')
    expect(readJournal(dir)).toEqual([e1])
  })

  it('truncates a torn final line before appending so later reads still parse', () => {
    const dir = tmpMqDir()
    appendEvent(dir, e1)
    // Simulate a crash mid-write: a partial record with no trailing newline.
    fs.appendFileSync(path.join(dir, JOURNAL_FILE), '{"type":"pr_state","pr":13')
    appendEvent(dir, e2) // must NOT fuse onto the torn tail
    expect(readJournal(dir)).toEqual([e1, e2])
  })

  it('preserves a valid final record that only lost its trailing newline', () => {
    const dir = tmpMqDir()
    appendEvent(dir, e1)
    // A crash AFTER the full JSON was written but BEFORE the newline: the record
    // is valid and must NOT be discarded by the next append.
    fs.appendFileSync(path.join(dir, JOURNAL_FILE), JSON.stringify(e2))
    appendEvent(dir, e1)
    expect(readJournal(dir)).toEqual([e1, e2, e1])
  })

  it('throws on a corrupt NON-final line (real corruption, not a crash)', () => {
    const dir = tmpMqDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, JOURNAL_FILE), 'garbage\n' + JSON.stringify(e1) + '\n')
    expect(() => readJournal(dir)).toThrow(/corrupt/i)
  })
})
