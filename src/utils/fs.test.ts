import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import {
  atomicWriteFile, fileExists, ensureDir,
  getPackageSkillsDir, getPackageMethodologyDir, getPackagePipelineDir,
} from './fs.js'

const tmpFiles: string[] = []
const tmpDirs: string[] = []

function tmpPath(ext = '') {
  const p = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}${ext}`)
  tmpFiles.push(p)
  return p
}

function tmpDir() {
  const p = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}`)
  tmpDirs.push(p)
  return p
}

afterEach(() => {
  for (const f of tmpFiles) {
    try { fs.rmSync(f, { force: true }) } catch { /* ignore */ }
    try { fs.rmSync(f + '.tmp', { force: true }) } catch { /* ignore */ }
  }
  tmpFiles.length = 0
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

describe('atomicWriteFile', () => {
  it('creates file with correct content', () => {
    const p = tmpPath()
    atomicWriteFile(p, 'hello world')
    expect(fs.readFileSync(p, 'utf8')).toBe('hello world')
  })

  it('does not leave a .tmp file after successful write', () => {
    const p = tmpPath()
    atomicWriteFile(p, 'content')
    expect(fs.existsSync(p + '.tmp')).toBe(false)
  })

  it('overwrites an existing file', () => {
    const p = tmpPath()
    fs.writeFileSync(p, 'original', 'utf8')
    atomicWriteFile(p, 'updated')
    expect(fs.readFileSync(p, 'utf8')).toBe('updated')
  })
})

describe('fileExists', () => {
  it('returns true for an existing file', () => {
    const p = tmpPath()
    fs.writeFileSync(p, '', 'utf8')
    expect(fileExists(p)).toBe(true)
  })

  it('returns false for a non-existent path', () => {
    const p = tmpPath()
    expect(fileExists(p)).toBe(false)
  })

  it('returns true for an existing directory', () => {
    const d = tmpDir()
    fs.mkdirSync(d)
    expect(fileExists(d)).toBe(true)
  })
})

describe('ensureDir', () => {
  it('creates a directory when it does not exist', () => {
    const d = tmpDir()
    ensureDir(d)
    expect(fs.existsSync(d)).toBe(true)
    expect(fs.statSync(d).isDirectory()).toBe(true)
  })

  it('does not throw when directory already exists', () => {
    const d = tmpDir()
    fs.mkdirSync(d)
    expect(() => ensureDir(d)).not.toThrow()
  })

  it('creates nested directories recursively', () => {
    const d = tmpDir()
    const nested = path.join(d, 'a', 'b', 'c')
    ensureDir(nested)
    expect(fs.existsSync(nested)).toBe(true)
    expect(fs.statSync(nested).isDirectory()).toBe(true)
  })
})

/** Create a tmp project root containing content/<sub>, optionally marking it as
 *  the scaffold package itself via a package.json with the scaffold name. */
function makeProjectWithContent(sub: string, opts: { asScaffold: boolean }): { root: string; local: string } {
  const root = tmpDir()
  const local = path.join(root, 'content', sub)
  fs.mkdirSync(local, { recursive: true })
  if (opts.asScaffold) {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: '@zigrivers/scaffold' }),
      'utf8',
    )
  }
  return { root, local }
}

describe('getPackageSkillsDir', () => {
  it('uses a project-local content/skills directory only when the project IS scaffold itself', () => {
    const { root, local } = makeProjectWithContent('skills', { asScaffold: true })
    expect(getPackageSkillsDir(root)).toBe(local)
  })

  it('ignores a project-local content/skills directory for a downstream project (not scaffold)', () => {
    // A downstream project (e.g. a scaffold-like CLI tool) that merely has a
    // content/skills directory must NOT shadow scaffold's bundled content.
    const { root, local } = makeProjectWithContent('skills', { asScaffold: false })
    const resolved = getPackageSkillsDir(root)
    expect(resolved).not.toBe(local)
    expect(resolved).toBe(getPackageSkillsDir()) // bundled fallback
  })

  it('falls back to the bundled content/skills directory when no local override exists', () => {
    const bundledDir = getPackageSkillsDir()

    expect(bundledDir).toContain(path.join('content', 'skills'))
    expect(fs.existsSync(bundledDir)).toBe(true)
    expect(fs.existsSync(path.join(bundledDir, 'scaffold-runner', 'SKILL.md'))).toBe(true)
  })
})

describe('getPackageMethodologyDir', () => {
  it('ignores a project-local content/methodology directory for a downstream project (not scaffold)', () => {
    // This is the surface regression: a project whose own content/methodology
    // exists must not shadow the bundled methodology presets (which would
    // collapse the resolved pipeline graph).
    const { root, local } = makeProjectWithContent('methodology', { asScaffold: false })
    const resolved = getPackageMethodologyDir(root)
    expect(resolved).not.toBe(local)
    expect(resolved).toBe(getPackageMethodologyDir()) // bundled fallback
  })

  it('uses a project-local content/methodology directory when the project IS scaffold itself', () => {
    const { root, local } = makeProjectWithContent('methodology', { asScaffold: true })
    expect(getPackageMethodologyDir(root)).toBe(local)
  })
})

describe('getPackagePipelineDir', () => {
  // Guards the shared resolveContentDir contract for a third subdir, so a
  // future refactor that splits the implementation can't silently lose the
  // gate for the pipeline resolver (the one whose collapse caused the bug).
  it('ignores a project-local content/pipeline directory for a downstream project (not scaffold)', () => {
    const { root, local } = makeProjectWithContent('pipeline', { asScaffold: false })
    const resolved = getPackagePipelineDir(root)
    expect(resolved).not.toBe(local)
    expect(resolved).toBe(getPackagePipelineDir()) // bundled fallback
  })

  it('uses a project-local content/pipeline directory when the project IS scaffold itself', () => {
    const { root, local } = makeProjectWithContent('pipeline', { asScaffold: true })
    expect(getPackagePipelineDir(root)).toBe(local)
  })
})
