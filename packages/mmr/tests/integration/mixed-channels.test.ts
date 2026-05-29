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

interface MixedResult {
  output: Record<string, unknown> | undefined
  /** channel names that went through the REAL subprocess / http dispatchers. */
  subDispatched: string[]
  httpDispatched: string[]
}

async function runMixed(dir: string, home: string): Promise<MixedResult> {
  vi.resetModules()
  process.env.HOME = home
  delete process.env.MMR_HOME
  // Mock ONLY auth so both channels are valid and reach their real dispatchers.
  vi.doMock('../../src/core/auth.js', () => ({
    checkInstalled: vi.fn().mockResolvedValue(true),
    checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
    checkHttpAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
  }))
  // Spy-and-call-through on BOTH dispatchers: this is the positive control that
  // routing was driven by `kind` (not just that both transports failed). The
  // real implementations still run (real spawn / real fetch).
  const subDispatched: string[] = []
  const httpDispatched: string[] = []
  vi.doMock('../../src/core/dispatcher.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/core/dispatcher.js')>()
    return {
      ...actual,
      dispatchChannel: (store: never, jobId: string, name: string, opts: never) => {
        subDispatched.push(name)
        return actual.dispatchChannel(store, jobId, name, opts)
      },
    }
  })
  vi.doMock('../../src/core/http-dispatcher.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/core/http-dispatcher.js')>()
    return {
      ...actual,
      dispatchHttpChannel: (store: never, jobId: string, name: string, opts: never) => {
        httpDispatched.push(name)
        return actual.dispatchHttpChannel(store, jobId, name, opts)
      },
    }
  })
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
    vi.doUnmock('../../src/core/dispatcher.js')
    vi.doUnmock('../../src/core/http-dispatcher.js')
    process.exitCode = prevExitCode
  }
  // Take the LAST line that parses as JSON (the final --format json result),
  // robust to any earlier object-shaped log lines.
  const jsonLines = logs.filter((l) => l.trim().startsWith('{'))
  const json = jsonLines.length > 0 ? jsonLines[jsonLines.length - 1] : undefined
  return {
    output: json ? JSON.parse(json) as Record<string, unknown> : undefined,
    subDispatched,
    httpDispatched,
  }
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

      const { output, subDispatched, httpDispatched } = await runMixed(dir, home)
      const perChannel = output?.per_channel as Record<string, { status: string; error?: string }> | undefined
      expect(perChannel).toBeDefined()

      // Positive control: routing was driven by `kind`. The subprocess channel
      // went through dispatchChannel; the http channel went through the http
      // dispatcher; neither was sent to the other's dispatcher. (subDispatched
      // also contains the default-compensator passes for the two failed
      // channels — themselves correctly subprocess-routed.)
      expect(subDispatched).toContain('fake-sub')
      expect(subDispatched).not.toContain('fake-http')
      expect(httpDispatched).toEqual(['fake-http'])

      // Secondary evidence: each failed in its transport-specific way.
      // Subprocess channel → real spawn → ENOENT.
      expect(perChannel!['fake-sub'].status).toBe('failed')
      expect(perChannel!['fake-sub'].error ?? '').toMatch(/ENOENT|nonexistent-cli-binary-xyz/)
      // HTTP channel → real fetch → connection refused.
      expect(['failed', 'timeout']).toContain(perChannel!['fake-http'].status)
      expect(perChannel!['fake-http'].error ?? '').toMatch(/request failed|timed out/)

      // A verdict was produced from the mixed review.
      expect(output?.verdict).toBeDefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
