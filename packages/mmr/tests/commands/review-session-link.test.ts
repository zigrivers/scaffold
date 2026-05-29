import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { restoreEnv } from '../helpers/env.js'
const originalHome = process.env.HOME
const originalMmrHome = process.env.MMR_HOME

afterEach(() => {
  restoreEnv('HOME', originalHome)
  restoreEnv('MMR_HOME', originalMmrHome)
  vi.restoreAllMocks()
})

describe('review - auto-link to session', () => {
  it('auto-creates the session and appends the job on first review', async () => {
    vi.resetModules()
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-link-'))
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
    try {
      await reviewCommand.handler({
        diff: diffPath,
        channels: ['local'],
        session: 'feat-foo',
        round: 1,
        trustProjectConfig: true,
        _: ['review'],
        $0: 'mmr',
      } as never)
      const sessionFile = path.join(tmpHome, '.mmr', 'sessions', 'feat-foo.json')
      expect(fs.existsSync(sessionFile)).toBe(true)
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) as {
        session_id: string
        jobs: string[]
        rounds: number
      }
      expect(session.session_id).toBe('feat-foo')
      expect(session.jobs).toHaveLength(1)
      expect(session.rounds).toBe(1)
      expect(dispatchSpy).toHaveBeenCalledOnce()
    } finally {
      vi.doUnmock('../../src/core/dispatcher.js')
      vi.doUnmock('../../src/core/auth.js')
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })
})
