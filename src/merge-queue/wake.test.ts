// src/merge-queue/wake.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { waitForWake } from './wake.js'
import { appendEvent, JOURNAL_FILE } from './journal.js'

// Every test below stubs fs.watch — none depend on real OS fs-event delivery
// or real watcher teardown timing. That matters because under this repo's
// full `npm run check` suite (309 files, heavy concurrent git/fs load across
// many worker threads), real fs.watch delivery was empirically found to be
// unreliably delayed — sometimes past the test ceiling, even for a single
// write — most likely due to libuv threadpool contention shared across the
// whole suite, not a defect in waitForWake's own logic (in isolation, on an
// idle system, the same code delivers in tens of milliseconds). A hard
// pass/fail assertion can't depend on that, so these stubs let every test
// deterministically verify wake.ts's own logic — listener wiring, filename
// filtering, debounce coalescing, error-path degradation — independent of
// real OS timing. The only real timing left is the fallback setTimeout
// (a plain timer, far more reliable than fs.watch); delays are kept small
// and the suite-wide testTimeout below stays generous as a further margin.
vi.setConfig({ testTimeout: 10_000 })

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-wake-')) }

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Stub fs.watch to deliver synthetic 'change' notifications on a controlled
 * schedule, bypassing real OS event delivery entirely. `filename` defaults to
 * the journal file (the "wake" case); pass an unrelated name to exercise the
 * filter branch, or an empty `fireDelaysMs` array for a watcher that never
 * fires (the pure-fallback case).
 */
function mockWatch(
  fireDelaysMs: number[],
  filename: string | null = JOURNAL_FILE,
): { closed: () => boolean } {
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
      setTimeout(() => listener?.('change', filename), delay)
    }
    return fakeWatcher
  }) as typeof fs.watch)
  return { closed: () => closed }
}

/**
 * Stub fs.watch to return a watcher whose 'error' handler fires after a short
 * delay — simulating the watch backend dying mid-wait (e.g. the directory
 * vanished), which is exactly the case wake.ts's `watcher.on('error', ...)`
 * exists to degrade gracefully from.
 */
function mockWatchError(delayMs = 10): { errored: () => boolean } {
  let errored = false
  const fakeWatcher = {
    close: () => { /* no-op */ },
    on: (event: string, cb: (err: Error) => void) => {
      if (event === 'error') {
        setTimeout(() => {
          errored = true
          cb(new Error('ENOENT: vanished'))
        }, delayMs)
      }
      return fakeWatcher
    },
  } as unknown as fs.FSWatcher
  vi.spyOn(fs, 'watch').mockImplementation((() => fakeWatcher) as unknown as typeof fs.watch)
  return { errored: () => errored }
}

describe('waitForWake', () => {
  it('resolves "journal" promptly when the journal is appended', async () => {
    const mqDir = tmp()
    const watcher = mockWatch([50])
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
    const watcher = mockWatch([]) // never fires — pure fallback path
    await expect(waitForWake(tmp(), 100, 25)).resolves.toBe('timeout')
    expect(watcher.closed()).toBe(true)
  })

  it('ignores writes to unrelated files in .mq', async () => {
    const mqDir = tmp()
    // Fires a 'change' event for a file that isn't the journal — wake.ts's
    // filename filter must ignore it and let the fallback timer resolve.
    const watcher = mockWatch([40], 'other.txt')
    await expect(waitForWake(mqDir, 100, 25)).resolves.toBe('timeout')
    expect(watcher.closed()).toBe(true)
  })

  it('debounces a burst of appends into one wake (single resolution)', async () => {
    const mqDir = tmp()
    const watcher = mockWatch([0, 2, 4, 6, 8])
    const p = waitForWake(mqDir, 2_000, 50)
    for (let i = 0; i < 5; i++) {
      appendEvent(mqDir, { type: 'enqueued', pr: i + 1, at: new Date().toISOString() })
    }
    await expect(p).resolves.toBe('journal')
    expect(watcher.closed()).toBe(true)
  })

  it('a vanished mqDir degrades to the poll timer instead of throwing', async () => {
    const mqDir = tmp()
    const watch = mockWatchError()
    await expect(waitForWake(mqDir, 100, 25)).resolves.toBe('timeout')
    expect(watch.errored()).toBe(true)
  })
})
