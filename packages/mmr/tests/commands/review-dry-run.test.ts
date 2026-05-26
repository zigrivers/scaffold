import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { MmrConfigParsed } from '../../src/config/schema.js'

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

  it('sets a failing exit code when no channel would dispatch', async () => {
    vi.resetModules()
    vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: vi.fn() }))
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: vi.fn().mockResolvedValue(false),
      checkAuth: vi.fn(),
    }))

    const { reviewCommand } = await import('../../src/commands/review.js')
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(tmpDir)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const previousExitCode = process.exitCode
    process.exitCode = undefined

    await reviewCommand.handler({
      diff: diffPath,
      channels: ['claude'],
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
    const dryRunExitCode = process.exitCode
    process.exitCode = previousExitCode

    expect(output).toMatch(/Channels that would dispatch: \(none\)/)
    expect(output).toMatch(/claude: not_installed/)
    expect(dryRunExitCode).toBe(1)
  })
})

describe('configured compensator availability', () => {
  const baseConfig: MmrConfigParsed = {
    version: 1,
    defaults: {
      fix_threshold: 'P2',
      timeout: 300,
      format: 'json',
      parallel: true,
      job_retention_days: 7,
    },
    channels: {},
  }

  it('does not run auth checks for the default claude fallback compensator', async () => {
    vi.resetModules()
    const checkInstalledSpy = vi.fn()
    const checkAuthSpy = vi.fn()
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: checkInstalledSpy,
      checkAuth: checkAuthSpy,
    }))

    const { checkConfiguredCompensatorAvailability } = await import('../../src/commands/review.js')
    const result = await checkConfiguredCompensatorAvailability(baseConfig)

    vi.doUnmock('../../src/core/auth.js')

    expect(result).toEqual({ status: 'ok', auth: 'ok' })
    expect(checkInstalledSpy).not.toHaveBeenCalled()
    expect(checkAuthSpy).not.toHaveBeenCalled()
  })

  it('reports not_installed for a configured compensator channel missing from PATH', async () => {
    vi.resetModules()
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: vi.fn().mockResolvedValue(false),
      checkAuth: vi.fn(),
    }))

    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'qwen-local' } },
      channels: {
        'qwen-local': {
          enabled: true,
          command: 'qwen-review',
          flags: [],
          env: {},
          auth: { check: 'qwen-review auth', timeout: 5, failure_exit_codes: [1], recovery: 'login' },
          prompt_wrapper: '{{prompt}}',
          output_parser: 'default',
          stderr: 'capture',
          abstract: false,
        },
      },
    }

    const { checkConfiguredCompensatorAvailability } = await import('../../src/commands/review.js')
    const result = await checkConfiguredCompensatorAvailability(cfg)

    vi.doUnmock('../../src/core/auth.js')

    expect(result.status).toBe('not_installed')
    expect(result.auth).toBe('failed')
    expect(result.recovery).toContain('qwen-review not found')
  })

  it('allows a disabled configured compensator channel when explicitly referenced', async () => {
    vi.resetModules()
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: vi.fn().mockResolvedValue(true),
      checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
    }))

    const { checkConfiguredCompensatorAvailability } = await import('../../src/commands/review.js')
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'qwen-local' } },
      channels: {
        'qwen-local': {
          enabled: false,
          command: 'qwen-review',
          flags: [],
          env: {},
          auth: { check: 'qwen-review auth', timeout: 5, failure_exit_codes: [1], recovery: 'login' },
          prompt_wrapper: '{{prompt}}',
          output_parser: 'default',
          stderr: 'capture',
          abstract: false,
        },
      },
    }

    const result = await checkConfiguredCompensatorAvailability(cfg)

    vi.doUnmock('../../src/core/auth.js')

    expect(result.status).toBe('ok')
    expect(result.auth).toBe('ok')
  })

  it('dispatches configured compensators when auth is skipped', async () => {
    vi.resetModules()
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: vi.fn().mockResolvedValue(true),
      checkAuth: vi.fn().mockResolvedValue({ status: 'skipped' }),
    }))

    const { checkConfiguredCompensatorAvailability } = await import('../../src/commands/review.js')
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'qwen-local' } },
      channels: {
        'qwen-local': {
          enabled: true,
          command: 'qwen-review',
          flags: [],
          env: {},
          prompt_wrapper: '{{prompt}}',
          output_parser: 'default',
          stderr: 'capture',
          abstract: false,
        },
      },
    }

    const result = await checkConfiguredCompensatorAvailability(cfg)

    vi.doUnmock('../../src/core/auth.js')

    expect(result.status).toBe('ok')
    expect(result.auth).toBe('skipped')
  })
})
