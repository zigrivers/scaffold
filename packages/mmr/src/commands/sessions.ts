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
  private readonly indexPath: string

  constructor(home: string) {
    this.dir = path.join(home, '.mmr', 'sessions')
    this.indexPath = path.join(this.dir, 'index.json')
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

  private makeRecord(id: string): SessionRecord {
    return {
      session_id: id,
      created_at: new Date().toISOString(),
      jobs: [],
      rounds: 0,
    }
  }

  private readRecord(filePath: string): SessionRecord | undefined {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SessionRecord
    } catch {
      return undefined
    }
  }

  private writeJsonAtomic(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2))
    fs.renameSync(tmpPath, filePath)
  }

  private withLock<T>(filePath: string, fn: () => T): T {
    const lockPath = `${filePath}.lock`
    const deadline = Date.now() + 5000
    while (true) {
      try {
        fs.mkdirSync(lockPath, { recursive: false })
        break
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code !== 'EEXIST' || Date.now() >= deadline) throw err
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
      }
    }
    try {
      return fn()
    } finally {
      fs.rmSync(lockPath, { recursive: true, force: true })
    }
  }

  private readIndex(): Record<string, SessionRecord> {
    if (!fs.existsSync(this.indexPath)) return {}
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8')) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return parsed as Record<string, SessionRecord>
    } catch {
      return {}
    }
  }

  private updateIndex(mutator: (index: Record<string, SessionRecord>) => void): void {
    this.withLock(this.indexPath, () => {
      const index = this.readIndex()
      mutator(index)
      this.writeJsonAtomic(this.indexPath, index)
    })
  }

  start(id: string): SessionRecord {
    this.validateId(id)
    fs.mkdirSync(this.dir, { recursive: true })
    const record = this.makeRecord(id)
    const fp = this.filePath(id)
    this.withLock(fp, () => {
      this.writeJsonAtomic(fp, record)
    })
    this.updateIndex((index) => {
      index[id] = record
    })
    return record
  }

  show(id: string): SessionRecord | undefined {
    if (!SESSION_ID_RE.test(id)) return undefined
    const fp = this.filePath(id)
    if (!fs.existsSync(fp)) return undefined
    return this.readRecord(fp)
  }

  list(): SessionRecord[] {
    const out = Object.values(this.readIndex())
    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return out
  }

  end(id: string): void {
    this.validateId(id)
    const fp = this.filePath(id)
    this.withLock(fp, () => {
      if (fs.existsSync(fp)) fs.unlinkSync(fp)
    })
    this.updateIndex((index) => {
      delete index[id]
    })
  }

  addJob(id: string, jobId: string, round: number): void {
    this.validateId(id)
    const fp = this.filePath(id)
    let updated: SessionRecord | undefined
    this.withLock(fp, () => {
      const existing = this.readRecord(fp) ?? this.makeRecord(id)
      existing.jobs.push(jobId)
      existing.rounds = Math.max(existing.rounds, round)
      this.writeJsonAtomic(fp, existing)
      updated = existing
    })
    if (updated) {
      const record = updated
      this.updateIndex((index) => {
        index[id] = record
      })
    }
  }
}
