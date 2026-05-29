import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// Drives reviewCommand.handler directly (CI does not build packages/mmr/dist).
// dispatcher/auth are mocked so a real review never runs; process.exit is
// trapped to capture the exit code; console.log is captured for the JSON
// output the trust gate annotates.

const LOCAL_CHANNEL_YAML = [
  'version: 1',
  'channels:',
  '  local:',
  '    command: local-review',
  '    auth:',
  '      check: "true"',
  '      failure_exit_codes: [1]',
  '      recovery: "x"',
  '',
].join('\n')

const KEY = 'b'.repeat(40)

function initRepo(withConfig: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-trust-int-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' })
  fs.writeFileSync(path.join(dir, 'README.md'), 'hi')
  if (withConfig) fs.writeFileSync(path.join(dir, '.mmr.yaml'), LOCAL_CHANNEL_YAML)
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' })
  return dir
}

const originalHome = process.env.HOME

afterEach(() => {
  process.env.HOME = originalHome
  vi.restoreAllMocks()
})

/** Run the review handler with --sync, returning the parsed JSON output + exit code. */
async function runReview(args: Record<string, unknown>, dirs: { cwd: string; home: string }): Promise<{
  output: Record<string, unknown> | undefined
  exited: number | undefined
}> {
  vi.resetModules()
  process.env.HOME = dirs.home
  delete process.env.MMR_HOME
  // Mock dispatch to record a clean, completed channel with no findings, so
  // the pipeline's own verdict is `pass` and the trust gate is what we observe.
  vi.doMock('../../src/core/dispatcher.js', () => ({
    dispatchChannel: vi.fn().mockImplementation(
      async (store: { saveChannelOutput: (j: string, n: string, o: string) => void; updateChannel: (j: string, n: string, u: unknown) => void }, jobId: string, name: string) => {
        store.saveChannelOutput(jobId, name, JSON.stringify({ findings: [] }))
        store.updateChannel(jobId, name, {
          status: 'completed',
          started_at: '2026-05-22T00:00:00Z',
          completed_at: '2026-05-22T00:00:01Z',
          output_parser: 'default',
        })
      },
    ),
  }))
  vi.doMock('../../src/core/auth.js', () => ({
    checkInstalled: vi.fn().mockResolvedValue(true),
    checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
  }))
  const { reviewCommand } = await import('../../src/commands/review.js')
  vi.spyOn(process, 'cwd').mockReturnValue(dirs.cwd)
  const logs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { logs.push(String(m)) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const prevExitCode = process.exitCode
  process.exitCode = undefined
  let exited: number | undefined
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exited = code ?? 0
    throw new Error('process.exit')
  }) as never)
  try {
    await (reviewCommand.handler as (a: unknown) => Promise<void>)({
      sync: true,
      format: 'json',
      channels: ['local'],
      _: ['review'],
      $0: 'mmr',
      ...args,
    })
  } catch (e) {
    if ((e as Error).message !== 'process.exit') throw e
  } finally {
    vi.doUnmock('../../src/core/dispatcher.js')
    vi.doUnmock('../../src/core/auth.js')
  }
  // The trust gate exits via exitCode+return (no process.exit), so fall back to
  // process.exitCode when the exit mock wasn't triggered.
  if (exited === undefined && typeof process.exitCode === 'number') exited = process.exitCode
  process.exitCode = prevExitCode
  const json = logs.find((l) => l.trim().startsWith('{'))
  return { output: json ? (JSON.parse(json) as Record<string, unknown>) : undefined, exited }
}

function writeDiff(dir: string, name: string, body: string): string {
  const fp = path.join(dir, name)
  fs.writeFileSync(fp, body)
  return fp
}

describe('mmr review trust-boundary integration', () => {
  it('annotates trust_mode=non-git when reviewing outside a Git repo', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-non-git-'))
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-int-home-'))
    try {
      const diffFile = writeDiff(plain, 'changes.patch', 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n')
      // non-git → no project config; trust the working tree so the local
      // channel loads for this controlled dir.
      fs.writeFileSync(path.join(plain, '.mmr.yaml'), LOCAL_CHANNEL_YAML)
      const { output } = await runReview(
        { diff: diffFile, trustProjectConfig: true },
        { cwd: plain, home },
      )
      expect(output?.trust_mode).toBe('non-git')
    } finally {
      fs.rmSync(plain, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('forces needs-user-decision when the diff adds a .mmr/acks file (no --accept-new-acks)', async () => {
    const dir = initRepo(true)
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-int-home-'))
    try {
      const diffFile = writeDiff(
        dir,
        'add-ack.patch',
        `diff --git a/.mmr/acks/${KEY}.json b/.mmr/acks/${KEY}.json\nnew file mode 100644\n--- /dev/null\n+++ b/.mmr/acks/${KEY}.json\n@@ -0,0 +1 @@\n+{}\n`,
      )
      const { output, exited } = await runReview({ diff: diffFile, base: 'HEAD' }, { cwd: dir, home })
      expect(output?.trust_mode).toBe('base-ref')
      expect(output?.verdict).toBe('needs-user-decision')
      expect(output?.proposed_acks).toHaveLength(1)
      expect(exited).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('does not force a decision for the ack diff when --accept-new-acks is set', async () => {
    const dir = initRepo(true)
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-int-home-'))
    try {
      const diffFile = writeDiff(
        dir,
        'add-ack.patch',
        `diff --git a/.mmr/acks/${KEY}.json b/.mmr/acks/${KEY}.json\nnew file mode 100644\n--- /dev/null\n+++ b/.mmr/acks/${KEY}.json\n@@ -0,0 +1 @@\n+{}\n`,
      )
      const { output } = await runReview({ diff: diffFile, base: 'HEAD', acceptNewAcks: true }, { cwd: dir, home })
      expect(output?.trust_mode).toBe('base-ref')
      expect(output?.verdict).not.toBe('needs-user-decision')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('fires the gate unconditionally — without --sync and under --dry-run (no bypass)', async () => {
    const dir = initRepo(true)
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-int-home-'))
    try {
      const diffFile = writeDiff(
        dir,
        'add-ack.patch',
        `diff --git a/.mmr/acks/${KEY}.json b/.mmr/acks/${KEY}.json\nnew file mode 100644\n--- /dev/null\n+++ b/.mmr/acks/${KEY}.json\n@@ -0,0 +1 @@\n+{}\n`,
      )
      // Default (no --sync): the gate must still fire.
      const noSync = await runReview({ diff: diffFile, base: 'HEAD', sync: false }, { cwd: dir, home })
      expect(noSync.output?.verdict).toBe('needs-user-decision')
      expect(noSync.exited).toBe(2)
      // --dry-run: the gate must still fire (not just preview).
      const dryRun = await runReview({ diff: diffFile, base: 'HEAD', 'dry-run': true }, { cwd: dir, home })
      expect(dryRun.output?.verdict).toBe('needs-user-decision')
      expect(dryRun.exited).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('forces needs-user-decision when the diff modifies .mmr.yaml (no --trust-project-config)', async () => {
    const dir = initRepo(true)
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-int-home-'))
    try {
      const diffFile = writeDiff(
        dir,
        'cfg.patch',
        'diff --git a/.mmr.yaml b/.mmr.yaml\n--- a/.mmr.yaml\n+++ b/.mmr.yaml\n@@ -1,2 +1,4 @@\n version: 1\n channels:\n+  evil:\n+    command: x\n',
      )
      const { output } = await runReview({ diff: diffFile, base: 'HEAD' }, { cwd: dir, home })
      expect(output?.verdict).toBe('needs-user-decision')
      expect(output?.proposed_config_change).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
