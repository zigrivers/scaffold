import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
 * --dry-run prints the fully assembled per-channel prompt, so it is the exact
 * byte-level evidence of what the model receives.
 */

const SENTINEL = 'CALIBRATION_SENTINEL_do_not_reword'

async function runDryRun(
  tmpDir: string,
  diffPath: string,
  extraArgs: Record<string, unknown>,
): Promise<string> {
  vi.resetModules()
  vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: vi.fn() }))
  vi.doMock('../../src/core/auth.js', () => ({
    checkInstalled: vi.fn().mockResolvedValue(true),
    checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
  }))

  const { reviewCommand } = await import('../../src/commands/review.js')
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const previousExitCode = process.exitCode

  await reviewCommand.handler({
    diff: diffPath,
    channels: ['claude'],
    'dry-run': true,
    ...extraArgs,
    _: ['review'],
    $0: 'mmr',
  } as never)

  const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
  cwdSpy.mockRestore()
  homeSpy.mockRestore()
  exitSpy.mockRestore()
  logSpy.mockRestore()
  errSpy.mockRestore()
  process.exitCode = previousExitCode
  vi.doUnmock('../../src/core/dispatcher.js')
  vi.doUnmock('../../src/core/auth.js')
  return output
}

describe('review_criteria delivery to the dispatched prompt', () => {
  let tmpDir: string
  let diffPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-criteria-'))
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
    const output = await runDryRun(tmpDir, diffPath, { trustProjectConfig: true })

    expect(output).toContain('## Project Review Criteria')
    expect(output).toContain(SENTINEL)
  })

  it('is placed after the core prompt and before the diff', async () => {
    writeProjectConfig()
    const output = await runDryRun(tmpDir, diffPath, { trustProjectConfig: true })

    const coreIdx = output.indexOf('## Severity Definitions')
    const criteriaIdx = output.indexOf(SENTINEL)
    const diffIdx = output.indexOf('## Diff')
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
    const output = await runDryRun(tmpDir, diffPath, {})

    expect(output).toContain('## Severity Definitions')
    expect(output).not.toContain('## Project Review Criteria')
    expect(output).not.toContain(SENTINEL)
  })

  it('leaves the prompt byte-identical for a project with no review_criteria', async () => {
    // The no-config default must not shift: a project that never opts in sees
    // exactly the prompt it saw before calibration existed.
    const withoutConfig = await runDryRun(tmpDir, diffPath, { trustProjectConfig: true })

    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), 'version: 1\n')
    const withEmptyConfig = await runDryRun(tmpDir, diffPath, { trustProjectConfig: true })

    expect(withEmptyConfig).toBe(withoutConfig)
    expect(withoutConfig).not.toContain('## Project Review Criteria')
    expect(withoutConfig).not.toContain('## Template Criteria')
  })
})
