// src/merge-queue/wake.ts — D15: event-driven daemon wake. fs.watch on the .mq
// journal (debounced) with the poll interval as the fallback ceiling. No
// watchman, no new dependencies; on filesystems where fs.watch is unavailable
// or dies mid-wait, behavior degrades silently to pure interval polling.
import fs from 'node:fs'
import { JOURNAL_FILE } from './journal.js'

export function waitForWake(
  mqDir: string,
  timeoutMs: number,
  debounceMs = 150,
): Promise<'journal' | 'timeout'> {
  return new Promise(resolve => {
    let watcher: fs.FSWatcher | null = null
    let debounce: NodeJS.Timeout | null = null
    let settled = false
    const finish = (why: 'journal' | 'timeout'): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (debounce !== null) clearTimeout(debounce)
      try { watcher?.close() } catch { /* already closed */ }
      resolve(why)
    }
    const timer = setTimeout(() => finish('timeout'), timeoutMs)
    try {
      fs.mkdirSync(mqDir, { recursive: true })
      // Watch the DIRECTORY, not the file: the journal may not exist yet, and
      // directory watches survive file replacement. A null filename (some
      // platforms omit it) is treated as potentially-the-journal — a spurious
      // wake costs one idle cycle; a missed wake would cost a full poll interval.
      watcher = fs.watch(mqDir, (_event, filename) => {
        if (filename !== null && filename !== JOURNAL_FILE) return
        if (debounce !== null) clearTimeout(debounce)
        debounce = setTimeout(() => finish('journal'), debounceMs)
      })
      watcher.on('error', () => {
        // The watcher died (e.g. the directory was removed) — degrade to the
        // poll timer rather than rejecting; the daemon loop must never crash
        // because a watch backend hiccuped.
        try { watcher?.close() } catch { /* already closed */ }
        watcher = null
      })
    } catch {
      // fs.watch unsupported here — the poll timer alone resolves.
    }
  })
}
