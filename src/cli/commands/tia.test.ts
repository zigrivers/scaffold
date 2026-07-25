// src/cli/commands/tia.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { tiaHandler } from './tia.js'
import { recordFlake } from '../../merge-queue/flakes.js'
import { readJournal } from '../../merge-queue/journal.js'
import * as tiaMapModule from '../../tia/map.js'
import { hashContent, writeTiaMap } from '../../tia/map.js'

function scratchRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tia-cli-'))
  execFileSync('git', ['init', '-b', 'main', dir])
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't'])
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t.invalid'])
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src/a.ts'), 'export const a = 1\n')
  fs.writeFileSync(path.join(dir, 'src/a.test.ts'), 'import "./a"\n')
  execFileSync('git', ['-C', dir, 'add', '.'])
  execFileSync('git', ['-C', dir, 'commit', '-m', 'base'])
  return dir
}

function mapFor(root: string, headSha: string) {
  return {
    version: 1 as const,
    head_sha: headSha,
    recorded_at: new Date().toISOString(),
    instrumented_seconds: 5,
    file_hashes: {
      'src/a.ts': hashContent(fs.readFileSync(path.join(root, 'src/a.ts'))),
      'src/a.test.ts': hashContent(fs.readFileSync(path.join(root, 'src/a.test.ts'))),
    },
    tests: { 'src/a.test.ts': ['src/a.ts'] },
  }
}

function branchEdit(root: string): void {
  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'feat'])
  fs.appendFileSync(path.join(root, 'src/a.ts'), '// edit\n')
  execFileSync('git', ['-C', root, 'commit', '-qam', 'edit'])
}

/** Like scratchRepo, but with TWO test files ('m' and 'z') covering the same
 *  source file — used to prove flake-count ordering without any other signal
 *  (churn) breaking the tie between them. */
function scratchRepoTwoTests(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tia-cli-'))
  execFileSync('git', ['init', '-b', 'main', dir])
  execFileSync('git', ['-C', dir, 'config', 'user.name', 't'])
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t.invalid'])
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src/a.ts'), 'export const a = 1\n')
  fs.writeFileSync(path.join(dir, 'src/m.test.ts'), 'import "./a"\n')
  fs.writeFileSync(path.join(dir, 'src/z.test.ts'), 'import "./a"\n')
  execFileSync('git', ['-C', dir, 'add', '.'])
  execFileSync('git', ['-C', dir, 'commit', '-m', 'base'])
  return dir
}

function mapForTwoTests(root: string, headSha: string) {
  return {
    version: 1 as const,
    head_sha: headSha,
    recorded_at: new Date().toISOString(),
    instrumented_seconds: 5,
    file_hashes: {
      'src/a.ts': hashContent(fs.readFileSync(path.join(root, 'src/a.ts'))),
      'src/m.test.ts': hashContent(fs.readFileSync(path.join(root, 'src/m.test.ts'))),
      'src/z.test.ts': hashContent(fs.readFileSync(path.join(root, 'src/z.test.ts'))),
    },
    // 'src/m.test.ts' and 'src/z.test.ts' both cover 'src/a.ts' — equal churn,
    // so absent a flake boost the sort falls through to plain alphabetical
    // order (m before z).
    tests: { 'src/m.test.ts': ['src/a.ts'], 'src/z.test.ts': ['src/a.ts'] },
  }
}

/** Diverges the map's head from HEAD: the map is recorded on a sibling branch
 *  ("record") that shares only the base commit with "feat" — so `git rev-list
 *  --count mapHead..HEAD` alone would report a deceptively small distance
 *  (just the tip commit unique to "feat") even though mapHead is NOT an
 *  ancestor of HEAD and never described this branch's history. Returns the
 *  map head sha recorded on "record"; the repo is left checked out on "feat".
 */
function divergentBranch(root: string): string {
  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'record'])
  fs.appendFileSync(path.join(root, 'src/a.ts'), '// record edit\n')
  execFileSync('git', ['-C', root, 'commit', '-qam', 'record edit'])
  const mapHeadSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  execFileSync('git', ['-C', root, 'checkout', '-q', 'main'])
  execFileSync('git', ['-C', root, 'checkout', '-q', '-b', 'feat'])
  fs.appendFileSync(path.join(root, 'src/a.ts'), '// feat edit\n')
  execFileSync('git', ['-C', root, 'commit', '-qam', 'feat edit'])
  return mapHeadSha
}

afterEach(() => { process.exitCode = 0 })

describe('scaffold tia affected', () => {
  it('emits the selected tests on stdout and exits 0', async () => {
    const root = scratchRepo()
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeTiaMap(path.join(root, '.mq'), mapFor(root, head))
    branchEdit(root)
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write')
      .mockImplementation((s: unknown) => { writes.push(String(s)); return true })
    try {
      await tiaHandler({ action: 'affected', base: 'main', root })
    } finally {
      spy.mockRestore()
    }
    expect(process.exitCode ?? 0).toBe(0)
    expect(writes.join('')).toContain('src/a.test.ts')
  })

  it('exits 3 when there is no map (full-suite fallback)', async () => {
    const root = scratchRepo()
    branchEdit(root)
    await tiaHandler({ action: 'affected', base: 'main', root })
    expect(process.exitCode).toBe(3)
  })

  it('exits 3 on an unresolvable base ref', async () => {
    const root = scratchRepo()
    await tiaHandler({ action: 'affected', base: 'origin/does-not-exist', root })
    expect(process.exitCode).toBe(3)
  })

  it('requires --base', async () => {
    const root = scratchRepo()
    await tiaHandler({ action: 'affected', root })
    expect(process.exitCode).toBe(1)
  })

  it('exits 3 (full suite) when the recorded map head is not an ancestor of HEAD ' +
    '(divergent branch — regression for the PR #783 review note)', async () => {
    const root = scratchRepo()
    const mapHeadSha = divergentBranch(root)
    writeTiaMap(path.join(root, '.mq'), mapFor(root, mapHeadSha))
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write')
      .mockImplementation((s: unknown) => { writes.push(String(s)); return true })
    try {
      await tiaHandler({ action: 'affected', base: 'main', root })
    } finally {
      spy.mockRestore()
    }
    // Must fail closed to the full suite — never emit a narrow selection built
    // from a map that describes a different branch's history.
    expect(process.exitCode).toBe(3)
    expect(writes.join('')).toBe('')
  })

  it('a flake event older than the 7-day recency window does not boost ordering', async () => {
    const root = scratchRepoTwoTests()
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeTiaMap(path.join(root, '.mq'), mapForTwoTests(root, head))
    branchEdit(root)
    const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    recordFlake(path.join(root, '.mq'), 'src/z.test.ts', stale)
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write')
      .mockImplementation((s: unknown) => { writes.push(String(s)); return true })
    try {
      await tiaHandler({ action: 'affected', base: 'main', root })
    } finally {
      spy.mockRestore()
    }
    expect(process.exitCode ?? 0).toBe(0)
    // Stale flake is outside the window and must not count — falls through
    // to the alphabetical tie-break (m before z).
    expect(writes.join('').trim().split('\n')).toEqual(['src/m.test.ts', 'src/z.test.ts'])
  })

  it('a recent flake event boosts a test to the front of the ordering', async () => {
    const root = scratchRepoTwoTests()
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeTiaMap(path.join(root, '.mq'), mapForTwoTests(root, head))
    branchEdit(root)
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    recordFlake(path.join(root, '.mq'), 'src/z.test.ts', recent)
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write')
      .mockImplementation((s: unknown) => { writes.push(String(s)); return true })
    try {
      await tiaHandler({ action: 'affected', base: 'main', root })
    } finally {
      spy.mockRestore()
    }
    expect(process.exitCode ?? 0).toBe(0)
    // Recent flake on z outranks the alphabetical tie-break — z sorts first.
    expect(writes.join('').trim().split('\n')).toEqual(['src/z.test.ts', 'src/m.test.ts'])
  })
})

describe('scaffold tia record-due', () => {
  it('scheduled: due when never recorded, not due twice the same day, off disables', async () => {
    const root = scratchRepo()
    await tiaHandler({ action: 'record-due', root })
    expect(process.exitCode ?? 0).toBe(0)
    fs.mkdirSync(path.join(root, '.mq', 'tia'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.mq', 'tia', 'last-recorded-day'),
      new Date().toISOString().slice(0, 10) + '\n',
    )
    process.exitCode = 0
    await tiaHandler({ action: 'record-due', root })
    expect(process.exitCode).toBe(1)
    fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.scaffold', 'agent-ops.yaml'),
      'project_name: t\nmerge_queue:\n  tia:\n    record: "off"\n',
    )
    process.exitCode = 0
    await tiaHandler({ action: 'record-due', root })
    expect(process.exitCode).toBe(1)
  })

  it('always: due even when already recorded today', async () => {
    const root = scratchRepo()
    fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.scaffold', 'agent-ops.yaml'),
      'project_name: t\nmerge_queue:\n  tia:\n    record: always\n',
    )
    fs.mkdirSync(path.join(root, '.mq', 'tia'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.mq', 'tia', 'last-recorded-day'),
      new Date().toISOString().slice(0, 10) + '\n',
    )
    await tiaHandler({ action: 'record-due', root })
    expect(process.exitCode ?? 0).toBe(0)
  })
})

describe('scaffold tia ingest', () => {
  it('builds the map, journals tia_recorded, stamps the day marker, clears the dumps', async () => {
    const root = scratchRepo()
    // The dump dir is the poller-created .mq/tia/v8 workspace (ingest confines
    // the recursive remove to a strict descendant of .mq/tia/).
    const cov = path.join(root, '.mq', 'tia', 'v8')
    fs.mkdirSync(cov, { recursive: true })
    fs.writeFileSync(path.join(cov, 'coverage-1.json'), JSON.stringify({
      result: [
        { url: pathToFileURL(path.join(root, 'src/a.test.ts')).href },
        { url: pathToFileURL(path.join(root, 'src/a.ts')).href },
      ],
    }))
    await tiaHandler({ action: 'ingest', coverageDir: cov, head: 'HEADSHA', seconds: 77, root })
    const mqDir = path.join(root, '.mq')
    const map = JSON.parse(
      fs.readFileSync(path.join(mqDir, 'tia', 'map.json'), 'utf8'),
    ) as { tests: Record<string, string[]> }
    expect(map.tests).toEqual({ 'src/a.test.ts': ['src/a.ts'] })
    const events = readJournal(mqDir)
    expect(events[0]).toMatchObject({
      type: 'tia_recorded', headSha: 'HEADSHA', seconds: 77, tests: 1,
    })
    expect(fs.readFileSync(path.join(mqDir, 'tia', 'last-recorded-day'), 'utf8').trim())
      .toBe(new Date().toISOString().slice(0, 10))
    expect(fs.existsSync(cov)).toBe(false)
  })

  it('removes the dump dir and exits non-zero when writing the map throws mid-ingest', async () => {
    const root = scratchRepo()
    const cov = path.join(root, '.mq', 'tia', 'v8')
    fs.mkdirSync(cov, { recursive: true })
    fs.writeFileSync(path.join(cov, 'coverage-1.json'), JSON.stringify({
      result: [
        { url: pathToFileURL(path.join(root, 'src/a.test.ts')).href },
        { url: pathToFileURL(path.join(root, 'src/a.ts')).href },
      ],
    }))
    const spy = vi.spyOn(tiaMapModule, 'writeTiaMap').mockImplementation(() => {
      throw new Error('boom: simulated write failure')
    })
    try {
      await tiaHandler({ action: 'ingest', coverageDir: cov, head: 'HEADSHA', seconds: 1, root })
    } finally {
      spy.mockRestore()
    }
    expect(process.exitCode).toBe(1)
    // The dump dir must still be cleaned up even though ingest failed —
    // otherwise every failed ingest leaks a NODE_V8_COVERAGE dump directory.
    expect(fs.existsSync(cov)).toBe(false)
    // Nothing was journaled — the failure happened before appendEvent ran.
    expect(readJournal(path.join(root, '.mq')).some(e => e.type === 'tia_recorded')).toBe(false)
  })

  // Path-safety: `tia ingest` fs.rmSync(recursive) must NEVER escape
  // <primary>/.mq/tia/. Each hostile input must be refused (exit 1) AND leave
  // the target on disk. `os` is imported at the top of the file.
  it.each<[string, (root: string) => string]>([
    ['an absolute path outside the workspace', () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tia-outside-'))
      fs.writeFileSync(path.join(outside, 'keep.txt'), 'x')
      return outside
    }],
    ['a `..` traversal escaping to the project root', (root) => path.join(root, '.mq', 'tia', '..', '..')],
    ['the project root itself', (root) => root],
    ['the .mq/tia dir itself (would nuke the map)', (root) => path.join(root, '.mq', 'tia')],
    ['a home-dir-style absolute path (stand-in for $HOME)', () => {
      const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tia-home-'))
      fs.writeFileSync(path.join(fakeHome, '.bashrc'), 'x')
      return fakeHome
    }],
    ['a symlink whose target escapes the workspace', (root) => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tia-symlink-'))
      fs.writeFileSync(path.join(outside, 'keep.txt'), 'x')
      const link = path.join(root, '.mq', 'tia', 'escape')
      fs.mkdirSync(path.dirname(link), { recursive: true })
      fs.symlinkSync(outside, link)
      return link
    }],
  ])('refuses %s and removes nothing', async (_label, make) => {
    const root = scratchRepo()
    const target = make(root)
    await tiaHandler({ action: 'ingest', coverageDir: target, head: 'HEADSHA', seconds: 1, root })
    expect(process.exitCode ?? 0).toBe(1)
    // Assert survival AFTER the handler (it mkdir's .mq/tia). For a symlink,
    // assert the escape TARGET survives (the link resolves to it).
    const survives = fs.lstatSync(target).isSymbolicLink() ? fs.realpathSync(target) : target
    expect(fs.existsSync(survives)).toBe(true)   // the hostile target was NOT removed
    process.exitCode = 0
  })
})
