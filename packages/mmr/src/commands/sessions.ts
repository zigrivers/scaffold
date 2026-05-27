import fs from 'node:fs'
import path from 'node:path'

const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/
const WINDOWS_RESERVED_ID_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const SYSTEM_SESSION_ID_RE = /^(index|__proto__)$/i
const LOCK_TIMEOUT_MS = 5000
const LOCK_POLL_MS = 25

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
    if (!this.isValidId(id)) {
      throw new Error(`Invalid session id: ${id} - must match ^[a-zA-Z0-9_-]+$`)
    }
  }

  private isValidId(id: string): boolean {
    return SESSION_ID_RE.test(id) && !WINDOWS_RESERVED_ID_RE.test(id) && !SYSTEM_SESSION_ID_RE.test(id)
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

  private readRecord(filePath: string, tolerateMalformed: boolean): SessionRecord | undefined {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SessionRecord
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      if (tolerateMalformed && err instanceof SyntaxError) return undefined
      throw err
    }
  }

  private writeJsonAtomic(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2))
    fs.renameSync(tmpPath, filePath)
  }

  private writeFreshJson(filePath: string, record: SessionRecord): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), { flag: 'wx' })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Session already exists: ${record.session_id}`)
      }
      throw err
    }
  }

  private waitForLockRetry(): void {
    const end = Date.now() + LOCK_POLL_MS
    while (Date.now() < end) {
      // Synchronous CLI path; lock contention should be rare and short-lived.
    }
  }

  private withLock<T>(filePath: string, fn: () => T): T {
    const lockPath = `${filePath}.lock`
    const deadline = Date.now() + LOCK_TIMEOUT_MS
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    while (true) {
      try {
        fs.mkdirSync(lockPath, { recursive: false })
        break
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code !== 'EEXIST' || Date.now() >= deadline) throw err
        try {
          const stat = fs.statSync(lockPath)
          if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
            fs.rmSync(lockPath, { recursive: true, force: true })
            continue
          }
        } catch (statErr) {
          if ((statErr as NodeJS.ErrnoException).code !== 'ENOENT') throw statErr
        }
        this.waitForLockRetry()
      }
    }
    try {
      return fn()
    } finally {
      fs.rmSync(lockPath, { recursive: true, force: true })
    }
  }

  private readIndex(): Record<string, SessionRecord> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8')) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return parsed as Record<string, SessionRecord>
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw err
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
      this.writeFreshJson(fp, record)
      this.updateIndex((index) => {
        index[id] = record
      })
    })
    return record
  }

  show(id: string): SessionRecord | undefined {
    if (!this.isValidId(id)) return undefined
    const fp = this.filePath(id)
    return this.readRecord(fp, true)
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
      fs.rmSync(fp, { force: true })
      this.updateIndex((index) => {
        delete index[id]
      })
    })
  }

  addJob(id: string, jobId: string, round: number): void {
    this.validateId(id)
    const fp = this.filePath(id)
    this.withLock(fp, () => {
      const record = this.readRecord(fp, false) ?? this.makeRecord(id)
      record.jobs.push(jobId)
      record.rounds = Math.max(record.rounds, round)
      this.writeJsonAtomic(fp, record)
      this.updateIndex((index) => {
        index[id] = record
      })
    })
  }
}
