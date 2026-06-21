import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { skillCommand } from '../../src/commands/skill.js'

// Invoked directly against the handler (not the built dist), matching the
// ack-cli convention: CI runs the vitest suite without building packages/mmr/dist.

afterEach(() => {
  vi.restoreAllMocks()
})

function runSkill(args: Record<string, unknown>): {
  out: string[]
  err: string[]
  exited: number | undefined
} {
  const out: string[] = []
  const err: string[] = []
  let exited: number | undefined
  vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { out.push(String(m)) })
  vi.spyOn(console, 'error').mockImplementation((m?: unknown) => { err.push(String(m)) })
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exited = code ?? 0
    throw new Error('process.exit')
  }) as never)
  try {
    void (skillCommand.handler as (a: unknown) => void)({ _: ['skill'], $0: 'mmr', ...args })
  } catch (e) {
    if ((e as Error).message !== 'process.exit') throw e
  }
  return { out, err, exited }
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-skill-cli-'))
}

describe('mmr skill install CLI', () => {
  it('errors when no platform and no --all are given', () => {
    const dir = tmpDir()
    try {
      const { err, exited } = runSkill({ action: 'install', dir })
      expect(exited).toBe(1)
      expect(err.join('\n')).toMatch(/at least one platform|--all/i)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('errors on an unknown platform', () => {
    const dir = tmpDir()
    try {
      const { err, exited } = runSkill({ action: 'install', dir, platform: ['windsurf'] })
      expect(exited).toBe(1)
      expect(err.join('\n')).toMatch(/unknown platform/i)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes the cursor rule on install', () => {
    const dir = tmpDir()
    try {
      const { exited } = runSkill({ action: 'install', dir, platform: ['cursor'] })
      expect(exited).toBeUndefined()
      const written = fs.readFileSync(path.join(dir, '.cursor', 'rules', 'mmr-review.mdc'), 'utf-8')
      expect(written).toContain('alwaysApply')
      expect(written).toContain('mmr review')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--dry-run writes nothing', () => {
    const dir = tmpDir()
    try {
      const { out, exited } = runSkill({ action: 'install', dir, all: true, 'dry-run': true })
      expect(exited).toBeUndefined()
      expect(out.join('\n')).toMatch(/dry run/i)
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(false)
      expect(fs.existsSync(path.join(dir, '.cursor'))).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits 1 and skips when a dedicated file exists without --force', () => {
    const dir = tmpDir()
    try {
      const target = path.join(dir, '.cursor', 'rules', 'mmr-review.mdc')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, 'user content')
      const { exited } = runSkill({ action: 'install', dir, platform: ['cursor'] })
      expect(exited).toBe(1)
      expect(fs.readFileSync(target, 'utf-8')).toBe('user content')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('errors when --dir points at a file, not a directory', () => {
    const dir = tmpDir()
    try {
      const filePath = path.join(dir, 'not-a-dir')
      fs.writeFileSync(filePath, 'x')
      const { err, exited } = runSkill({ action: 'install', dir: filePath, all: true })
      expect(exited).toBe(1)
      expect(err.join('\n')).toMatch(/not a directory/i)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--all installs every platform and is idempotent', () => {
    const dir = tmpDir()
    try {
      runSkill({ action: 'install', dir, all: true })
      expect(fs.existsSync(path.join(dir, '.cursor', 'rules', 'mmr-review.mdc'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true)
      // Gemini was dropped — no GEMINI.md is written
      expect(fs.existsSync(path.join(dir, 'GEMINI.md'))).toBe(false)

      const { out, exited } = runSkill({ action: 'install', dir, all: true })
      expect(exited).toBeUndefined()
      expect(out.join('\n')).toMatch(/already up to date/i)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
