import fs from 'node:fs'
import path from 'node:path'

const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/

export interface SessionRecord {
  session_id: string
  created_at: string
  jobs: string[]
  rounds: number
}

export class SessionStore {
  private readonly dir: string

  constructor(home: string) {
    this.dir = path.join(home, '.mmr', 'sessions')
  }

  private validateId(id: string): void {
    if (!SESSION_ID_RE.test(id)) {
      throw new Error(`Invalid session id: ${id} - must match ^[a-zA-Z0-9_-]+$`)
    }
  }

  private filePath(id: string): string {
    this.validateId(id)
    return path.join(this.dir, `${id}.json`)
  }

  start(id: string): SessionRecord {
    this.validateId(id)
    fs.mkdirSync(this.dir, { recursive: true })
    const record: SessionRecord = {
      session_id: id,
      created_at: new Date().toISOString(),
      jobs: [],
      rounds: 0,
    }
    fs.writeFileSync(this.filePath(id), JSON.stringify(record, null, 2))
    return record
  }

  show(id: string): SessionRecord | undefined {
    if (!SESSION_ID_RE.test(id)) return undefined
    const fp = this.filePath(id)
    if (!fs.existsSync(fp)) return undefined
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as SessionRecord
  }

  list(): SessionRecord[] {
    if (!fs.existsSync(this.dir)) return []
    const out: SessionRecord[] = []
    for (const entry of fs.readdirSync(this.dir)) {
      if (!entry.endsWith('.json')) continue
      const id = entry.replace(/\.json$/, '')
      if (!SESSION_ID_RE.test(id)) continue
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(this.dir, entry), 'utf-8')) as SessionRecord)
      } catch {
        // Ignore malformed session files so one bad record does not hide the rest.
      }
    }
    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return out
  }

  end(id: string): void {
    this.validateId(id)
    const fp = this.filePath(id)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  }

  addJob(id: string, jobId: string, round: number): void {
    this.validateId(id)
    const existing = this.show(id) ?? this.start(id)
    existing.jobs.push(jobId)
    existing.rounds = Math.max(existing.rounds, round)
    fs.writeFileSync(this.filePath(id), JSON.stringify(existing, null, 2))
  }
}
