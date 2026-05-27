import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runCli } from '../../src/cli.js'

const originalHome = process.env.HOME

afterEach(() => {
  process.env.HOME = originalHome
  vi.restoreAllMocks()
})

async function runMmr(args: string[], home: string): Promise<{ code: number; stdout: string; stderr: string }> {
  process.env.HOME = home
  let stdout = ''
  let stderr = ''
  vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
    stdout += `${String(message)}\n`
  })
  vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
    stderr += `${String(message)}\n`
  })
  try {
    await runCli(args)
    return { code: 0, stdout, stderr: '' }
  } catch (err: unknown) {
    return { code: 1, stdout, stderr: stderr || (err as Error).message }
  }
}

describe('mmr sessions CLI', () => {
  it('start + list + end roundtrip persists state', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-sessions-cli-'))
    try {
      await runMmr(['sessions', 'start', 'feat-foo'], tmpHome)
      const listed = await runMmr(['sessions', 'list'], tmpHome)
      expect(listed.stdout).toMatch(/feat-foo/)
      const shown = await runMmr(['sessions', 'show', 'feat-foo'], tmpHome)
      expect(shown.stdout).toMatch(/feat-foo/)
      await runMmr(['sessions', 'end', 'feat-foo'], tmpHome)
      const after = await runMmr(['sessions', 'list'], tmpHome)
      expect(after.stdout).not.toMatch(/feat-foo/)
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })

  it('reports failure when ending a missing session', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-sessions-cli-'))
    try {
      const result = await runMmr(['sessions', 'end', 'missing'], tmpHome)
      expect(result.code).toBe(1)
      expect(result.stderr).toMatch(/Session not found: missing/)
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })
})
