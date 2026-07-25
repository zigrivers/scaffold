// src/tia/affected.ts — D14: layered TIA selection. Pure core — every git fact
// (changed files, commit distance, current content hashes) is injected; the CLI
// wrapper (src/cli/commands/tia.ts) gathers them. Fail-closed design: every
// path that cannot be explained by recorded evidence routes to the full suite.
import { minimatch } from 'minimatch'
import { isTestPath, type TiaMap } from './map.js'

export const TIA_MAX_COMMIT_DISTANCE = 50
export const TIA_MAX_HASH_MISS_RATIO = 0.2

/** Force-full triggers — mirrors the R2 gate script (`is_force_full` in
 *  content/assets/agent-ops/gate/gate-check-affected.sh.tmpl) and
 *  content/knowledge/core/test-impact-analysis.md. Keep the three lists in
 *  sync. The bash `case` glob's star spans the path separator (so its
 *  star-slash-prefixed alternatives already cover arbitrary nesting);
 *  minimatch's plain star does NOT span the separator, so every such bash
 *  alternative below needs an explicit globstar-prefixed sibling to match
 *  the same nested-monorepo paths (e.g. `packages/app/vitest.config.ts`). */
export const FORCE_FULL_GLOBS = [
  'package.json', '**/package.json',
  'package-lock.json', '**/package-lock.json',
  'pnpm-lock.yaml', '**/pnpm-lock.yaml',
  'yarn.lock', '**/yarn.lock',
  'pyproject.toml', '**/pyproject.toml',
  'uv.lock', '**/uv.lock',
  'Cargo.toml', '**/Cargo.toml',
  'Cargo.lock', '**/Cargo.lock',
  'go.mod', '**/go.mod',
  'go.sum', '**/go.sum',
  'Makefile', '**/Makefile',
  'tsconfig*.json', '**/tsconfig*.json',
  '.swcrc', '**/.swcrc',
  'vitest.config.*', '**/vitest.config.*',
  'vite.config.*', '**/vite.config.*',
  'playwright.config.*', '**/playwright.config.*',
  'turbo.json', '**/turbo.json',
  'pytest.ini', '**/pytest.ini',
  '.github/workflows/**',
  'scripts/gate-check.sh', 'scripts/gate-check-affected.sh',
  'src/test-utils/**', '**/src/test-utils/**',
  'conftest.py', '**/conftest.py',
  '.env*', '**/.env*',
  'migrations/**', '**/migrations/**',
  '**/*.sql', '**/*.proto',
]

export interface TiaSelection {
  verdict: 'selected' | 'full'
  confidence: 'high' | 'low'
  reason: string
  /** Selected test files, most-likely-to-fail-first. Empty when verdict=full. */
  tests: string[]
}

export function selectAffected(opts: {
  map: TiaMap | null
  changedFiles: string[]
  /** Commits between the map's head and HEAD; null = map head unknown to this repo. */
  commitDistance: number | null
  /** Current sha256 of a repo-relative file, or null when it does not exist. */
  hashOf: (rel: string) => string | null
  /** testId -> recent flake-event count (ordering signal); optional. */
  flakeCounts?: Map<string, number>
}): TiaSelection {
  const { map, changedFiles } = opts
  const full = (reason: string, confidence: 'high' | 'low' = 'high'): TiaSelection =>
    ({ verdict: 'full', confidence, reason, tests: [] })

  if (changedFiles.length === 0) return full('empty diff — cannot classify', 'low')
  for (const f of changedFiles) {
    if (FORCE_FULL_GLOBS.some(g => minimatch(f, g, { dot: true }))) {
      return full(`infra change: ${f}`)
    }
  }
  if (map === null) return full('no coverage map recorded yet', 'low')
  if (opts.commitDistance === null) return full('map head unknown to this repo (stale)', 'low')
  if (opts.commitDistance > TIA_MAX_COMMIT_DISTANCE) {
    return full(
      `map is ${opts.commitDistance} commits old (> ${TIA_MAX_COMMIT_DISTANCE})`, 'low',
    )
  }
  const hashedPaths = Object.keys(map.file_hashes)
  if (hashedPaths.length === 0) return full('coverage map is empty', 'low')
  // Hash-miss ratio: unexplained drift only. The current diff's own files are
  // EXPECTED to differ from the recorded hashes (that is what a diff is).
  const changedSet = new Set(changedFiles)
  let misses = 0
  let considered = 0
  for (const rel of hashedPaths) {
    if (changedSet.has(rel)) continue
    considered += 1
    if (opts.hashOf(rel) !== map.file_hashes[rel]) misses += 1
  }
  const missRatio = considered === 0 ? 0 : misses / considered
  if (missRatio > TIA_MAX_HASH_MISS_RATIO) {
    return full(
      `hash-miss ratio ${missRatio.toFixed(2)} exceeds ${TIA_MAX_HASH_MISS_RATIO} — map stale`,
      'low',
    )
  }

  const selected = new Set<string>()
  const churn = new Map<string, number>() // test -> DISTINCT changed files it covers
  for (const f of changedFiles) {
    if (isTestPath(f)) {
      if (opts.hashOf(f) !== null) selected.add(f) // a deleted test cannot run
      continue
    }
    // Collect this file's hits as a SET first so a test reached via both the
    // map and the sibling convention counts f's churn once, not twice.
    const hits = new Set<string>()
    let mapEdgeExists = false
    for (const [test, sources] of Object.entries(map.tests)) {
      if (sources.includes(f)) {
        mapEdgeExists = true
        if (opts.hashOf(test) !== null) hits.add(test)
      }
    }
    // Convention layer: src/foo.ts -> src/foo.test.ts sibling (covers brand-new
    // edges the recorded map cannot know about yet).
    const sibling = f.replace(/\.([^./]+)$/, '.test.$1')
    if (sibling !== f && opts.hashOf(sibling) !== null) {
      hits.add(sibling)
    }
    if (hits.size === 0) {
      // Gate on REAL, on-disk coverage — not merely a recorded edge. A map
      // entry (or the sibling convention) can point at a test that has since
      // been deleted, which would otherwise leave `hits` empty while still
      // "explaining" f, letting a co-changed file's non-empty selection mask
      // this file's true zero-coverage state past the global zero-selection
      // guard below (which only fires when the WHOLE result is empty). Fail
      // closed per-file instead, whether the edge was never recorded (unknown
      // edge) or was recorded but is now dangling (deleted covering test).
      const reason = mapEdgeExists
        ? `changed file's recorded covering test(s) no longer exist on disk: ${f}`
        : `no coverage evidence for changed file: ${f}`
      return full(reason, 'low')
    }
    for (const test of hits) {
      selected.add(test)
      churn.set(test, (churn.get(test) ?? 0) + 1)
    }
  }
  if (selected.size === 0) return full('selection is empty — refusing a zero-test gate', 'low')
  const flakes = opts.flakeCounts ?? new Map<string, number>()
  const tests = [...selected].sort((a, b) =>
    (flakes.get(b) ?? 0) - (flakes.get(a) ?? 0) ||
    (churn.get(b) ?? 0) - (churn.get(a) ?? 0) ||
    a.localeCompare(b))
  return {
    verdict: 'selected',
    confidence: 'high',
    reason: `selected ${tests.length} test file(s)`,
    tests,
  }
}
