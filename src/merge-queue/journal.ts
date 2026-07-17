import fs from 'node:fs'
import path from 'node:path'
import { lockSync } from 'proper-lockfile'
import type { JournalEvent } from './types.js'

export const JOURNAL_FILE = 'journal.jsonl'
const REPAIR_LOCK = '.journal.lock'

/** True when the file's last byte is not a newline — a torn final record. */
function tailIsTorn(file: string): boolean {
  const size = fs.statSync(file).size
  if (size === 0) return false
  const fd = fs.openSync(file, 'r')
  const last = Buffer.alloc(1)
  fs.readSync(fd, last, 0, 1, size - 1)
  fs.closeSync(fd)
  return last[0] !== 0x0a // 0x0a === '\n'
}

/** Repair a torn tail: a fully-written record that lost only its newline is
 *  completed (kept); a genuinely partial record is truncated away. */
function repairTornTail(file: string): void {
  const buf = fs.readFileSync(file)
  const lastNl = buf.lastIndexOf(0x0a)
  const tail = buf.subarray(lastNl + 1).toString('utf8')
  let tailIsValid = false
  try { JSON.parse(tail); tailIsValid = true } catch { tailIsValid = false }
  if (tailIsValid) fs.appendFileSync(file, '\n')
  else fs.truncateSync(file, lastNl + 1) // -1 → truncate to empty
}

function spinWait(ms: number): void {
  const until = Date.now() + ms
  while (Date.now() < until) { /* brief busy wait — torn-tail contention is rare */ }
}

export function appendEvent(mqDir: string, event: JournalEvent): void {
  fs.mkdirSync(mqDir, { recursive: true })
  const file = path.join(mqDir, JOURNAL_FILE)
  // Crash safety: an interrupted previous append leaves the file without a trailing
  // newline (a torn final record). readJournal tolerates ONE such tail, but
  // appending onto it would fuse the new event to the partial line — permanent
  // non-final corruption. So repair first. The APPEND is always an atomic O_APPEND,
  // so only the repair's truncate needs cross-process serialization: `mq enqueue`
  // appends WITHOUT the daemon lock, so two writers could otherwise both read the
  // torn tail and truncate against a stale offset, dropping each other's events.
  // Guard the (rare) repair with a short-lived lock + double-check; the common
  // clean-tail path stays lock-free.
  if (fs.existsSync(file) && tailIsTorn(file)) {
    const lockOpts = { lockfilePath: path.join(mqDir, REPAIR_LOCK), stale: 5_000 }
    const deadline = Date.now() + 6_000
    for (;;) {
      if (!tailIsTorn(file)) break // another writer already repaired it
      let release: (() => void) | null = null
      try {
        release = lockSync(mqDir, lockOpts)
      } catch (err) {
        if ((err as { code?: string }).code !== 'ELOCKED') throw err
        if (Date.now() >= deadline) { repairTornTail(file); break } // holder stuck — last resort
        spinWait(15)
        continue
      }
      try {
        if (tailIsTorn(file)) repairTornTail(file) // double-checked under the lock
      } finally {
        release()
      }
      break
    }
  }
  fs.appendFileSync(file, JSON.stringify(event) + '\n')
}

export function readJournal(mqDir: string): JournalEvent[] {
  const file = path.join(mqDir, JOURNAL_FILE)
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.length > 0)
  const events: JournalEvent[] = []
  for (let i = 0; i < lines.length; i++) {
    try {
      events.push(JSON.parse(lines[i]) as JournalEvent)
    } catch {
      // A torn FINAL line is an expected crash artifact (write-ahead append was
      // interrupted); anything earlier is real corruption and must fail loud.
      if (i === lines.length - 1) break
      throw new Error(`merge-queue journal corrupt at line ${i + 1}: ${file}`)
    }
  }
  return events
}
