// src/tia/affected.test.ts
import { describe, expect, it } from 'vitest'
import { TIA_MAX_COMMIT_DISTANCE, selectAffected } from './affected.js'
import type { TiaMap } from './map.js'

const AT = '2026-07-19T12:00:00.000Z'

function mkMap(over: Partial<TiaMap> = {}): TiaMap {
  return {
    version: 1, head_sha: 'H', recorded_at: AT, instrumented_seconds: 10,
    file_hashes: {
      'src/a.ts': 'hash-a', 'src/b.ts': 'hash-b',
      'src/a.test.ts': 'hash-at', 'src/b.test.ts': 'hash-bt',
    },
    tests: {
      'src/a.test.ts': ['src/a.ts'],
      'src/b.test.ts': ['src/b.ts'],
    },
    ...over,
  }
}

/** hashOf faking current disk state: everything matches the map by default;
 *  overrides simulate edits (new hash) or deletions (null). */
function hashOf(map: TiaMap, changed: Record<string, string | null> = {}) {
  return (rel: string): string | null => {
    if (rel in changed) return changed[rel]
    return map.file_hashes[rel] ?? null
  }
}

describe('selectAffected — full-suite fallbacks', () => {
  const map = mkMap()

  it('empty diff cannot be classified', () => {
    const s = selectAffected({ map, changedFiles: [], commitDistance: 0, hashOf: hashOf(map) })
    expect(s).toMatchObject({ verdict: 'full', confidence: 'low' })
    expect(s.tests).toEqual([])
  })

  it('infra changes force the full suite', () => {
    for (const f of [
      'package-lock.json', '.github/workflows/ci.yml', 'migrations/001.sql',
      'vitest.config.ts', 'Makefile', 'packages/x/package.json',
    ]) {
      const s = selectAffected({ map, changedFiles: [f], commitDistance: 0, hashOf: hashOf(map) })
      expect(s.verdict).toBe('full')
      expect(s.reason).toContain('infra')
    }
  })

  it('nested infra changes in a monorepo also force the full suite (deferred reviewer note)', () => {
    for (const f of [
      'packages/app/package-lock.json',
      'packages/app/pnpm-lock.yaml',
      'apps/web/yarn.lock',
      'packages/api/pyproject.toml',
      'packages/api/uv.lock',
      'crates/core/Cargo.toml',
      'crates/core/Cargo.lock',
      'services/go-svc/go.mod',
      'services/go-svc/go.sum',
      'packages/app/Makefile',
      'packages/app/tsconfig.json',
      'packages/app/tsconfig.build.json',
      'packages/app/.swcrc',
      'packages/app/vitest.config.ts',
      'packages/app/vite.config.ts',
      'packages/app/playwright.config.ts',
      'packages/app/turbo.json',
      'packages/api/pytest.ini',
      'packages/api/conftest.py',
      'packages/app/.env.local',
      'packages/api/migrations/002.sql',
      'packages/api/src/test-utils/helpers.ts',
    ]) {
      const s = selectAffected({ map, changedFiles: [f], commitDistance: 0, hashOf: hashOf(map) })
      expect(s.verdict, `expected ${f} to force full`).toBe('full')
      expect(s.reason).toContain('infra')
    }
  })

  it('no map / unknown map head / excessive commit distance are stale', () => {
    expect(selectAffected({
      map: null, changedFiles: ['src/a.ts'], commitDistance: 0, hashOf: () => null,
    }).verdict).toBe('full')
    expect(selectAffected({
      map, changedFiles: ['src/a.ts'], commitDistance: null, hashOf: hashOf(map),
    }).verdict).toBe('full')
    expect(selectAffected({
      map, changedFiles: ['src/a.ts'],
      commitDistance: TIA_MAX_COMMIT_DISTANCE + 1, hashOf: hashOf(map),
    }).verdict).toBe('full')
  })

  it('a corrupt/empty map (no file_hashes recorded) fails closed', () => {
    const s = selectAffected({
      map: mkMap({ file_hashes: {} }), changedFiles: ['src/a.ts'], commitDistance: 0,
      hashOf: () => null,
    })
    expect(s.verdict).toBe('full')
    expect(s.confidence).toBe('low')
  })

  it('a high hash-miss ratio OUTSIDE the diff means the map is stale', () => {
    // The diff's own files are expected to drift — only unexplained drift counts.
    const s = selectAffected({
      map, changedFiles: ['src/a.ts'], commitDistance: 0,
      hashOf: hashOf(map, {
        'src/a.ts': 'edited',                       // expected (it changed)
        'src/b.ts': 'drifted', 'src/b.test.ts': 'drifted', // 2/3 unexplained > 0.2
      }),
    })
    expect(s.verdict).toBe('full')
    expect(s.reason).toContain('hash-miss')
  })

  it('a changed source with no coverage evidence fails closed', () => {
    const s = selectAffected({
      map, changedFiles: ['src/never-imported.ts'], commitDistance: 0, hashOf: hashOf(map),
    })
    expect(s.verdict).toBe('full')
    expect(s.reason).toContain('no coverage evidence')
  })
})

describe('selectAffected — selection and ordering', () => {
  it('selects covering tests plus convention siblings, high confidence', () => {
    const map = mkMap()
    const s = selectAffected({
      map, changedFiles: ['src/a.ts'], commitDistance: 3,
      hashOf: hashOf(map, { 'src/a.ts': 'edited' }),
    })
    expect(s).toMatchObject({ verdict: 'selected', confidence: 'high' })
    expect(s.tests).toEqual(['src/a.test.ts'])
  })

  it('a changed test file selects itself; a fully-deleted selection falls back to full', () => {
    const map = mkMap()
    const s = selectAffected({
      map, changedFiles: ['src/b.test.ts'], commitDistance: 0,
      hashOf: hashOf(map, { 'src/b.test.ts': 'edited' }),
    })
    expect(s.tests).toEqual(['src/b.test.ts'])
    const gone = selectAffected({
      map, changedFiles: ['src/b.test.ts'], commitDistance: 0,
      hashOf: hashOf(map, { 'src/b.test.ts': null }), // the test file was deleted
    })
    expect(gone.verdict).toBe('full')
  })

  it('orders most-likely-to-fail-first: flake count, then diff-churn overlap', () => {
    const map = mkMap({
      tests: {
        'src/a.test.ts': ['src/a.ts'],
        'src/b.test.ts': ['src/b.ts'],
        'src/wide.test.ts': ['src/a.ts', 'src/b.ts'],
      },
      file_hashes: {
        'src/a.ts': 'hash-a', 'src/b.ts': 'hash-b',
        'src/a.test.ts': 'hash-at', 'src/b.test.ts': 'hash-bt', 'src/wide.test.ts': 'hash-wt',
      },
    })
    const s = selectAffected({
      map, changedFiles: ['src/a.ts', 'src/b.ts'], commitDistance: 0,
      hashOf: hashOf(map, { 'src/a.ts': 'e', 'src/b.ts': 'e' }),
      flakeCounts: new Map([['src/b.test.ts', 2]]),
    })
    // flakiest first, then the test covering MORE of the diff, then lexicographic
    expect(s.tests).toEqual(['src/b.test.ts', 'src/wide.test.ts', 'src/a.test.ts'])
  })
})
