// src/tia/map.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildTiaMap, isTestPath, readTiaMap, writeTiaMap } from './map.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'tia-map-')) }

const AT = '2026-07-19T12:00:00.000Z'

function writeDump(
  dir: string, name: string, projectRoot: string, rels: string[], extras: string[] = [],
): void {
  const urls = [
    ...rels.map(r => pathToFileURL(path.join(projectRoot, r)).href),
    ...extras,
  ]
  fs.writeFileSync(path.join(dir, name), JSON.stringify({ result: urls.map(url => ({ url })) }))
}

describe('isTestPath', () => {
  it('recognizes the built-in test-file conventions', () => {
    expect(isTestPath('src/foo.test.ts')).toBe(true)
    expect(isTestPath('src/foo.spec.tsx')).toBe(true)
    expect(isTestPath('tests/e2e.bats')).toBe(true)
    expect(isTestPath('test/unit.py')).toBe(true)
    expect(isTestPath('src/foo.ts')).toBe(false)
    expect(isTestPath('contest/foo.ts')).toBe(false)
  })
})

describe('buildTiaMap', () => {
  it('attributes each dump to its test files and hashes referenced content', () => {
    const root = tmp()
    const cov = path.join(root, 'cov')
    fs.mkdirSync(cov)
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(root, 'src/a.test.ts'), 'import "./a"\n')
    writeDump(cov, 'coverage-1.json', root, ['src/a.test.ts', 'src/a.ts'], [
      pathToFileURL(path.join(root, 'node_modules/x/index.js')).href,
      'node:internal/modules',
      'https://example.invalid/x.js',
    ])
    const map = buildTiaMap({ coverageDir: cov, projectRoot: root, headSha: 'H', seconds: 30, now: AT })
    expect(map.tests).toEqual({ 'src/a.test.ts': ['src/a.ts'] })
    expect(Object.keys(map.file_hashes).sort()).toEqual(['src/a.test.ts', 'src/a.ts'])
    expect(map.file_hashes['src/a.ts']).toMatch(/^[0-9a-f]{64}$/)
    expect(map.head_sha).toBe('H')
    expect(map.instrumented_seconds).toBe(30)
  })

  it('unions sources across dumps that share a test file', () => {
    const root = tmp()
    const cov = path.join(root, 'cov')
    fs.mkdirSync(cov)
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    for (const f of ['src/a.ts', 'src/b.ts', 'src/a.test.ts']) {
      fs.writeFileSync(path.join(root, f), `// ${f}\n`)
    }
    writeDump(cov, 'coverage-1.json', root, ['src/a.test.ts', 'src/a.ts'])
    writeDump(cov, 'coverage-2.json', root, ['src/a.test.ts', 'src/b.ts'])
    const map = buildTiaMap({ coverageDir: cov, projectRoot: root, headSha: 'H', seconds: 1, now: AT })
    expect(map.tests['src/a.test.ts']).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('tolerates torn or foreign dumps and a missing coverage dir', () => {
    const root = tmp()
    const cov = path.join(root, 'cov')
    fs.mkdirSync(cov)
    fs.writeFileSync(path.join(cov, 'coverage-bad.json'), '{torn')
    expect(buildTiaMap({
      coverageDir: cov, projectRoot: root, headSha: 'H', seconds: 1, now: AT,
    }).tests).toEqual({})
    expect(buildTiaMap({
      coverageDir: path.join(root, 'missing'), projectRoot: root, headSha: 'H', seconds: 1, now: AT,
    }).tests).toEqual({})
  })
})

describe('readTiaMap / writeTiaMap', () => {
  it('round-trips through .mq/tia/map.json and rejects corruption', () => {
    const mqDir = tmp()
    expect(readTiaMap(mqDir)).toBeNull()
    const map = {
      version: 1 as const, head_sha: 'H', recorded_at: AT, instrumented_seconds: 5,
      file_hashes: { 'src/a.ts': 'x' }, tests: { 'src/a.test.ts': ['src/a.ts'] },
    }
    writeTiaMap(mqDir, map)
    expect(readTiaMap(mqDir)).toEqual(map)
    fs.writeFileSync(path.join(mqDir, 'tia', 'map.json'), '{nope')
    expect(readTiaMap(mqDir)).toBeNull()
  })
})
