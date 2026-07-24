import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { schedHandler, type SchedArgs } from './sched.js'
import type { SchedBackend, SchedJob } from '../../sched/types.js'

function fakeJob(root: string): SchedJob {
  return {
    name: 'post-merge-poller',
    label: 'com.p.merge-poller',
    unitBase: 'scaffold-p-merge-poller',
    programArguments: [path.join(root, 'scripts/ops/post-merge-poller.sh')],
    intervalSeconds: 600,
    workingDirectory: root,
    stdoutPath: path.join(root, '.mq/logs/out.log'),
    stderrPath: path.join(root, '.mq/logs/err.log'),
    environment: { PATH: '/usr/bin:/bin' },
  }
}

function fakeBackend(overrides: Partial<SchedBackend> = {}): SchedBackend & { installs: SchedJob[] } {
  const installs: SchedJob[] = []
  return {
    installs,
    platform: 'launchd',
    unitPaths: () => ['/tmp/x.plist'],
    install: job => {
      installs.push(job)
      return { ok: true, verified: true, messages: ['installed'] }
    },
    uninstall: () => ({ ok: true, verified: true, messages: ['removed'] }),
    status: () => ({ installed: true, loaded: true, lastRunAt: null, detail: 'loaded' }),
    ...overrides,
  }
}

function argv(partial: Partial<SchedArgs>): SchedArgs {
  return { action: 'list', ...partial } as SchedArgs
}

describe('schedHandler', () => {
  it('install builds the named job (honoring --interval) and calls backend.install', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    const be = fakeBackend()
    await schedHandler(argv({ action: 'install', job: 'post-merge-poller', interval: 120, root }), {
      backend: be,
      buildJob: (name, projectRoot, opts) => ({
        ...fakeJob(projectRoot), name, intervalSeconds: opts.intervalSeconds ?? 600,
      }),
    })
    expect(be.installs.length).toBe(1)
    expect(be.installs[0].intervalSeconds).toBe(120)
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
  it('install exits non-zero when the backend fails verification', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    const be = fakeBackend({
      install: () => ({ ok: false, verified: false, messages: ['job did not load'] }),
    })
    await schedHandler(argv({ action: 'install', job: 'post-merge-poller', root }), {
      backend: be,
      buildJob: (name, projectRoot) => ({ ...fakeJob(projectRoot), name }),
    })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('rejects an unknown job with the registry names', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    await schedHandler(argv({ action: 'install', job: 'nope', root }), { backend: fakeBackend() })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('status exits 0 when loaded, 1 when not loaded', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    const loaded = fakeBackend()
    await schedHandler(argv({ action: 'status', job: 'post-merge-poller', root }), {
      backend: loaded,
      buildJob: (name, projectRoot) => ({ ...fakeJob(projectRoot), name }),
    })
    expect(process.exitCode ?? 0).toBe(0)
    const notLoaded = fakeBackend({
      status: () => ({ installed: true, loaded: false, lastRunAt: null, detail: 'plist present but NOT loaded' }),
    })
    await schedHandler(argv({ action: 'status', job: 'post-merge-poller', root }), {
      backend: notLoaded,
      buildJob: (name, projectRoot) => ({ ...fakeJob(projectRoot), name }),
    })
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
  it('list renders every registry job, tolerating unbuildable jobs', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-cli-'))
    const info = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await schedHandler(argv({ action: 'list', root }), { backend: fakeBackend() })
    const out = info.mock.calls.map(c => String(c[0])).join('')
    info.mockRestore()
    expect(out).toContain('post-merge-poller')
    expect(process.exitCode ?? 0).toBe(0)
    process.exitCode = 0
  })
})
