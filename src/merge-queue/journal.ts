import fs from 'node:fs'
import path from 'node:path'
import type { JournalEvent } from './types.js'

export const JOURNAL_FILE = 'journal.jsonl'

export function appendEvent(mqDir: string, event: JournalEvent): void {
  fs.mkdirSync(mqDir, { recursive: true })
  const file = path.join(mqDir, JOURNAL_FILE)
  // Crash safety: if the previous append was interrupted, the file ends without a
  // trailing newline (a torn final record). readJournal tolerates ONE such tail,
  // but appending directly would fuse the new event onto that partial line —
  // turning a recoverable torn tail into permanent non-final corruption that
  // fails every future read. Truncate back to the last complete newline first.
  // Hot-path cheap: stat + a single trailing-byte read; the full read only runs
  // on the rare torn tail.
  if (fs.existsSync(file)) {
    const size = fs.statSync(file).size
    if (size > 0) {
      const fd = fs.openSync(file, 'r')
      const last = Buffer.alloc(1)
      fs.readSync(fd, last, 0, 1, size - 1)
      fs.closeSync(fd)
      if (last[0] !== 0x0a) { // 0x0a === '\n'
        const buf = fs.readFileSync(file)
        fs.truncateSync(file, buf.lastIndexOf(0x0a) + 1) // -1 → truncate to empty
      }
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
