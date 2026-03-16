import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { detectProjectMode } from './detector.js'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-detector-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

describe('detectProjectMode', () => {
  it('returns greenfield for an empty directory', () => {
    const root = makeTmpDir()
    const result = detectProjectMode(root)
    expect(result.mode).toBe('greenfield')
    expect(result.signals).toEqual([])
    expect(result.methodologySuggestion).toBe('deep')
  })

  it('returns brownfield when package.json is present', () => {
    const root = makeTmpDir()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    const result = detectProjectMode(root)
    expect(result.mode).toBe('brownfield')
    expect(result.signals.some(s => s.category === 'package-manifest')).toBe(true)
  })

  it('returns brownfield when src/ directory is present', () => {
    const root = makeTmpDir()
    fs.mkdirSync(path.join(root, 'src'))
    const result = detectProjectMode(root)
    expect(result.mode).toBe('brownfield')
    expect(result.signals.some(s => s.category === 'source-directory')).toBe(true)
  })

  it('returns v1-migration when tracking comment is found in docs/', () => {
    const root = makeTmpDir()
    fs.mkdirSync(path.join(root, 'docs'))
    fs.writeFileSync(
      path.join(root, 'docs/prd.md'),
      '# PRD\n<!-- scaffold:create-prd v1 2024-01-01 -->\nContent here',
    )
    const result = detectProjectMode(root)
    expect(result.mode).toBe('v1-migration')
    expect(result.signals.some(s => s.category === 'v1-tracking')).toBe(true)
  })

  it('v1-migration takes priority over brownfield signals', () => {
    const root = makeTmpDir()
    // Add brownfield signal
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    // Add v1 tracking signal
    fs.mkdirSync(path.join(root, 'docs'))
    fs.writeFileSync(
      path.join(root, 'docs/user-stories.md'),
      '# Stories\n<!-- scaffold:user-stories v2 2024-06-15 -->\n',
    )
    const result = detectProjectMode(root)
    expect(result.mode).toBe('v1-migration')
  })

  it('methodologySuggestion is deep for large codebases (>10 source files)', () => {
    const root = makeTmpDir()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    fs.mkdirSync(path.join(root, 'src'))
    // Write 12 TypeScript files
    for (let i = 0; i < 12; i++) {
      fs.writeFileSync(path.join(root, 'src', `file${i}.ts`), `export const x${i} = ${i}`)
    }
    const result = detectProjectMode(root)
    expect(result.mode).toBe('brownfield')
    expect(result.methodologySuggestion).toBe('deep')
  })

  it('methodologySuggestion is mvp for small codebases (<=10 source files)', () => {
    const root = makeTmpDir()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    fs.mkdirSync(path.join(root, 'src'))
    // Write only 3 TypeScript files
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(root, 'src', `file${i}.ts`), `export const x${i} = ${i}`)
    }
    const result = detectProjectMode(root)
    expect(result.mode).toBe('brownfield')
    expect(result.methodologySuggestion).toBe('mvp')
  })

  it('signals array has correct categories for detected signals', () => {
    const root = makeTmpDir()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    fs.mkdirSync(path.join(root, 'src'))
    fs.mkdirSync(path.join(root, 'docs'))
    const result = detectProjectMode(root)
    const categories = result.signals.map(s => s.category)
    expect(categories).toContain('package-manifest')
    expect(categories).toContain('documentation')
  })

  it('DetectionResult has mode, signals, and methodologySuggestion properties', () => {
    const root = makeTmpDir()
    const result = detectProjectMode(root)
    expect(result).toHaveProperty('mode')
    expect(result).toHaveProperty('signals')
    expect(result).toHaveProperty('methodologySuggestion')
    expect(Array.isArray(result.signals)).toBe(true)
  })

  it('detects vitest.config.ts as a test-config signal', () => {
    const root = makeTmpDir()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}')
    const result = detectProjectMode(root)
    expect(result.signals.some(s => s.category === 'test-config')).toBe(true)
  })

  it('detects .github/workflows as a ci-config signal', () => {
    const root = makeTmpDir()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true })
    const result = detectProjectMode(root)
    expect(result.signals.some(s => s.category === 'ci-config')).toBe(true)
  })

  it('each signal has file, category, and detected properties', () => {
    const root = makeTmpDir()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test' }))
    const result = detectProjectMode(root)
    for (const signal of result.signals) {
      expect(signal).toHaveProperty('file')
      expect(signal).toHaveProperty('category')
      expect(signal).toHaveProperty('detected')
      expect(signal.detected).toBe(true)
    }
  })

  it('returns v1-migration with deep suggestion', () => {
    const root = makeTmpDir()
    fs.mkdirSync(path.join(root, 'docs'))
    fs.writeFileSync(
      path.join(root, 'docs/domain-model.md'),
      '<!-- scaffold:domain-modeling v3 2025-01-01 -->',
    )
    const result = detectProjectMode(root)
    expect(result.mode).toBe('v1-migration')
    expect(result.methodologySuggestion).toBe('deep')
  })
})
