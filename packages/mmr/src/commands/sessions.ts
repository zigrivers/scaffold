import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/
const WINDOWS_RESERVED_ID_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const SYSTEM_SESSION_ID_RE = /^(index|__proto__)$/i
/**
 * Human-readable description of the session-id rules, shared by every
 * validation error message so the CLI surfaces one consistent explanation
 * (the bare regex plus the reserved-name rejections).
 */
export const SESSION_ID_RULE =
  '^[a-zA-Z0-9_-]+$ and not a reserved name (con, prn, aux, nul, com1-9, lpt1-9, index, __proto__)'
const LOCK_TIMEOUT_MS = 5000
const LOCK_POLL_MS = 25

export interface SessionRecord {
  session_id: string
  created_at: string
  jobs: string[]
  rounds: number
}

interface SessionIdArgs {
  id: string
}

export class SessionStore {
  private readonly dir: string
  private readonly indexPath: string

  static fromHome(home: string): SessionStore {
    return new SessionStore(path.join(home, '.mmr'))
  }

  constructor(mmrRoot: string) {
    this.dir = path.join(mmrRoot, 'sessions')
    this.indexPath = path.join(this.dir, 'index.json')
  }

  private validateId(id: string): void {
    if (!this.isValidId(id)) {
      throw new Error(`Invalid session id: ${id} - must match ${SESSION_ID_RULE}`)
    }
  }

  private isValidId(id: string): boolean {
    return isValidSessionId(id)
  }

  private filePath(id: string): string {
    this.validateId(id)
    return path.join(this.dir, `${id}.json`)
  }

  private sessionLockPath(id: string): string {
    this.validateId(id)
    return path.join(this.dir, `${id}.session-lock`)
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
    this.withLock(this.sessionLockPath(id), () => {
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

  end(id: string): boolean {
    this.validateId(id)
    const fp = this.filePath(id)
    return this.withLock(this.sessionLockPath(id), () => {
      const existed = fs.existsSync(fp)
      if (existed) fs.rmSync(fp, { force: true })
      let indexed = false
      this.updateIndex((index) => {
        indexed = Object.hasOwn(index, id)
        delete index[id]
      })
      return existed || indexed
    })
  }

  addJob(id: string, jobId: string, round: number): void {
    this.validateId(id)
    const fp = this.filePath(id)
    this.withLock(this.sessionLockPath(id), () => {
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

/**
 * Validates a session id against the same rules SessionStore enforces:
 * the allowed-character regex plus Windows-reserved and system-reserved names
 * that would otherwise pass the bare regex. Exported so callers (e.g. the
 * review command) can reject invalid ids up front, before any side effects.
 */
export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id) && !WINDOWS_RESERVED_ID_RE.test(id) && !SYSTEM_SESSION_ID_RE.test(id)
}

/**
 * Resolves the MMR state root. MMR_HOME, when set, may be absolute or
 * cwd-relative (resolved to absolute here); a leading `~` is not expanded —
 * rely on the shell to expand it, as with any other path env var.
 */
export function resolveSessionRoot(): string {
  const mmrHome = process.env.MMR_HOME
  if (mmrHome !== undefined && mmrHome.trim() !== '') return path.resolve(mmrHome)
  return path.join(process.env.HOME ?? os.homedir(), '.mmr')
}

/**
 * The jobs directory, resolved under the same root as sessions so that
 * `mmr review` (which writes jobs) and the rest of the job lifecycle
 * (`mmr jobs|status|results|reconcile`) all honor MMR_HOME consistently.
 */
export function resolveJobsDir(): string {
  return path.join(resolveSessionRoot(), 'jobs')
}

export function getSessionStore(): SessionStore {
  return new SessionStore(resolveSessionRoot())
}

export const sessionsCommand: CommandModule<object, object> = {
  command: 'sessions <command>',
  describe: 'Manage MMR review sessions (T2-B)',
  builder: (yargs) =>
    yargs
      .command({
        command: 'start <id>',
        describe: 'Start an MMR review session',
        builder: (cmd) => cmd.positional('id', { type: 'string', demandOption: true }),
        handler: (args: ArgumentsCamelCase<SessionIdArgs>) => {
          console.log(JSON.stringify(getSessionStore().start(args.id), null, 2))
        },
      })
      .command({
        command: 'list',
        describe: 'List MMR review sessions',
        handler: () => {
          console.log(JSON.stringify(getSessionStore().list(), null, 2))
        },
      })
      .command({
        command: 'show <id>',
        describe: 'Show an MMR review session',
        builder: (cmd) => cmd.positional('id', { type: 'string', demandOption: true }),
        handler: (args: ArgumentsCamelCase<SessionIdArgs>) => {
          const record = getSessionStore().show(args.id)
          if (!record) throw new Error(`Session not found: ${args.id}`)
          console.log(JSON.stringify(record, null, 2))
        },
      })
      .command({
        command: 'end <id>',
        describe: 'End an MMR review session',
        builder: (cmd) => cmd.positional('id', { type: 'string', demandOption: true }),
        handler: (args: ArgumentsCamelCase<SessionIdArgs>) => {
          if (!getSessionStore().end(args.id)) throw new Error(`Session not found: ${args.id}`)
          console.log(JSON.stringify({ ended: args.id }, null, 2))
        },
      })
      .demandCommand(1, 'Run mmr sessions --help for usage')
      .strict(),
  handler: () => {},
}
