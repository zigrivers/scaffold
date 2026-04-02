import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { GeminiMdManager } from './gemini-md.js'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-gemini-md-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

describe('GeminiMdManager', () => {
  it('creates GEMINI.md with the managed import block when missing', () => {
    const root = makeTmpDir()
    const manager = new GeminiMdManager(root)

    manager.syncManagedBlock()

    const geminiMdPath = path.join(root, 'GEMINI.md')
    expect(fs.existsSync(geminiMdPath)).toBe(true)

    const content = fs.readFileSync(geminiMdPath, 'utf8')
    expect(content).toContain('<!-- >>> scaffold managed -->')
    expect(content).toContain('@./.agents/skills/scaffold-runner/SKILL.md')
    expect(content).toContain('@./.agents/skills/scaffold-pipeline/SKILL.md')
    expect(content).toContain('<!-- <<< scaffold managed -->')
  })

  it('replaces the managed import block without duplicating it', () => {
    const root = makeTmpDir()
    const geminiMdPath = path.join(root, 'GEMINI.md')
    fs.writeFileSync(geminiMdPath, [
      '# Gemini notes',
      '',
      '<!-- >>> scaffold managed -->',
      '@./old/path.md',
      '<!-- <<< scaffold managed -->',
      '',
    ].join('\n'))

    const manager = new GeminiMdManager(root)
    manager.syncManagedBlock()

    const content = fs.readFileSync(geminiMdPath, 'utf8')
    expect(content).toContain('@./.agents/skills/scaffold-runner/SKILL.md')
    expect(content).toContain('@./.agents/skills/scaffold-pipeline/SKILL.md')
    expect(content).not.toContain('@./old/path.md')
    expect(content.match(/<!-- >>> scaffold managed -->/g)).toHaveLength(1)
  })

  it('collapses duplicate managed blocks into exactly one current block', () => {
    const root = makeTmpDir()
    const geminiMdPath = path.join(root, 'GEMINI.md')
    fs.writeFileSync(geminiMdPath, [
      '# Gemini notes',
      '',
      '<!-- >>> scaffold managed -->',
      '@./old/path-one.md',
      '<!-- <<< scaffold managed -->',
      '',
      'Handwritten content between blocks.',
      '',
      '<!-- >>> scaffold managed -->',
      '@./old/path-two.md',
      '<!-- <<< scaffold managed -->',
      '',
    ].join('\n'))

    const manager = new GeminiMdManager(root)
    manager.syncManagedBlock()

    const content = fs.readFileSync(geminiMdPath, 'utf8')
    expect(content.match(/<!-- >>> scaffold managed -->/g)).toHaveLength(1)
    expect(content.match(/<!-- <<< scaffold managed -->/g)).toHaveLength(1)
    expect(content).toContain('@./.agents/skills/scaffold-runner/SKILL.md')
    expect(content).toContain('@./.agents/skills/scaffold-pipeline/SKILL.md')
    expect(content).not.toContain('@./old/path-one.md')
    expect(content).not.toContain('@./old/path-two.md')
    expect(content).toContain('Handwritten content between blocks.')
  })

  it('preserves unmanaged GEMINI.md content around the managed block', () => {
    const root = makeTmpDir()
    const geminiMdPath = path.join(root, 'GEMINI.md')
    fs.writeFileSync(geminiMdPath, [
      '# Personal Gemini notes',
      '',
      'This content should stay.',
      '',
      'More handwritten guidance.',
      '',
    ].join('\n'))

    const manager = new GeminiMdManager(root)
    manager.syncManagedBlock()

    const content = fs.readFileSync(geminiMdPath, 'utf8')
    expect(content).toContain('# Personal Gemini notes')
    expect(content).toContain('This content should stay.')
    expect(content).toContain('More handwritten guidance.')
    expect(content).toContain('@./.agents/skills/scaffold-runner/SKILL.md')
    expect(content).toContain('@./.agents/skills/scaffold-pipeline/SKILL.md')
  })
})
