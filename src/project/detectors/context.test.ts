import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext } from './context.js'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'signal-context-'))
}

describe('createSignalContext (FsSignalContext)', () => {
  it('hasFile returns true for existing files', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'foo.txt'), 'hi')
    const ctx = createSignalContext(dir)
    expect(ctx.hasFile('foo.txt')).toBe(true)
    expect(ctx.hasFile('bar.txt')).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('dirExists returns true for existing dirs', () => {
    const dir = makeTmpDir()
    fs.mkdirSync(path.join(dir, 'subdir'))
    const ctx = createSignalContext(dir)
    expect(ctx.dirExists('subdir')).toBe(true)
    expect(ctx.dirExists('missing')).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('rootEntries returns sorted names', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'b.txt'), '')
    fs.writeFileSync(path.join(dir, 'a.txt'), '')
    const ctx = createSignalContext(dir)
    expect(ctx.rootEntries()).toEqual(['a.txt', 'b.txt'])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('packageJson parses valid JSON', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'demo', version: '1.0.0', dependencies: { 'next': '14' },
    }))
    const ctx = createSignalContext(dir)
    expect(ctx.packageJson()?.name).toBe('demo')
    expect(ctx.manifestStatus('npm')).toBe('parsed')
    expect(ctx.hasDep('next', 'npm')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('packageJson emits ADOPT_MANIFEST_UNPARSEABLE on bad JSON', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'package.json'), '{ invalid json')
    const ctx = createSignalContext(dir)
    expect(ctx.packageJson()).toBeUndefined()
    expect(ctx.manifestStatus('npm')).toBe('unparseable')
    expect(ctx.warnings.some(w => w.code === 'ADOPT_MANIFEST_UNPARSEABLE')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('cargoToml parses valid TOML with [lib]', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'Cargo.toml'),
      '[package]\nname = "demo"\n[lib]\n[dependencies]\nbevy = "0.13"')
    const ctx = createSignalContext(dir)
    expect(ctx.cargoToml()?.package?.name).toBe('demo')
    expect(ctx.hasDep('bevy', 'cargo')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('goMod parses multi-line require blocks', () => {
    const dir = makeTmpDir()
    const content = `module example.com/demo
go 1.21
require (
  github.com/gin-gonic/gin v1.9.0
  github.com/spf13/pflag v1.0.5 // indirect
)`
    fs.writeFileSync(path.join(dir, 'go.mod'), content)
    const ctx = createSignalContext(dir)
    const go = ctx.goMod()
    expect(go?.module).toBe('example.com/demo')
    expect(go?.requires?.length).toBe(2)
    expect(ctx.hasDep('github.com/gin-gonic/gin', 'go')).toBe(true)
    // Indirect dep should be filtered
    expect(ctx.hasDep('github.com/spf13/pflag', 'go')).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('pyprojectToml parses Poetry [tool.poetry.dependencies]', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'pyproject.toml'),
      '[tool.poetry]\nname = "demo"\n[tool.poetry.dependencies]\npython = "^3.10"\ntorch = "^2.0"')
    const ctx = createSignalContext(dir)
    expect(ctx.hasDep('torch', 'py')).toBe(true)
    expect(ctx.hasDep('python', 'py')).toBe(false)    // python key excluded
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('does not throw on permission errors — emits warning instead', () => {
    // Use a path that definitely doesn't exist to trigger ENOENT
    const ctx = createSignalContext('/non-existent-path-12345')
    expect(() => ctx.rootEntries()).not.toThrow()
    expect(ctx.warnings.length).toBeGreaterThan(0)
  })

  it('readFileText returns undefined for missing files', () => {
    const dir = makeTmpDir()
    const ctx = createSignalContext(dir)
    expect(ctx.readFileText('missing.txt')).toBeUndefined()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('readFileText truncates files larger than maxBytes', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(1000))
    const ctx = createSignalContext(dir)
    const content = ctx.readFileText('big.txt', 100)
    expect(content?.length).toBe(100)
    expect(ctx.warnings.some(w => w.code === 'ADOPT_FILE_TRUNCATED')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // F1: manifestStatus must lazily trigger the parser so callers who use
  // it as a pre-check (before calling packageJson()/etc.) see accurate status.
  it('manifestStatus(npm) lazily triggers packageJson parse', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.0.0' }))
    const ctx = createSignalContext(dir)
    // Call manifestStatus WITHOUT first calling packageJson() — should still
    // report 'parsed' because the status check lazily runs the parser.
    expect(ctx.manifestStatus('npm')).toBe('parsed')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('manifestStatus(npm) reports unparseable on bad JSON without prior parse call', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'package.json'), '{ invalid')
    const ctx = createSignalContext(dir)
    expect(ctx.manifestStatus('npm')).toBe('unparseable')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('manifestStatus(py) reports missing when no pyproject.toml exists', () => {
    const dir = makeTmpDir()
    const ctx = createSignalContext(dir)
    expect(ctx.manifestStatus('py')).toBe('missing')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // F3: readFileText must not cache truncated reads — a later full read
  // should return the full content, not the truncated one.
  it('readFileText does not poison cache when first call truncates', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'big.txt'), 'A'.repeat(1000))
    const ctx = createSignalContext(dir)
    // First call: truncated to 100 bytes
    const first = ctx.readFileText('big.txt', 100)
    expect(first?.length).toBe(100)
    // No trailing NUL bytes from a short read
    expect(first).not.toContain('\u0000')
    // Second call: full read (uses default maxBytes) — must return 1000 bytes,
    // not the cached truncated value.
    const second = ctx.readFileText('big.txt')
    expect(second?.length).toBe(1000)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // F4: listDir/hasFile must not warn on ENOENT/ENOTDIR — missing paths are
  // an expected probe result for detectors checking optional directories.
  it('listDir does not warn on missing directories', () => {
    const dir = makeTmpDir()
    const ctx = createSignalContext(dir)
    ctx.listDir('does-not-exist')
    expect(ctx.warnings.filter(w => w.code === 'ADOPT_FS_INACCESSIBLE')).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('hasFile does not warn on missing files', () => {
    const dir = makeTmpDir()
    const ctx = createSignalContext(dir)
    ctx.hasFile('definitely-not-here.json')
    expect(ctx.warnings.filter(w => w.code === 'ADOPT_FS_INACCESSIBLE')).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('dirExists does not warn on missing directories', () => {
    const dir = makeTmpDir()
    const ctx = createSignalContext(dir)
    ctx.dirExists('not-here')
    expect(ctx.warnings.filter(w => w.code === 'ADOPT_FS_INACCESSIBLE')).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // F5: extractPyName must handle PEP 508 parenthesis form `Django (>=2.0)`.
  it('extractPyName handles PEP 508 parenthesis form', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'pyproject.toml'),
      '[project]\nname = "demo"\ndependencies = ["Django (>=2.0)"]')
    const ctx = createSignalContext(dir)
    expect(ctx.hasDep('django', 'py')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // F7: goMod must mark completely malformed content (no module directive)
  // as 'unparseable' to match the other manifest accessors.
  it('goMod marks content with no module directive as unparseable', () => {
    const dir = makeTmpDir()
    fs.writeFileSync(path.join(dir, 'go.mod'), '<<garbage>>\nno module here')
    const ctx = createSignalContext(dir)
    expect(ctx.goMod()).toBeUndefined()
    expect(ctx.manifestStatus('go')).toBe('unparseable')
    expect(ctx.warnings.some(w => w.code === 'ADOPT_MANIFEST_UNPARSEABLE')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('createFakeSignalContext', () => {
  it('reports files from the input map', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      files: { 'package.json': '{"name":"x"}' },
    })
    expect(ctx.hasFile('package.json')).toBe(true)
    expect(ctx.readFileText('package.json')).toBe('{"name":"x"}')
  })

  it('reports dirs from the input set', () => {
    const ctx = createFakeSignalContext({ dirs: ['ios', 'android'] })
    expect(ctx.dirExists('ios')).toBe(true)
    expect(ctx.dirExists('android')).toBe(true)
    expect(ctx.dirExists('web')).toBe(false)
  })

  it('reports manifestStatus from input', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'x' },
      pyprojectToml: 'unparseable',
    })
    expect(ctx.manifestStatus('npm')).toBe('parsed')
    expect(ctx.manifestStatus('py')).toBe('unparseable')
    expect(ctx.manifestStatus('cargo')).toBe('missing')
  })

  it('hasDep walks fake package.json deps', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'x', dependencies: { 'next': '14', 'react': '18' } },
    })
    expect(ctx.hasDep('next', 'npm')).toBe(true)
    expect(ctx.hasDep('react', 'npm')).toBe(true)
    expect(ctx.hasDep('vue', 'npm')).toBe(false)
  })

  // F6: fake hasFile must not treat directory names in rootEntries as files.
  // The real context distinguishes files from dirs via stat.isFile(), and
  // the fake must match to keep real/fake divergence from creeping in.
  it('fake hasFile distinguishes files from directory entries', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Assets', 'package.json'],
      files: { 'package.json': '{}' },
      dirs: ['Assets'],
    })
    expect(ctx.hasFile('package.json')).toBe(true)
    // Assets is a directory, not a file — real context would return false.
    expect(ctx.hasFile('Assets')).toBe(false)
    expect(ctx.dirExists('Assets')).toBe(true)
  })
})
