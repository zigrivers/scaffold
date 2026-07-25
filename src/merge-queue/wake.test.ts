// src/merge-queue/wake.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { waitForWake } from './wake.js'
import { appendEvent, JOURNAL_FILE } from './journal.js'

// Tests below that assert resolves.toBe('timeout') (2, 3, 5) use REAL
// fs.watch and have proven reliable: their pass condition holds whether or
// not a watch event ever fires. Tests that assert resolves.toBe('journal')
// (1, 4) stub fs.watch instead — see mockJournalWatch below for why.
vi.setConfig({ testTimeout: 10_000 })

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-wake-')) }

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Stub fs.watch to deliver synthetic journal-change notifications on a
 * controlled schedule, bypassing real OS event delivery entirely.
 *
 * Why: under this repo's full `npm run check` suite (309 files, heavy
 * concurrent git/fs load across many worker threads), real fs.watch delivery
 * was empirically found to be unreliably delayed — sometimes past 10s, even
 * for a single write — most likely due to libuv threadpool contention shared
 * across the whole suite, not a defect in waitForWake's own logic (in
 * isolation, on an idle system, the same code delivers in tens of
 * milliseconds). A hard pass/fail assertion can't depend on that. This stub
 * lets these two tests deterministically verify wake.ts's own logic — listener
 * wiring, debounce coalescing, resolving 'journal' — without depending on
 * real OS timing. The 'timeout'-asserting tests below keep real fs.watch,
 * since their outcome doesn't depend on it firing.
 */
function mockJournalWatch(fireDelaysMs: number[]): { closed: () => boolean } {
  let closed = false
  const fakeWatcher = {
    close: () => { closed = true },
    on: () => fakeWatcher,
  } as unknown as fs.FSWatcher
  vi.spyOn(fs, 'watch').mockImplementation(((
    _path: fs.PathLike,
    listener?: (event: string, filename: string | null) => void,
  ) => {
    for (const delay of fireDelaysMs) {
      setTimeout(() => listener?.('change', JOURNAL_FILE), delay)
    }
    return fakeWatcher
  }) as typeof fs.watch)
  return { closed: () => closed }
}

describe('waitForWake', () => {
  it('resolves "journal" promptly when the journal is appended', async () => {
    const mqDir = tmp()
    const watcher = mockJournalWatch([50])
    const started = Date.now()
    const p = waitForWake(mqDir, 10_000, 25)
    setTimeout(() => {
      appendEvent(mqDir, { type: 'enqueued', pr: 1, at: new Date().toISOString() })
    }, 50)
    await expect(p).resolves.toBe('journal')
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(watcher.closed()).toBe(true)
  })

  it('falls back to the poll timer when nothing is written', async () => {
    await expect(waitForWake(tmp(), 120, 25)).resolves.toBe('timeout')
  })

  it('ignores writes to unrelated files in .mq', async () => {
    const mqDir = tmp()
    const p = waitForWake(mqDir, 250, 25)
    setTimeout(() => fs.writeFileSync(path.join(mqDir, 'other.txt'), 'x\n'), 40)
    await expect(p).resolves.toBe('timeout')
  })

  it('debounces a burst of appends into one wake (single resolution)', async () => {
    const mqDir = tmp()
    const watcher = mockJournalWatch([0, 2, 4, 6, 8])
    const p = waitForWake(mqDir, 2_000, 50)
    for (let i = 0; i < 5; i++) {
      appendEvent(mqDir, { type: 'enqueued', pr: i + 1, at: new Date().toISOString() })
    }
    await expect(p).resolves.toBe('journal')
    expect(watcher.closed()).toBe(true)
  })

  it('a vanished mqDir degrades to the poll timer instead of throwing', async () => {
    const mqDir = tmp()
    const p = waitForWake(mqDir, 200, 25)
    fs.rmSync(mqDir, { recursive: true, force: true })
    await expect(p).resolves.toBe('timeout')
  })
})
