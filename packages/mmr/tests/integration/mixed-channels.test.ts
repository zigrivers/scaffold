import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { restoreEnv } from '../helpers/env.js'

// Task 36: end-to-end smoke that a subprocess channel and an http channel run
// in the SAME review, each through its REAL kind-specific dispatcher. Driven at
// the handler level (CI does not build dist). Only auth is mocked (so both
// channels are "valid" and reach dispatch); the real dispatchChannel and
// dispatchHttpChannel then fail in their distinct ways:
//   - subprocess: spawning a nonexistent binary → ENOENT → failed (log: spawn … ENOENT)
//   - http: POST to an unreachable endpoint → connection refused → failed (log: request failed)
// The distinct error markers prove each went through the correct dispatcher.

const originalHome = process.env.HOME
const originalMmrHome = process.env.MMR_HOME

afterEach(() => {
  restoreEnv('HOME', originalHome)
  restoreEnv('MMR_HOME', originalMmrHome)
  vi.restoreAllMocks()
})

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-mixed-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' })
  return dir
}

const CONFIG_YAML = [
  'version: 1',
  'channels:',
  '  fake-sub:',
  '    kind: subprocess',
  '    command: nonexistent-cli-binary-xyz',
  '    auth:',
  '      check: "true"',
  '      failure_exit_codes: [1]',
  '      recovery: ""',
  '  fake-http:',
  '    kind: http',
  '    endpoint: https://127.0.0.1:1/v1/chat/completions',
  '    model: m',
  '    endpoint_convention: openai-chat',
  '    auth:',
  '      timeout: 2',
  '',
].join('\n')

async function runMixed(dir: string, home: string): Promise<Record<string, unknown> | undefined> {
  vi.resetModules()
  process.env.HOME = home
  delete process.env.MMR_HOME
  // Mock ONLY auth so both channels are valid and reach their real dispatchers.
  vi.doMock('../../src/core/auth.js', () => ({
    checkInstalled: vi.fn().mockResolvedValue(true),
    checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
    checkHttpAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
  }))
  const { reviewCommand } = await import('../../src/commands/review.js')
  vi.spyOn(process, 'cwd').mockReturnValue(dir)
  const logs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...m: unknown[]) => { logs.push(m.map(String).join(' ')) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const prevExitCode = process.exitCode
  process.exitCode = undefined
  vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit') }) as never)

  const diffFile = path.join(dir, 'd.patch')
  fs.writeFileSync(diffFile, 'diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-a\n+b\n')
  try {
    await (reviewCommand.handler as (a: unknown) => Promise<void>)({
      sync: true, format: 'json', _: ['review'], $0: 'mmr',
      diff: diffFile, base: 'HEAD', channels: ['fake-sub', 'fake-http'], timeout: 5,
    })
  } catch (e) {
    if ((e as Error).message !== 'process.exit') throw e
  } finally {
    vi.doUnmock('../../src/core/auth.js')
    process.exitCode = prevExitCode
  }
  const json = logs.find((l) => l.trim().startsWith('{'))
  return json ? JSON.parse(json) as Record<string, unknown> : undefined
}

describe('mixed subprocess + HTTP channel review', () => {
  it('dispatches each channel through its real kind-specific dispatcher', async () => {
    const dir = initRepo()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-mixed-home-'))
    try {
      fs.writeFileSync(path.join(dir, '.mmr.yaml'), CONFIG_YAML)
      fs.writeFileSync(path.join(dir, 'README.md'), 'hi')
      execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'baseline'], { cwd: dir, stdio: 'ignore' })

      const out = await runMixed(dir, home)
      const perChannel = out?.per_channel as Record<string, { status: string; error?: string }> | undefined
      expect(perChannel).toBeDefined()

      // Subprocess channel went through dispatchChannel (real spawn → ENOENT).
      expect(perChannel!['fake-sub'].status).toBe('failed')
      expect(perChannel!['fake-sub'].error ?? '').toMatch(/ENOENT|nonexistent-cli-binary-xyz/)

      // HTTP channel went through dispatchHttpChannel (real fetch → refused).
      expect(['failed', 'timeout']).toContain(perChannel!['fake-http'].status)
      expect(perChannel!['fake-http'].error ?? '').toMatch(/request failed|timed out/)

      // A verdict was produced from the mixed review.
      expect(out?.verdict).toBeDefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
