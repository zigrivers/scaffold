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
    vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: dispatchSpy }))
    // Force auth to pass without actually running CLIs.
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: async () => true,
      checkAuth: async () => ({ status: 'ok' }),
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
    expect(output).toMatch(/DRY RUN/i)
    expect(output).toMatch(/Channels that would dispatch:/)
    expect(output).toMatch(/claude/)
    expect(output).toMatch(/Assembled prompt for claude/)
  })
})
