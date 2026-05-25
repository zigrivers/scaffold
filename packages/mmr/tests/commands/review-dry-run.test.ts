import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('mmr review --dry-run (T1-F)', () => {
  let tmpDir: string
  let diffPath: string
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-dry-'))
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

  it('does not dispatch any channels and prints a dry-run banner', async () => {
    vi.resetModules()
    const dispatchSpy = vi.fn()
    const checkInstalledSpy = vi.fn()
    const checkAuthSpy = vi.fn()
    vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: dispatchSpy }))
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: checkInstalledSpy.mockResolvedValue(true),
      checkAuth: checkAuthSpy.mockResolvedValue({ status: 'ok' }),
    }))

    const { reviewCommand } = await import('../../src/commands/review.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await reviewCommand.handler({
      diff: diffPath,
      'dry-run': true,
      _: ['review'],
      $0: 'mmr',
    } as never)

    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    logSpy.mockRestore()
    vi.doUnmock('../../src/core/dispatcher.js')
    vi.doUnmock('../../src/core/auth.js')

    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(checkInstalledSpy).toHaveBeenCalled()
    expect(checkAuthSpy).toHaveBeenCalled()
    expect(output).toMatch(/DRY RUN/i)
    expect(output).toMatch(/Channels that would dispatch:/)
    expect(output).toMatch(/claude/)
    expect(output).toMatch(/Assembled prompt for claude/)
  })

  it('prints prompt wrappers with every placeholder replaced', async () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: local-review',
      '    prompt_wrapper: "before {{prompt}} middle {{prompt}} after"',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))
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

    await reviewCommand.handler({
      diff: diffPath,
      channels: ['local'],
      'dry-run': true,
      _: ['review'],
      $0: 'mmr',
    } as never)

    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    logSpy.mockRestore()
    vi.doUnmock('../../src/core/dispatcher.js')
    vi.doUnmock('../../src/core/auth.js')

    expect(output).toMatch(/before /)
    expect(output).toMatch(/ middle /)
    expect(output).toMatch(/ after/)
    expect(output).not.toMatch(/\{\{prompt\}\}/)
  })

  it('preserves replacement-like tokens from the assembled prompt', async () => {
    fs.writeFileSync(diffPath, [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,1 +1,2 @@',
      ' export const foo = 1',
      "+export const token = '$& $$ $` $\\''",
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: local-review',
      '    prompt_wrapper: "wrapped {{prompt}}"',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))
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

    await reviewCommand.handler({
      diff: diffPath,
      channels: ['local'],
      'dry-run': true,
      _: ['review'],
      $0: 'mmr',
    } as never)

    cwdSpy.mockRestore()
    homeSpy.mockRestore()
    exitSpy.mockRestore()
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    logSpy.mockRestore()
    vi.doUnmock('../../src/core/dispatcher.js')
    vi.doUnmock('../../src/core/auth.js')

    expect(output).toContain("$& $$ $` $\\'")
  })
})
