import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { restoreEnv } from '../helpers/env.js'

// Task 34: review dispatch must route by channel kind — subprocess channels
// through dispatchChannel + checkAuth, http channels through dispatchHttpChannel
// + checkHttpAuth. Driven at the handler level (CI does not build dist).

const originalHome = process.env.HOME
const originalMmrHome = process.env.MMR_HOME

afterEach(() => {
  restoreEnv('HOME', originalHome)
  restoreEnv('MMR_HOME', originalMmrHome)
  vi.restoreAllMocks()
})

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-http-route-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' })
  return dir
}

const CONFIG_YAML = [
  'version: 1',
  'channels:',
  '  sub:',
  '    command: sub-review',
  '    auth:',
  '      check: "true"',
  '      failure_exit_codes: [1]',
  '      recovery: "x"',
  '  httpc:',
  '    kind: http',
  '    endpoint: https://api.example.com/v1/chat/completions',
  '    model: m',
  '    endpoint_convention: openai-chat',
  '    api_key_env: ROUTING_KEY',
  '',
].join('\n')

interface DispatchCall { name: string }

async function runRouting(dir: string, home: string): Promise<{ subCalls: DispatchCall[]; httpCalls: DispatchCall[]; output: Record<string, unknown> | undefined }> {
  vi.resetModules()
  process.env.HOME = home
  delete process.env.MMR_HOME
  process.env.ROUTING_KEY = 'sk-routing'

  const subCalls: DispatchCall[] = []
  const httpCalls: DispatchCall[] = []
  const completer = async (store: { saveChannelOutput: (j: string, n: string, o: string) => void; updateChannel: (j: string, n: string, u: unknown) => void }, jobId: string, name: string) => {
    store.saveChannelOutput(jobId, name, JSON.stringify({ findings: [] }))
    store.updateChannel(jobId, name, { status: 'completed', started_at: '2026-05-22T00:00:00Z', completed_at: '2026-05-22T00:00:01Z', output_parser: 'default' })
  }
  vi.doMock('../../src/core/dispatcher.js', () => ({
    dispatchChannel: vi.fn().mockImplementation(async (s: never, j: string, n: string) => { subCalls.push({ name: n }); await completer(s as never, j, n) }),
  }))
  vi.doMock('../../src/core/http-dispatcher.js', () => ({
    dispatchHttpChannel: vi.fn().mockImplementation(async (s: never, j: string, n: string) => { httpCalls.push({ name: n }); await completer(s as never, j, n) }),
  }))
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
      diff: diffFile, base: 'HEAD', channels: ['sub', 'httpc'],
    })
  } catch (e) {
    if ((e as Error).message !== 'process.exit') throw e
  } finally {
    vi.doUnmock('../../src/core/dispatcher.js')
    vi.doUnmock('../../src/core/http-dispatcher.js')
    vi.doUnmock('../../src/core/auth.js')
    process.exitCode = prevExitCode
    delete process.env.ROUTING_KEY
  }
  const json = logs.find((l) => l.trim().startsWith('{'))
  return { subCalls, httpCalls, output: json ? JSON.parse(json) as Record<string, unknown> : undefined }
}

describe('mmr review — kind-based dispatch routing', () => {
  it('routes subprocess→dispatchChannel and http→dispatchHttpChannel', async () => {
    const dir = initRepo()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-http-route-home-'))
    try {
      // Config committed to HEAD so base-ref mode (--base HEAD) loads it.
      fs.writeFileSync(path.join(dir, '.mmr.yaml'), CONFIG_YAML)
      fs.writeFileSync(path.join(dir, 'README.md'), 'hi')
      execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'baseline'], { cwd: dir, stdio: 'ignore' })

      const { subCalls, httpCalls, output } = await runRouting(dir, home)

      expect(subCalls.map((c) => c.name)).toEqual(['sub'])
      expect(httpCalls.map((c) => c.name)).toEqual(['httpc'])
      // Both completed → a verdict was produced (http no longer dead at the CLI).
      expect(output?.verdict).toBeDefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
