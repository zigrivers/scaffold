import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveJobsDir, resolveSessionRoot, isValidSessionId } from '../../src/commands/sessions.js'

const originalHome = process.env.HOME
const originalMmrHome = process.env.MMR_HOME
const originalExitCode = process.exitCode

afterEach(() => {
  process.env.HOME = originalHome
  process.env.MMR_HOME = originalMmrHome
  process.exitCode = originalExitCode
  vi.restoreAllMocks()
})

describe('resolveJobsDir — shared MMR root for jobs', () => {
  it('places jobs under MMR_HOME when set (same root as sessions)', () => {
    process.env.MMR_HOME = '/tmp/custom-mmr'
    expect(resolveJobsDir()).toBe(path.join('/tmp/custom-mmr', 'jobs'))
    // jobs and sessions must resolve under the same root
    expect(resolveJobsDir()).toBe(path.join(resolveSessionRoot(), 'jobs'))
  })

  it('falls back to ~/.mmr/jobs when MMR_HOME is unset', () => {
    delete process.env.MMR_HOME
    process.env.HOME = '/home/tester'
    expect(resolveJobsDir()).toBe(path.join('/home/tester', '.mmr', 'jobs'))
  })

  it('treats an empty/whitespace MMR_HOME as unset (no cwd pollution)', () => {
    process.env.HOME = '/home/tester'
    process.env.MMR_HOME = ''
    expect(resolveJobsDir()).toBe(path.join('/home/tester', '.mmr', 'jobs'))
    process.env.MMR_HOME = '   '
    expect(resolveJobsDir()).toBe(path.join('/home/tester', '.mmr', 'jobs'))
  })

  it('resolves a relative MMR_HOME to an absolute path (no cwd-relative state)', () => {
    process.env.MMR_HOME = 'relative-root'
    const resolved = resolveJobsDir()
    expect(path.isAbsolute(resolved)).toBe(true)
    expect(resolved).toBe(path.join(path.resolve('relative-root'), 'jobs'))
  })
})

describe('isValidSessionId — single source of validation truth', () => {
  it('accepts ordinary ids', () => {
    expect(isValidSessionId('feat-foo')).toBe(true)
    expect(isValidSessionId('abc_123')).toBe(true)
  })

  it('rejects bad characters and reserved/system names that pass the bare regex', () => {
    expect(isValidSessionId('../escape')).toBe(false)
    expect(isValidSessionId('con')).toBe(false)
    expect(isValidSessionId('index')).toBe(false)
    expect(isValidSessionId('__proto__')).toBe(false)
  })
})

describe('review — reserved session id is rejected before any job is created', () => {
  it('does not create an orphaned job for a reserved session name', async () => {
    vi.resetModules()
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-reserved-'))
    const diffPath = path.join(tmpHome, 'sample.diff')
    fs.writeFileSync(diffPath, [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,1 +1,2 @@',
      ' export const foo = 1',
      '+export const bar = 2',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(tmpHome, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: local-review',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))
    process.env.HOME = tmpHome
    delete process.env.MMR_HOME
    const dispatchSpy = vi.fn().mockResolvedValue(undefined)
    vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: dispatchSpy }))
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: vi.fn().mockResolvedValue(true),
      checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
    }))
    const { reviewCommand } = await import('../../src/commands/review.js')
    vi.spyOn(process, 'cwd').mockReturnValue(tmpHome)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Guard against process.exit terminating the worker if the early reject fails.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called')
    }) as never)
    try {
      await reviewCommand.handler({
        diff: diffPath,
        channels: ['local'],
        session: 'con',
        round: 1,
        _: ['review'],
        $0: 'mmr',
      } as never)
      const jobsDir = path.join(tmpHome, '.mmr', 'jobs')
      const created = fs.existsSync(jobsDir) ? fs.readdirSync(jobsDir) : []
      expect(created).toHaveLength(0)
      expect(dispatchSpy).not.toHaveBeenCalled()
      expect(exitSpy).not.toHaveBeenCalled()
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid session id'))
    } finally {
      vi.doUnmock('../../src/core/dispatcher.js')
      vi.doUnmock('../../src/core/auth.js')
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })

  it('removes the created job when session linking fails (no half-linked job)', async () => {
    vi.resetModules()
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-orphan-'))
    const diffPath = path.join(tmpHome, 'sample.diff')
    fs.writeFileSync(diffPath, [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,1 +1,2 @@',
      ' export const foo = 1',
      '+export const bar = 2',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(tmpHome, '.mmr.yaml'), [
      'version: 1',
      'channels:',
      '  local:',
      '    command: local-review',
      '    auth:',
      '      check: "true"',
      '      failure_exit_codes: [1]',
      '      recovery: "x"',
    ].join('\n'))
    process.env.HOME = tmpHome
    delete process.env.MMR_HOME
    vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: vi.fn().mockResolvedValue(true),
      checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
    }))
    // Keep the real validators/resolvers; force addJob to fail mid-link.
    vi.doMock('../../src/commands/sessions.js', async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown>
      return {
        ...actual,
        getSessionStore: () => ({
          show: () => undefined,
          start: () => undefined,
          addJob: () => {
            throw new Error('disk full')
          },
        }),
      }
    })
    const { reviewCommand } = await import('../../src/commands/review.js')
    vi.spyOn(process, 'cwd').mockReturnValue(tmpHome)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // The handler sets process.exitCode and returns (no process.exit), so it
      // can be awaited directly without mocking process-level termination.
      await reviewCommand.handler({
        diff: diffPath,
        channels: ['local'],
        session: 'feat-foo',
        round: 1,
        _: ['review'],
        $0: 'mmr',
      } as never)
      const jobsDir = path.join(tmpHome, '.mmr', 'jobs')
      const remaining = fs.existsSync(jobsDir) ? fs.readdirSync(jobsDir) : []
      expect(remaining).toHaveLength(0)
      expect(process.exitCode).toBe(1)
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('disk full'))
    } finally {
      vi.doUnmock('../../src/core/dispatcher.js')
      vi.doUnmock('../../src/core/auth.js')
      vi.doUnmock('../../src/commands/sessions.js')
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })
})
