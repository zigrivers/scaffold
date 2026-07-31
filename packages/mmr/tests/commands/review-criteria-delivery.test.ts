import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * Guards the claim the calibration docs make: `review_criteria` from a
 * project `.mmr.yaml` reaches the text every channel is handed — but ONLY
 * when the project config is trusted for that invocation.
 *
 * The trust rule is not incidental to calibration, it is the whole gotcha:
 * `--diff` classifies as `untrusted-head` (trust-mode.ts), which maps to
 * `skipProjectConfig: true` (review.ts), which drops `.mmr.yaml` entirely.
 * A project that writes calibration criteria and reviews with `--diff` gets
 * silence, not an error. These tests pin both directions so the docs cannot
 * drift away from the behavior.
 *
 * The temp dir is `git init`-ed on purpose. Without a `.git`, classifyTrustMode
 * returns `non-git` rather than `untrusted-head` — both route to
 * `skipProjectConfig: true`, so the assertions would still pass while testing a
 * different branch than the docs describe, and a future change that diverged
 * the two branches would slip through.
 *
 * --dry-run prints the fully assembled per-channel prompt, so it is the exact
 * byte-level evidence of what the model receives.
 */

const SENTINEL = 'CALIBRATION_SENTINEL_do_not_reword'

async function runDryRun(
  tmpDir: string,
  diffPath: string,
  extraArgs: Record<string, unknown>,
): Promise<{ stdout: string; stderr: string; exitCode: number | string | undefined }> {
  vi.resetModules()
  vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: vi.fn() }))
  // checkHttpAuth is unused on the dry-run + subprocess-channel path these
  // tests take, but review.ts imports it from the same module. Mocking the
  // full export surface keeps a future http-channel or compensator-probing
  // test from failing as "checkHttpAuth is not a function" for no visible
  // reason.
  vi.doMock('../../src/core/auth.js', () => ({
    checkInstalled: vi.fn().mockResolvedValue(true),
    checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
    checkHttpAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
  }))

  const { reviewCommand } = await import('../../src/commands/review.js')
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  // Every route to stderr, not just console.error: console.warn also lands
  // there, and a direct process.stderr.write would bypass both. The docs claim
  // this path is silent, so the test has to watch all of them or the claim can
  // become false without failing anything.
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const writes: string[] = []
  const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    writes.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }) as never)
  const previousExitCode = process.exitCode
  process.exitCode = undefined

  await reviewCommand.handler({
    diff: diffPath,
    channels: ['claude'],
    'dry-run': true,
    ...extraArgs,
    _: ['review'],
    $0: 'mmr',
  } as never)

  const stdout = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
  const stderr = [
    ...errSpy.mock.calls.map((c) => c.join(' ')),
    ...warnSpy.mock.calls.map((c) => c.join(' ')),
    ...writes,
  ].join('\n')
  const exitCode = process.exitCode
  cwdSpy.mockRestore()
  homeSpy.mockRestore()
  exitSpy.mockRestore()
  logSpy.mockRestore()
  errSpy.mockRestore()
  warnSpy.mockRestore()
  writeSpy.mockRestore()
  process.exitCode = previousExitCode
  vi.doUnmock('../../src/core/dispatcher.js')
  vi.doUnmock('../../src/core/auth.js')
  return { stdout, stderr, exitCode }
}

describe('review_criteria delivery to the dispatched prompt', () => {
  let tmpDir: string
  let diffPath: string

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-criteria-')))
    execFileSync('git', ['init', '-q'], { cwd: tmpDir, stdio: 'ignore' })
    diffPath = path.join(tmpDir, 'sample.diff')
    fs.writeFileSync(diffPath, [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,1 +1,2 @@',
      ' export const foo = 1',
      '+export const bar = 2',
      '',
    ].join('\n'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  function writeProjectConfig(): void {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'review_criteria:',
      `  - "${SENTINEL}"`,
    ].join('\n'))
  }

  it('reaches the dispatched prompt when the project config is trusted', async () => {
    writeProjectConfig()
    const { stdout } = await runDryRun(tmpDir, diffPath, { trustProjectConfig: true })

    expect(stdout).toContain('## Project Review Criteria')
    expect(stdout).toContain(SENTINEL)
  })

  it('is placed after the core prompt and before the diff', async () => {
    writeProjectConfig()
    const { stdout } = await runDryRun(tmpDir, diffPath, { trustProjectConfig: true })

    const coreIdx = stdout.indexOf('## Severity Definitions')
    const criteriaIdx = stdout.indexOf(SENTINEL)
    const diffIdx = stdout.indexOf('## Diff')
    expect(coreIdx).toBeGreaterThanOrEqual(0)
    expect(criteriaIdx).toBeGreaterThan(coreIdx)
    expect(diffIdx).toBeGreaterThan(criteriaIdx)
  })

  it('is silently dropped under --diff without a trust opt-in', async () => {
    // This is the documented gotcha, not a bug: --diff is untrusted-head, so
    // the project .mmr.yaml is never read. It fails silently — no warning, no
    // non-zero exit — which is exactly why the calibration docs must lead with
    // the trust flag.
    writeProjectConfig()
    const { stdout, stderr, exitCode } = await runDryRun(tmpDir, diffPath, {})

    expect(stdout).toContain('## Severity Definitions')
    expect(stdout).not.toContain('## Project Review Criteria')
    expect(stdout).not.toContain(SENTINEL)
    // "Silently" is the load-bearing word in the docs, so assert the silence
    // rather than only the absence: no warning naming the config or criteria,
    // and no failing exit code. If MMR ever starts warning here, the docs are
    // what has to change, and this assertion is what says so.
    expect(stderr).not.toMatch(/\.mmr\.yaml|criteria/i)
    expect(exitCode === undefined || exitCode === 0).toBe(true)
  })

  it('leaves the prompt byte-identical for a project with no review_criteria', async () => {
    // The no-config default must not shift: a project that never opts in sees
    // exactly the prompt it saw before calibration existed.
    const withoutConfig = await runDryRun(tmpDir, diffPath, { trustProjectConfig: true })

    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), 'version: 1\n')
    const withEmptyConfig = await runDryRun(tmpDir, diffPath, { trustProjectConfig: true })

    expect(withEmptyConfig.stdout).toBe(withoutConfig.stdout)
    expect(withoutConfig.stdout).not.toContain('## Project Review Criteria')
    expect(withoutConfig.stdout).not.toContain('## Template Criteria')
  })
})
