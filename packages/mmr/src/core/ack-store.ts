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

/**
 * Validates a parsed ack record's shape AND that its embedded finding_key
 * matches the filename it was loaded from. The filename==key invariant guards
 * against desync (manual edit, merge conflict, tampering) silently
 * misattributing or shadowing acks — which matters because acks suppress
 * review findings.
 */
function isValidAckRecord(value: unknown, expectedKey: string): value is AckRecord {
  if (value === null || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    r.finding_key === expectedKey &&
    typeof r.normalized_location === 'string' &&
    Array.isArray(r.description_shingle) &&
    r.description_shingle.every((s) => typeof s === 'string') &&
    typeof r.created_at === 'string' &&
    (r.reason === undefined || typeof r.reason === 'string')
  )
}

interface LoadedScope {
  records: AckRecord[]
  byKey: Map<string, AckRecord>
}

export class AckStore {
  private readonly projectDir: string
  private readonly userDir: string
  // Per-instance lazy cache so a review that calls lookup() once per finding
  // reads each acks dir from disk at most once (avoids O(N*M) FS operations).
  private readonly loaded: Partial<Record<AckScope, LoadedScope>> = {}

  constructor(opts: AckStoreOptions) {
    this.projectDir = path.resolve(opts.projectRoot, '.mmr', 'acks')
    this.userDir = path.resolve(opts.userHome, '.mmr', 'acks')
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
    const resolved = path.resolve(dir, `${key}.json`)
    // Defense in depth: the resolved path must stay inside the scope dir.
    const rel = path.relative(dir, resolved)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Resolved ack path escapes its scope directory: ${resolved}`)
    }
    return resolved
  }

  add(record: AckRecord, scope: AckScope): void {
    this.validateKey(record.finding_key)
    const dir = this.dirForScope(scope)
    fs.mkdirSync(dir, { recursive: true })
    const fp = this.filePath(record.finding_key, scope)
    // Refuse to write through a symlink: acks gate finding suppression, so a
    // symlinked ack file must not be able to clobber an arbitrary target.
    try {
      if (fs.lstatSync(fp).isSymbolicLink()) {
        throw new Error(`Refusing to write ack through a symlink: ${fp}`)
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    // Atomic write: temp file + rename so readers never observe a partial record.
    const tmp = `${fp}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2))
    fs.renameSync(tmp, fp)
    this.loaded[scope] = undefined
  }

  remove(key: string, scope: AckScope): void {
    this.validateKey(key)
    const fp = this.filePath(key, scope)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
    this.loaded[scope] = undefined
  }

  private readDir(dir: string): AckRecord[] {
    if (!fs.existsSync(dir)) return []
    const out: AckRecord[] = []
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.json')) continue
      const keyOnly = entry.replace(/\.json$/, '')
      if (!FINDING_KEY_RE.test(keyOnly)) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf-8'))
      } catch {
        continue // best-effort: skip unreadable/malformed JSON
      }
      // Skip records whose shape is invalid or whose embedded key disagrees
      // with the filename (desynced/tampered/corrupt) — see isValidAckRecord.
      if (!isValidAckRecord(parsed, keyOnly)) continue
      out.push(parsed)
    }
    return out
  }

  private records(scope: AckScope): LoadedScope {
    let cached = this.loaded[scope]
    if (cached === undefined) {
      const records = this.readDir(this.dirForScope(scope))
      const byKey = new Map<string, AckRecord>()
      for (const r of records) byKey.set(r.finding_key, r)
      cached = { records, byKey }
      this.loaded[scope] = cached
    }
    return cached
  }

  /** Merge project and user acks; project shadows user on finding_key conflict. */
  listAll(): AckRecord[] {
    const byKey = new Map<string, AckRecord>()
    for (const u of this.records('user').records) byKey.set(u.finding_key, u)
    for (const p of this.records('project').records) byKey.set(p.finding_key, p) // project wins
    return [...byKey.values()]
  }

  /**
   * Lookup an ack matching the given finding identity, applying the two-step
   * rule from T2-D: (1) exact `finding_key` match (O(1) via the per-scope
   * index); (2) fuzzy fallback only when normalized_location matches AND
   * shingle Jaccard ≥ 0.7. Project scope shadows user scope.
   */
  lookup(finding: { finding_key: string; normalized_location: string; shingle: string[] }): AckMatch | undefined {
    const project = this.records('project')
    const user = this.records('user')
    // Exact match — project then user so project shadows user.
    const exactProject = project.byKey.get(finding.finding_key)
    if (exactProject) return { record: exactProject, match: 'exact', scope: 'project' }
    const exactUser = user.byKey.get(finding.finding_key)
    if (exactUser) return { record: exactUser, match: 'exact', scope: 'user' }
    // Fuzzy fallback — location must match exactly, shingle Jaccard ≥ 0.7.
    if (finding.shingle.length === 0) return undefined
    const candidates = [
      ...project.records.map((r) => ({ r, scope: 'project' as const })),
      ...user.records.map((r) => ({ r, scope: 'user' as const })),
    ]
    for (const { r, scope } of candidates) {
      if (r.normalized_location !== finding.normalized_location) continue
      if (jaccardSimilarity(r.description_shingle, finding.shingle) >= FUZZY_THRESHOLD) {
        return { record: r, match: 'fuzzy', scope }
      }
    }
    return undefined
  }
}
