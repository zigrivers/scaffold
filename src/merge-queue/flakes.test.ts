import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  QUARANTINE_THRESHOLD, addToQuarantine, fileQuarantineBead, recentFlakeCount, recordFlake,
} from './flakes.js'
import { readJournal } from './journal.js'
import { reduceState } from './state.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-flakes-')) }

describe('flakes', () => {
  it('recordFlake appends a journal flake event', () => {
    const dir = tmp()
    recordFlake(dir, 'src/a.test.ts', '2026-07-17T00:00:00.000Z')
    expect(readJournal(dir)).toEqual([
      { type: 'flake', testId: 'src/a.test.ts', at: '2026-07-17T00:00:00.000Z' },
    ])
  })

  it('recentFlakeCount counts only the 7-day window for that test', () => {
    const dir = tmp()
    recordFlake(dir, 't1', '2026-07-01T00:00:00.000Z') // stale
    recordFlake(dir, 't1', '2026-07-15T00:00:00.000Z')
    recordFlake(dir, 't1', '2026-07-16T00:00:00.000Z')
    recordFlake(dir, 't2', '2026-07-16T00:00:00.000Z') // other test
    const state = reduceState(readJournal(dir))
    expect(recentFlakeCount(state, 't1', new Date('2026-07-17T00:00:00.000Z'))).toBe(2)
  })

  it('QUARANTINE_THRESHOLD is 3 (spec D8)', () => {
    expect(QUARANTINE_THRESHOLD).toBe(3)
  })

  it('addToQuarantine appends once and dedups', () => {
    const root = tmp()
    expect(addToQuarantine(root, '.mq/quarantine.txt', 'src/a.test.ts')).toBe(true)
    expect(addToQuarantine(root, '.mq/quarantine.txt', 'src/a.test.ts')).toBe(false)
    const body = fs.readFileSync(path.join(root, '.mq/quarantine.txt'), 'utf8')
    expect(body).toBe('src/a.test.ts\n')
  })

  it('fileQuarantineBead is a silent no-op when bd is missing', () => {
    const root = tmp()
    const oldPath = process.env.PATH
    process.env.PATH = root // nothing on PATH
    try {
      expect(() => fileQuarantineBead(root, 'src/a.test.ts')).not.toThrow()
    } finally {
      process.env.PATH = oldPath
    }
  })
})
