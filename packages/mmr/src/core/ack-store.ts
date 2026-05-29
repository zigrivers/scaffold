import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { jaccardSimilarity } from './stable-id.js'

const FUZZY_THRESHOLD = 0.7
const FINDING_KEY_RE = /^[a-f0-9]{40}$/
// Acks are tiny (a key, a location, a few dozen shingles, a short reason).
// Cap reads well above any realistic record so a planted oversized file in an
// untrusted project tree can't OOM the review.
const MAX_ACK_BYTES = 256 * 1024

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
  /**
   * Project root whose ./.mmr/acks holds project-scoped acks. Optional: when
   * omitted, project-scope acks are disabled entirely (lookup/listAll ignore
   * them and add(..,'project') throws). Callers reviewing an untrusted working
   * tree should omit it unless the project acks are explicitly trusted.
   */
  projectRoot?: string
  userHome: string
}

/**
 * Build an AckStore for a review run. User-scope acks (~/.mmr/acks) are always
 * loaded (they live on the operator's own machine). Project-scope acks live in
 * the reviewed tree, which may be untrusted (a PR checkout in CI), so they are
 * loaded only when explicitly trusted — otherwise an attacker could commit
 * `.mmr/acks/<sha>.json` to self-suppress their own findings. The full trusted
 * path (loading project acks from a git base ref) is added by the trust-mode
 * thread; until then this gates project acks behind trust_project_acks.
 */
export function buildReviewAckStore(opts: { trustProjectAcks: boolean; cwd: string; home: string }): AckStore {
  return new AckStore({
    projectRoot: opts.trustProjectAcks ? opts.cwd : undefined,
    userHome: opts.home,
  })
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
  byLocation: Map<string, AckRecord[]>
}

export class AckStore {
  private readonly projectDir: string | undefined
  private readonly userDir: string
  private readonly projectRootResolved: string | undefined
  private readonly userHomeResolved: string
  // Per-instance lazy cache so a review that calls lookup() once per finding
  // reads each acks dir from disk at most once (avoids O(N*M) FS operations).
  private readonly loaded: Partial<Record<AckScope, LoadedScope>> = {}

  constructor(opts: AckStoreOptions) {
    this.projectRootResolved = opts.projectRoot === undefined ? undefined : path.resolve(opts.projectRoot)
    this.userHomeResolved = path.resolve(opts.userHome)
    this.projectDir = this.projectRootResolved === undefined
      ? undefined
      : path.join(this.projectRootResolved, '.mmr', 'acks')
    this.userDir = path.join(this.userHomeResolved, '.mmr', 'acks')
  }

  private validateKey(key: string): void {
    if (!FINDING_KEY_RE.test(key)) {
      throw new Error(`Invalid finding_key: ${key} — must match ^[a-f0-9]{40}$`)
    }
  }

  /**
   * Returns the acks dir for a scope after verifying it does not escape its
   * root via a symlinked ancestor. A leaf-only symlink check is not enough:
   * project acks live in the untrusted reviewed tree, where `.mmr` or
   * `.mmr/acks` could itself be a symlink redirecting every mkdir/read/write/
   * unlink out of the sandbox. We realpath the deepest existing ancestor of
   * the acks dir and require it to stay within the (realpath'd) root.
   */
  private dirForScope(scope: AckScope): string {
    const dir = scope === 'project' ? this.projectDir : this.userDir
    const root = scope === 'project' ? this.projectRootResolved : this.userHomeResolved
    if (dir === undefined || root === undefined) {
      throw new Error('project-scope acks are disabled (no project root configured)')
    }
    let realRoot: string
    try {
      realRoot = fs.realpathSync(root)
    } catch {
      realRoot = root // root not resolvable (unusual env) → fall back to lexical
    }
    let probe = dir
    while (probe !== path.dirname(probe) && !fs.existsSync(probe)) probe = path.dirname(probe)
    let realProbe: string
    try {
      realProbe = fs.realpathSync(probe)
    } catch {
      return dir // nothing exists to escape into yet
    }
    const rel = path.relative(realRoot, realProbe)
    if (rel !== '' && (rel.startsWith('..') || path.isAbsolute(rel))) {
      throw new Error(`ack ${scope} directory escapes its root via a symlinked ancestor: ${dir}`)
    }
    return dir
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
    const key = record.finding_key
    this.validateKey(key)
    // Enforce the full shape on write so every persisted record is guaranteed
    // loadable; otherwise an invalid record could be written then silently
    // dropped by the load-side integrity check (write/read asymmetry).
    if (!isValidAckRecord(record, key)) {
      throw new Error(`Invalid ack record for ${key}: missing or mistyped fields`)
    }
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
    // Atomic write: write to a fresh temp then rename. The temp name uses a
    // random suffix and the 'wx' (O_CREAT|O_EXCL) flag, which fails if the path
    // already exists — including a pre-planted symlink — closing the TOCTOU on
    // the temp path. rename() replaces fp's directory entry without following a
    // symlink target, so readers never observe a partial record.
    const tmp = `${fp}.${crypto.randomBytes(6).toString('hex')}.tmp`
    try {
      fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { flag: 'wx' })
      fs.renameSync(tmp, fp)
    } catch (err) {
      // Clean up a partial/leftover temp on any failure (write or rename).
      try {
        fs.rmSync(tmp, { force: true })
      } catch {
        // ignore cleanup failure; surface the original error
      }
      throw err
    }
    this.loaded[scope] = undefined
  }

  remove(key: string, scope: AckScope): void {
    this.validateKey(key)
    const fp = this.filePath(key, scope)
    // Unlink directly and tolerate ENOENT rather than existsSync-then-unlink
    // (which has a TOCTOU window if the file is removed concurrently).
    try {
      fs.unlinkSync(fp)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    this.loaded[scope] = undefined
  }

  private readDir(dir: string): AckRecord[] {
    let entries: string[]
    try {
      if (!fs.existsSync(dir)) return []
      entries = fs.readdirSync(dir)
    } catch {
      return [] // transient FS error (ENOENT/ENOTDIR/race) → treat as no acks
    }
    const out: AckRecord[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const keyOnly = entry.replace(/\.json$/, '')
      if (!FINDING_KEY_RE.test(keyOnly)) continue
      const fp = path.join(dir, entry)
      let st: fs.Stats
      try {
        st = fs.lstatSync(fp)
      } catch {
        continue
      }
      // Skip symlinks and oversized/non-regular files before reading. Project
      // acks live in the untrusted reviewed tree, so a planted symlink could
      // point readFileSync at a huge or sensitive target (DoS / disclosure) —
      // mirror the write-side symlink hardening on the read path.
      if (st.isSymbolicLink() || !st.isFile() || st.size > MAX_ACK_BYTES) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(fs.readFileSync(fp, 'utf-8'))
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
      // A disabled project scope (no project root) contributes no records.
      const dir = scope === 'project' ? this.projectDir : this.userDir
      const records = dir === undefined ? [] : this.readDir(this.dirForScope(scope))
      const byKey = new Map<string, AckRecord>()
      const byLocation = new Map<string, AckRecord[]>()
      for (const r of records) {
        byKey.set(r.finding_key, r)
        const bucket = byLocation.get(r.normalized_location)
        if (bucket) bucket.push(r)
        else byLocation.set(r.normalized_location, [r])
      }
      cached = { records, byKey, byLocation }
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
    // Use the per-location index so only same-location acks (usually 0–1) are
    // scored, not every record. Project scope wins over user.
    if (finding.shingle.length === 0) return undefined
    const projectFuzzy = this.fuzzyScan(project, finding)
    if (projectFuzzy) return { record: projectFuzzy, match: 'fuzzy', scope: 'project' }
    const userFuzzy = this.fuzzyScan(user, finding)
    if (userFuzzy) return { record: userFuzzy, match: 'fuzzy', scope: 'user' }
    return undefined
  }

  private fuzzyScan(
    scope: LoadedScope,
    finding: { normalized_location: string; shingle: string[] },
  ): AckRecord | undefined {
    const candidates = scope.byLocation.get(finding.normalized_location)
    if (!candidates) return undefined
    for (const r of candidates) {
      if (jaccardSimilarity(r.description_shingle, finding.shingle) >= FUZZY_THRESHOLD) return r
    }
    return undefined
  }
}
