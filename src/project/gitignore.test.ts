import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureScaffoldGitignore, findLegacyGeneratedOutputs } from './gitignore.js'

const tmpDirs: string[] = []

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-gitignore-${crypto.randomUUID()}`)
  tmpDirs.push(dir)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('ensureScaffoldGitignore', () => {
  it('creates .gitignore with scaffold managed block when missing', () => {
    const root = makeTempDir()

    const result = ensureScaffoldGitignore(root)

    expect(result.created).toBe(true)
    expect(result.updated).toBe(true)
    expect(result.warnings).toEqual([])

    const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
    expect(content).toContain('# >>> scaffold managed')
    expect(content).toContain('.scaffold/generated/')
    expect(content).toContain('.scaffold/lock.json')
    expect(content).toContain('.scaffold/*.tmp')
    expect(content).toContain('.scaffold/**/*.tmp')
  })

  it('updates existing managed block idempotently without changing user content', () => {
    const root = makeTempDir()
    const gitignorePath = path.join(root, '.gitignore')
    fs.writeFileSync(gitignorePath, [
      'node_modules/',
      '',
      '# >>> scaffold managed',
      '.scaffold/generated/',
      '# <<< scaffold managed',
      '',
      '.env',
      '',
    ].join('\n'))

    const first = ensureScaffoldGitignore(root)
    const firstContent = fs.readFileSync(gitignorePath, 'utf8')
    const second = ensureScaffoldGitignore(root)
    const secondContent = fs.readFileSync(gitignorePath, 'utf8')

    expect(first.created).toBe(false)
    expect(first.updated).toBe(true)
    expect(firstContent).toContain('node_modules/')
    expect(firstContent).toContain('.env')
    expect(firstContent).toContain('.scaffold/lock.json')
    expect(second.updated).toBe(false)
    expect(secondContent).toBe(firstContent)
  })

  it('warns when user rules would ignore committed scaffold state', () => {
    const root = makeTempDir()
    fs.writeFileSync(path.join(root, '.gitignore'), [
      '.scaffold/',
      '.scaffold/*',
      '',
    ].join('\n'))

    const result = ensureScaffoldGitignore(root)

    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'GITIGNORE_SCAFFOLD_STATE_HIDDEN' }),
      expect.objectContaining({ code: 'GITIGNORE_SCAFFOLD_STATE_HIDDEN' }),
    ])
  })
})

describe('findLegacyGeneratedOutputs', () => {
  it('finds legacy root generated outputs', () => {
    const root = makeTempDir()
    fs.mkdirSync(path.join(root, 'commands'))
    fs.mkdirSync(path.join(root, 'prompts'))
    fs.mkdirSync(path.join(root, 'codex-prompts'))
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Scaffold Pipeline — Codex Guide', 'utf8')

    expect(findLegacyGeneratedOutputs(root)).toEqual([
      'commands/',
      'prompts/',
      'codex-prompts/',
      'AGENTS.md',
    ])
  })

  it('does not flag a user-owned root AGENTS.md as legacy generated output', () => {
    const root = makeTempDir()
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Project agent instructions', 'utf8')

    expect(findLegacyGeneratedOutputs(root)).toEqual([])
  })

  it('returns empty array when no legacy outputs exist', () => {
    const root = makeTempDir()
    expect(findLegacyGeneratedOutputs(root)).toEqual([])
  })
})
