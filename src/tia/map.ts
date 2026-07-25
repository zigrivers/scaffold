// src/tia/map.ts — D14: testmon-style test→files coverage map, built from
// NODE_V8_COVERAGE dumps of the poller's green full runs, keyed by content
// hashes so staleness is detectable without git archaeology.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TIA_DIR = 'tia'
export const TIA_MAP_FILE = 'map.json'
export const TIA_LAST_RECORDED_DAY_FILE = 'last-recorded-day'

export interface TiaMap {
  version: 1
  head_sha: string
  recorded_at: string
  instrumented_seconds: number
  /** repo-relative path -> sha256 of its content at record time */
  file_hashes: Record<string, string>
  /** test file (repo-relative) -> source files it executed */
  tests: Record<string, string[]>
}

/** Built-in convention for what counts as a test file. */
export function isTestPath(rel: string): boolean {
  if (/(^|\/)tests?\//.test(rel)) return true
  return /\.(test|spec)\.[^/]+$/.test(rel)
}

export function tiaMapPath(mqDir: string): string {
  return path.join(mqDir, TIA_DIR, TIA_MAP_FILE)
}

export function readTiaMap(mqDir: string): TiaMap | null {
  const file = tiaMapPath(mqDir)
  if (!fs.existsSync(file)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as TiaMap
    if (raw.version !== 1 || typeof raw.tests !== 'object' || raw.tests === null ||
        typeof raw.file_hashes !== 'object' || raw.file_hashes === null) {
      return null
    }
    return raw
  } catch {
    return null // a corrupt map is no map — selection falls back to the full suite
  }
}

export function writeTiaMap(mqDir: string, map: TiaMap): void {
  const file = tiaMapPath(mqDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

export function hashContent(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/** Parse NODE_V8_COVERAGE dumps. Attribution model: vitest/jest with an
 *  isolating pool run each test FILE in its own process, so each per-process
 *  dump containing test file T maps T to every project source the process
 *  loaded. Coarser pools (many test files per process) degrade to
 *  OVER-selection — never under-selection. */
export function buildTiaMap(opts: {
  coverageDir: string
  projectRoot: string
  headSha: string
  seconds: number
  now: string
}): TiaMap {
  const tests: Record<string, Set<string>> = {}
  const referenced = new Set<string>()
  const dumps = fs.existsSync(opts.coverageDir)
    ? fs.readdirSync(opts.coverageDir).filter(f => f.endsWith('.json'))
    : []
  for (const dump of dumps) {
    let urls: string[] = []
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(opts.coverageDir, dump), 'utf8'),
      ) as { result?: { url?: string }[] }
      urls = (raw.result ?? []).map(r => r.url ?? '')
    } catch {
      continue // a torn/foreign dump never poisons the map
    }
    const rels: string[] = []
    for (const url of urls) {
      if (!url.startsWith('file://')) continue
      let abs: string
      try { abs = fileURLToPath(url) } catch { continue }
      const rel = path.relative(opts.projectRoot, abs)
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue
      if (rel.split(path.sep).includes('node_modules')) continue
      rels.push(rel.split(path.sep).join('/'))
    }
    const testFiles = rels.filter(isTestPath)
    const sources = rels.filter(r => !isTestPath(r))
    for (const t of testFiles) {
      tests[t] ??= new Set()
      referenced.add(t)
      for (const s of sources) {
        tests[t].add(s)
        referenced.add(s)
      }
    }
  }
  const file_hashes: Record<string, string> = {}
  for (const rel of [...referenced].sort()) {
    const abs = path.join(opts.projectRoot, rel)
    if (fs.existsSync(abs)) file_hashes[rel] = hashContent(fs.readFileSync(abs))
  }
  return {
    version: 1,
    head_sha: opts.headSha,
    recorded_at: opts.now,
    instrumented_seconds: opts.seconds,
    file_hashes,
    tests: Object.fromEntries(
      Object.entries(tests).map(([t, s]) => [t, [...s].sort()]),
    ),
  }
}
