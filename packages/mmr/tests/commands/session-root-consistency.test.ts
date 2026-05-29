import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveJobsDir, resolveSessionRoot, isValidSessionId } from '../../src/commands/sessions.js'

const originalHome = process.env.HOME
const originalMmrHome = process.env.MMR_HOME

afterEach(() => {
  process.env.HOME = originalHome
  process.env.MMR_HOME = originalMmrHome
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
})
