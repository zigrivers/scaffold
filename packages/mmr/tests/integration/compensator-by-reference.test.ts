import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Regression guard: when defaults.compensator is omitted, compensating passes
// must continue to use the historical Claude CLI fallback.
const dispatcherMock = vi.hoisted(() => ({
  calls: [] as Array<{ channelName: string; opts: { command: string; flags: string[] } }>,
}))

vi.mock('../../src/core/dispatcher.js', () => ({
  __calls: dispatcherMock.calls,
  dispatchChannel: vi.fn(async (_store, _jobId, channelName, opts) => {
    dispatcherMock.calls.push({ channelName, opts })
    return 'mock-dispatch-job'
  }),
  isChannelComplete: () => true,
}))

vi.mock('../../src/core/auth.js', () => ({
  checkInstalled: vi.fn(async (cmd: string) => cmd !== 'codex'),
  checkAuth: vi.fn(async () => ({ status: 'ok' })),
}))

describe('review compensator integration', () => {
  let originalCwd: string
  const tmpDirs: string[] = []

  beforeEach(() => {
    originalCwd = process.cwd()
    dispatcherMock.calls.length = 0
  })

  afterEach(() => {
    process.chdir(originalCwd)
    for (const tmpDir of tmpDirs.splice(0)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
    vi.restoreAllMocks()
  })

  function setupTestProject(prefix: string, projectYaml: string): string {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    tmpDirs.push(tmp)
    fs.writeFileSync(path.join(tmp, '.mmr.yaml'), projectYaml)
    const diffPath = path.join(tmp, 'd.patch')
    fs.writeFileSync(
      diffPath,
      'diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n',
    )
    process.chdir(tmp)
    vi.spyOn(os, 'homedir').mockReturnValue(tmp)
    return diffPath
  }

  async function runReview(diffPath: string): Promise<void> {
    const { reviewCommand } = await import('../../src/commands/review.js')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await reviewCommand.handler({
      trustProjectConfig: true,
      _: ['review'],
      $0: 'mmr',
      diff: diffPath,
      sync: false,
      // codex is not_installed in these tests; opt in so the compensator path
      // (the subject under test) still runs under the C1 default.
      'compensate-missing': true,
    } as unknown as Parameters<typeof reviewCommand.handler>[0])

    logSpy.mockRestore()
    exitSpy.mockRestore()
  }

  it('back-compat: no compensator block -> compensating pass still uses claude -p', async () => {
    const diffPath = setupTestProject('mmr-review-bc-', `
version: 1
channels:
  claude:
    command: claude -p
    auth: { check: 'true', failure_exit_codes: [1], recovery: 'noop' }
  codex:
    command: codex exec
    auth: { check: 'true', failure_exit_codes: [1], recovery: 'noop' }
`)
    await runReview(diffPath)

    const compCalls = dispatcherMock.calls.filter((c) => c.channelName.startsWith('compensating-'))
    expect(compCalls.length).toBeGreaterThan(0)
    expect(compCalls[0].opts.command).toBe('claude')
    expect(compCalls[0].opts.flags).toEqual(['-p', '--output-format', 'json'])
  })

  it('uses defaults.compensator.channel when configured by reference', async () => {
    const diffPath = setupTestProject('mmr-review-ref-', `
version: 1
defaults:
  compensator:
    channel: qwen-local
channels:
  claude:
    command: claude -p
    auth: { check: 'true', failure_exit_codes: [1], recovery: 'noop' }
  codex:
    command: codex exec
    auth: { check: 'true', failure_exit_codes: [1], recovery: 'noop' }
  qwen-local:
    command: ollama
    flags: ["run", "qwen2.5-coder:32b"]
    auth: { check: 'true', failure_exit_codes: [1], recovery: 'noop' }
`)
    await runReview(diffPath)

    const compCalls = dispatcherMock.calls.filter((c) => c.channelName.startsWith('compensating-'))
    expect(compCalls.length).toBeGreaterThan(0)
    expect(compCalls[0].opts.command).toBe('ollama')
    // Custom compensator channels use the configured channel flags verbatim.
    expect(compCalls[0].opts.flags).toEqual(['run', 'qwen2.5-coder:32b'])
  })
})
