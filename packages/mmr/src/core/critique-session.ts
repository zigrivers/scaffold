import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isValidSessionId, SESSION_ID_RULE } from './session-id.js'
import type { CritiqueKind } from '../types/critique.js'

/** A single item carried in the iteration ledger (bounded — no shingles/sources). */
export interface LedgerItem {
  id: string
  kind: CritiqueKind
  theme: string
  observation: string
}

/** One recorded round of an iterative critique session. */
export interface CritiqueRound {
  round: number
  artifact_source: string
  items: LedgerItem[]
}

/** Root dir for critique sessions, honoring MMR_HOME like the review sessions. */
export function resolveCritiqueSessionRoot(): string {
  const mmrHome = process.env.MMR_HOME
  const base = mmrHome && mmrHome.trim() !== ''
    ? path.resolve(mmrHome)
    : path.join(process.env.HOME ?? os.homedir(), '.mmr')
  return path.join(base, 'critique-sessions')
}

/**
 * File-backed store of iterative critique rounds, one JSON file per session.
 * Deliberately separate from the review SessionStore (which tracks review
 * jobs) — critique stays parallel and isolated.
 */
export class CritiqueSessionStore {
  constructor(private readonly root: string) {}

  private filePath(id: string): string {
    if (!isValidSessionId(id)) throw new Error(`Invalid session id: ${id} — must match ${SESSION_ID_RULE}`)
    return path.join(this.root, `${id}.json`)
  }

  /** Prior rounds for a session, oldest first; [] if none. */
  load(id: string): CritiqueRound[] {
    try {
      const rounds = JSON.parse(fs.readFileSync(this.filePath(id), 'utf-8')) as CritiqueRound[]
      return Array.isArray(rounds) ? rounds : []
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      if (err instanceof SyntaxError) return []
      throw err
    }
  }

  /** Append a round (atomically). */
  append(id: string, round: CritiqueRound): void {
    const file = this.filePath(id)
    const rounds = this.load(id)
    rounds.push(round)
    fs.mkdirSync(this.root, { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(rounds, null, 2))
    fs.renameSync(tmp, file)
  }
}
