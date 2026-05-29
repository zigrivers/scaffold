import fs from 'node:fs'
import path from 'node:path'
import { jaccardSimilarity } from './stable-id.js'

const FUZZY_THRESHOLD = 0.7
const FINDING_KEY_RE = /^[a-f0-9]{40}$/

export interface AckRecord {
  finding_key: string
  normalized_location: string
  description_shingle: string[]
  reason?: string
  created_at: string
}

export type AckScope = 'project' | 'user'

export interface AckMatch {
  record: AckRecord
  match: 'exact' | 'fuzzy'
  scope: AckScope
}

export interface AckStoreOptions {
  projectRoot: string
  userHome: string
}

export class AckStore {
  private readonly projectDir: string
  private readonly userDir: string

  constructor(opts: AckStoreOptions) {
    this.projectDir = path.join(opts.projectRoot, '.mmr', 'acks')
    this.userDir = path.join(opts.userHome, '.mmr', 'acks')
  }

  private validateKey(key: string): void {
    if (!FINDING_KEY_RE.test(key)) {
      throw new Error(`Invalid finding_key: ${key} — must match ^[a-f0-9]{40}$`)
    }
  }

  private dirForScope(scope: AckScope): string {
    return scope === 'project' ? this.projectDir : this.userDir
  }

  private filePath(key: string, scope: AckScope): string {
    this.validateKey(key)
    const dir = this.dirForScope(scope)
    const fp = path.join(dir, `${key}.json`)
    // Defense in depth: resolved path must stay inside the scope dir.
    const resolved = path.resolve(fp)
    const resolvedDir = path.resolve(dir)
    if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
      throw new Error(`Resolved ack path escapes its scope directory: ${resolved}`)
    }
    return fp
  }

  add(record: AckRecord, scope: AckScope): void {
    this.validateKey(record.finding_key)
    const dir = this.dirForScope(scope)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(this.filePath(record.finding_key, scope), JSON.stringify(record, null, 2))
  }

  remove(key: string, scope: AckScope): void {
    this.validateKey(key)
    const fp = this.filePath(key, scope)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  }

  private readDir(dir: string): AckRecord[] {
    if (!fs.existsSync(dir)) return []
    const out: AckRecord[] = []
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.json')) continue
      const keyOnly = entry.replace(/\.json$/, '')
      if (!FINDING_KEY_RE.test(keyOnly)) continue
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf-8')) as AckRecord)
      } catch {
        // Skip malformed
      }
    }
    return out
  }

  /** Merge project and user acks; project shadows user on finding_key conflict. */
  listAll(): AckRecord[] {
    const byKey = new Map<string, AckRecord>()
    for (const u of this.readDir(this.userDir)) byKey.set(u.finding_key, u)
    for (const p of this.readDir(this.projectDir)) byKey.set(p.finding_key, p) // project wins
    return [...byKey.values()]
  }

  /**
   * Lookup an ack matching the given finding identity, applying the two-step
   * rule from T2-D: (1) exact `finding_key` match; (2) fuzzy fallback only
   * when normalized_location matches AND shingle Jaccard ≥ 0.7.
   */
  lookup(finding: { finding_key: string; normalized_location: string; shingle: string[] }): AckMatch | undefined {
    // Exact match — check project then user so project shadows user.
    const projectRecords = this.readDir(this.projectDir)
    const userRecords = this.readDir(this.userDir)
    for (const r of projectRecords) {
      if (r.finding_key === finding.finding_key) return { record: r, match: 'exact', scope: 'project' }
    }
    for (const r of userRecords) {
      if (r.finding_key === finding.finding_key) return { record: r, match: 'exact', scope: 'user' }
    }
    // Fuzzy fallback — location must match exactly, shingle Jaccard ≥ 0.7.
    if (finding.shingle.length === 0) return undefined
    const candidates = [...projectRecords.map((r) => ({ r, scope: 'project' as const })),
      ...userRecords.map((r) => ({ r, scope: 'user' as const }))]
    for (const { r, scope } of candidates) {
      if (r.normalized_location !== finding.normalized_location) continue
      if (jaccardSimilarity(r.description_shingle, finding.shingle) >= FUZZY_THRESHOLD) {
        return { record: r, match: 'fuzzy', scope }
      }
    }
    return undefined
  }
}
