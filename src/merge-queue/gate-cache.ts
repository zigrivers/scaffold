// src/merge-queue/gate-cache.ts — D12: green-only gate-result cache, keyed by
// tree hashes plus every input that selects or scopes tests (spec D12).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const GATE_CACHE_FILE = 'gate-cache.json'

export interface GateCacheEntry {
  key: string
  /** Wall-clock seconds the original green run took (reported as savings on a hit). */
  seconds: number
  at: string
}

interface GateCacheFileShape {
  version: 1
  entries: GateCacheEntry[]
}

/** sha256 of the file's bytes, or "<label>:none" when it does not exist — an
 *  absent quarantine list / TIA map is a stable, distinct key component. */
export function hashFileOrAbsent(file: string, label: string): string {
  try {
    if (!fs.existsSync(file)) return `${label}:none`
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  } catch {
    // Unreadable (permissions), a directory at the path, or vanished mid-read —
    // treat as absent so computing a cache key can never crash the daemon cycle.
    // Fail-safe: a present↔absent transition changes the key (a miss), never a
    // false hit.
    return `${label}:none`
  }
}

/** Canonicalize fields so no field's content can shift a boundary with its
 *  neighbor (e.g. a field containing '\n' colliding with the old bare-join
 *  scheme). Each field is length-prefixed with its UTF-8 byte length before
 *  concatenation, which makes the encoding unambiguous regardless of field
 *  content. */
function keyOf(fields: string[]): string {
  const canonical = fields.map(f => `${Buffer.byteLength(f, 'utf8')}:${f}`).join('')
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

/** Affected-gate key — covers EVERY input that selects or scopes tests: the
 *  candidate tree, the base tree (affected-selection diffs against
 *  MQ_AFFECTED_BASE), the gate command string, the quarantine file content, and
 *  the TIA map content (when a map exists it changes which tests run). */
export function affectedGateKey(parts: {
  candidateTree: string
  baseTree: string
  command: string
  quarantineHash: string
  tiaMapHash: string
}): string {
  return keyOf([
    'affected', parts.candidateTree, parts.baseTree, parts.command,
    parts.quarantineHash, parts.tiaMapHash,
  ])
}

/** Full-gate key — selection inputs do not apply: tree + command + quarantine. */
export function fullGateKey(parts: {
  tree: string
  command: string
  quarantineHash: string
}): string {
  return keyOf(['full', parts.tree, parts.command, parts.quarantineHash])
}

function readCache(mqDir: string): GateCacheFileShape {
  const file = path.join(mqDir, GATE_CACHE_FILE)
  if (!fs.existsSync(file)) return { version: 1, entries: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as GateCacheFileShape
    if (raw.version !== 1 || !Array.isArray(raw.entries)) return { version: 1, entries: [] }
    return raw
  } catch {
    return { version: 1, entries: [] } // a corrupt cache is an empty cache, never fatal
  }
}

export function lookupGateCache(mqDir: string, key: string): GateCacheEntry | null {
  return readCache(mqDir).entries.find(e => e.key === key) ?? null
}

/** Record a GREEN result. Green-only is enforced by the API — red/timeout results
 *  have no entry point here. Size-capped: oldest entries beyond maxEntries are
 *  pruned; maxEntries <= 0 disables the cache. Atomic write (tmp + rename) so a
 *  concurrent daemon/poller writer never leaves a torn file; a lost write race
 *  drops one entry at worst (this is a cache, not a ledger). */
export function recordGateCache(
  mqDir: string,
  entry: GateCacheEntry,
  maxEntries: number,
): void {
  if (maxEntries <= 0) return
  fs.mkdirSync(mqDir, { recursive: true })
  const cache = readCache(mqDir)
  cache.entries = cache.entries.filter(e => e.key !== entry.key)
  cache.entries.push(entry)
  if (cache.entries.length > maxEntries) {
    cache.entries = cache.entries.slice(cache.entries.length - maxEntries)
  }
  const file = path.join(mqDir, GATE_CACHE_FILE)
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2) + '\n')
  fs.renameSync(tmp, file)
}
