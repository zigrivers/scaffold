import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mmrBin = path.resolve(__dirname, '../../dist/index.js')

function runMmr(args: string[], env: NodeJS.ProcessEnv = {}): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [mmrBin, ...args], { encoding: 'utf-8', env: { ...process.env, ...env } })
    return { code: 0, stdout, stderr: '' }
  } catch (err: unknown) {
    const e = err as { status: number; stdout: string; stderr: string }
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

describe('mmr sessions CLI', () => {
  it('start + list + end roundtrip persists state', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-sessions-cli-'))
    const env = { HOME: tmpHome }
    try {
      runMmr(['sessions', 'start', 'feat-foo'], env)
      const listed = runMmr(['sessions', 'list'], env)
      expect(listed.stdout).toMatch(/feat-foo/)
      const shown = runMmr(['sessions', 'show', 'feat-foo'], env)
      expect(shown.stdout).toMatch(/feat-foo/)
      runMmr(['sessions', 'end', 'feat-foo'], env)
      const after = runMmr(['sessions', 'list'], env)
      expect(after.stdout).not.toMatch(/feat-foo/)
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })
})
