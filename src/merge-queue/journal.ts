import fs from 'node:fs'
import path from 'node:path'
import type { JournalEvent } from './types.js'

export const JOURNAL_FILE = 'journal.jsonl'

export function appendEvent(mqDir: string, event: JournalEvent): void {
  fs.mkdirSync(mqDir, { recursive: true })
  fs.appendFileSync(path.join(mqDir, JOURNAL_FILE), JSON.stringify(event) + '\n')
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
