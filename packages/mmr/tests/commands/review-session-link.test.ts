import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { restoreEnv } from '../helpers/env.js'
const originalHome = process.env.HOME
const originalMmrHome = process.env.MMR_HOME
const originalPath = process.env.PATH
const originalExitCode = process.exitCode

afterEach(() => {
  restoreEnv('HOME', originalHome)
  restoreEnv('MMR_HOME', originalMmrHome)
  restoreEnv('PATH', originalPath)
  process.exitCode = originalExitCode
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

  it('rejects an identical session target unless the same round needs a retry', async () => {
    vi.resetModules()
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-link-'))
    const diffPath = path.join(tmpHome, 'sample.diff')
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,1 +1,2 @@',
      ' export const foo = 1',
      '+export const bar = 2',
      '',
    ].join('\n')
    fs.writeFileSync(diffPath, diff)
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

    const { JobStore } = await import('../../src/core/job-store.js')
    const { SessionStore } = await import('../../src/commands/sessions.js')
    const store = new JobStore(path.join(tmpHome, '.mmr', 'jobs'))
    const prior = store.createJob({
      fix_threshold: 'P2', format: 'json', channels: ['local'], session_id: 'feat-foo', round: 1,
    })
    store.saveDiff(prior.job_id, diff)
    const sessionStore = SessionStore.fromHome(tmpHome)
    sessionStore.addJob('feat-foo', prior.job_id, 1)

    const dispatchSpy = vi.fn().mockResolvedValue(undefined)
    vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: dispatchSpy }))
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: vi.fn().mockResolvedValue(true),
      checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
    }))
    const { reviewCommand } = await import('../../src/commands/review.js')
    vi.spyOn(process, 'cwd').mockReturnValue(tmpHome)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((message?: unknown) => { errors.push(String(message)) })
    try {
      await reviewCommand.handler({
        diff: diffPath,
        channels: ['local'],
        session: 'feat-foo',
        round: 2,
        trustProjectConfig: true,
        _: ['review'],
        $0: 'mmr',
      } as never)
      expect(dispatchSpy).not.toHaveBeenCalled()
      expect(errors.join('\n')).toMatch(/exact review target already dispatched/i)
      expect(process.exitCode).toBe(1)

      process.exitCode = undefined
      await reviewCommand.handler({
        diff: diffPath,
        channels: ['local'],
        session: 'feat-foo',
        round: 2,
        'dry-run': true,
        trustProjectConfig: true,
        _: ['review'],
        $0: 'mmr',
      } as never)
      expect(dispatchSpy).not.toHaveBeenCalled()
      expect(process.exitCode).toBeUndefined()

      fs.writeFileSync(path.join(store.getJobDir(prior.job_id), 'results.json'), JSON.stringify({
        verdict: 'needs-user-decision',
      }))
      await reviewCommand.handler({
        diff: diffPath,
        channels: ['local'],
        session: 'feat-foo',
        round: 1,
        trustProjectConfig: true,
        _: ['review'],
        $0: 'mmr',
      } as never)
      expect(dispatchSpy).toHaveBeenCalledOnce()

      const retriedJob = sessionStore.show('feat-foo')?.jobs.at(-1)
      expect(retriedJob).toBeDefined()
      fs.writeFileSync(path.join(store.getJobDir(retriedJob!), 'results.json'), JSON.stringify({
        verdict: 'needs-user-decision',
      }))
      await reviewCommand.handler({
        diff: diffPath,
        channels: ['local'],
        session: 'feat-foo',
        round: 1,
        trustProjectConfig: true,
        _: ['review'],
        $0: 'mmr',
      } as never)
      expect(dispatchSpy).toHaveBeenCalledOnce()

      const earlierCycle = store.createJob({
        fix_threshold: 'P2', format: 'json', channels: ['local'], session_id: 'feat-cycle-1', round: 1,
      })
      store.saveDiff(earlierCycle.job_id, diff)
      sessionStore.addJob('feat-cycle-1', earlierCycle.job_id, 1)
      await reviewCommand.handler({
        diff: diffPath,
        channels: ['local'],
        session: 'feat-cycle-2',
        round: 1,
        trustProjectConfig: true,
        _: ['review'],
        $0: 'mmr',
      } as never)
      expect(dispatchSpy).toHaveBeenCalledOnce()
    } finally {
      vi.doUnmock('../../src/core/dispatcher.js')
      vi.doUnmock('../../src/core/auth.js')
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })

  it('allows the same patch on a new exact PR head', async () => {
    vi.resetModules()
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-link-head-'))
    const binDir = path.join(tmpHome, 'bin')
    fs.mkdirSync(binDir)
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
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,1 +1,2 @@',
      ' export const foo = 1',
      '+export const bar = 2',
      '',
    ].join('\n')
    const fakeGh = path.join(binDir, 'gh')
    fs.writeFileSync(fakeGh, `#!/bin/sh
case "$*" in
  "pr diff 7") printf '%s' "$MMR_TEST_DIFF" ;;
  "pr view 7 --json baseRefName") printf '%s\\n' '{"baseRefName":"main"}' ;;
  "pr view 7 --json url,headRefOid")
    count=0
    [ -f "$MMR_TEST_HEAD_COUNT" ] && count=$(sed -n '1p' "$MMR_TEST_HEAD_COUNT")
    count=$((count + 1))
    printf '%s\\n' "$count" > "$MMR_TEST_HEAD_COUNT"
    if [ "$MMR_TEST_HEAD_CHANGE" = "1" ] && [ "$count" -gt 1 ]; then
      printf '%s\\n' '{"url":"https://github.com/acme/app/pull/7","headRefOid":"cccccccccccccccccccccccccccccccccccccccc"}'
    else
      printf '%s\\n' '{"url":"https://github.com/acme/app/pull/7","headRefOid":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'
    fi
    ;;
  *) exit 1 ;;
esac
`)
    fs.chmodSync(fakeGh, 0o755)
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: tmpHome })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpHome })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpHome })
    execFileSync('git', ['add', '.mmr.yaml'], { cwd: tmpHome })
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: tmpHome })
    process.env.HOME = tmpHome
    delete process.env.MMR_HOME
    process.env.PATH = `${binDir}:${originalPath ?? ''}`
    process.env.MMR_TEST_DIFF = diff
    process.env.MMR_TEST_HEAD_COUNT = path.join(tmpHome, 'head-count')

    const { JobStore } = await import('../../src/core/job-store.js')
    const { SessionStore } = await import('../../src/commands/sessions.js')
    const store = new JobStore(path.join(tmpHome, '.mmr', 'jobs'))
    const prior = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['local'],
      session_id: 'pr-app-7-cycle-1',
      round: 1,
      review_target: 'https://github.com/acme/app/pull/7@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })
    store.saveDiff(prior.job_id, diff)
    SessionStore.fromHome(tmpHome).addJob('pr-app-7-cycle-1', prior.job_id, 1)

    const dispatchSpy = vi.fn().mockResolvedValue(undefined)
    vi.doMock('../../src/core/dispatcher.js', () => ({ dispatchChannel: dispatchSpy }))
    vi.doMock('../../src/core/auth.js', () => ({
      checkInstalled: vi.fn().mockResolvedValue(true),
      checkAuth: vi.fn().mockResolvedValue({ status: 'ok' }),
    }))
    const { reviewCommand } = await import('../../src/commands/review.js')
    vi.spyOn(process, 'cwd').mockReturnValue(tmpHome)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((message?: unknown) => { errors.push(String(message)) })
    try {
      await reviewCommand.handler({
        pr: 7,
        channels: ['local'],
        session: 'pr-app-7-cycle-2',
        round: 1,
        trustProjectConfig: true,
        _: ['review'],
        $0: 'mmr',
      } as never)
      expect(dispatchSpy).toHaveBeenCalledOnce()

      fs.rmSync(process.env.MMR_TEST_HEAD_COUNT, { force: true })
      process.env.MMR_TEST_HEAD_CHANGE = '1'
      process.exitCode = undefined
      await reviewCommand.handler({
        pr: 7,
        channels: ['local'],
        session: 'pr-app-7-cycle-3',
        round: 1,
        trustProjectConfig: true,
        _: ['review'],
        $0: 'mmr',
      } as never)
      expect(dispatchSpy).toHaveBeenCalledOnce()
      expect(errors.join('\n')).toMatch(/head changed while its diff was being captured/i)
      expect(process.exitCode).toBe(1)
    } finally {
      delete process.env.MMR_TEST_DIFF
      delete process.env.MMR_TEST_HEAD_COUNT
      delete process.env.MMR_TEST_HEAD_CHANGE
      vi.doUnmock('../../src/core/dispatcher.js')
      vi.doUnmock('../../src/core/auth.js')
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })
})
