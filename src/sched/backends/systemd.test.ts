import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSystemdBackend, renderService, renderTimer } from './systemd.js'
import type { ExecResult } from '../exec.js'
import type { SchedJob } from '../types.js'

function job(): SchedJob {
  return {
    name: 'post-merge-poller',
    label: 'com.rumble.merge-poller',
    unitBase: 'scaffold-rumble-merge-poller',
    programArguments: ['/home/ken/rumble/scripts/ops/post-merge-poller.sh'],
    intervalSeconds: 600,
    workingDirectory: '/home/ken/rumble',
    stdoutPath: '/home/ken/rumble/.mq/logs/post-merge-poller.out.log',
    stderrPath: '/home/ken/rumble/.mq/logs/post-merge-poller.err.log',
    environment: { PATH: '/usr/local/bin:/usr/bin:/bin' },
  }
}

interface Call { cmd: string; args: string[] }
const OK: ExecResult = { status: 0, stdout: '', stderr: '' }
const FAIL: ExecResult = { status: 1, stdout: '', stderr: 'nope' }

function fakeExec(script: (c: Call) => ExecResult) {
  const calls: Call[] = []
  const exec = (cmd: string, args: string[]): ExecResult => {
    const c = { cmd, args }
    calls.push(c)
    return script(c)
  }
  return { calls, exec }
}

describe('systemd renderers', () => {
  it('renders a oneshot service with WorkingDirectory, Environment, and append: log redirection', () => {
    const svc = renderService(job())
    expect(svc).toContain('[Service]')
    expect(svc).toContain('Type=oneshot')
    expect(svc).toContain('WorkingDirectory=/home/ken/rumble')
    expect(svc).toContain('Environment="PATH=/usr/local/bin:/usr/bin:/bin"')
    expect(svc).toContain('ExecStart="/home/ken/rumble/scripts/ops/post-merge-poller.sh"')
    expect(svc).toContain('StandardOutput=append:/home/ken/rumble/.mq/logs/post-merge-poller.out.log')
    expect(svc).toContain('StandardError=append:/home/ken/rumble/.mq/logs/post-merge-poller.err.log')
  })
  it('renders a timer firing every intervalSeconds, installed into timers.target', () => {
    const t = renderTimer(job())
    expect(t).toContain('[Timer]')
    expect(t).toContain('OnBootSec=60')
    expect(t).toContain('OnUnitActiveSec=600')
    expect(t).toContain('Unit=scaffold-rumble-merge-poller.service')
    expect(t).toContain('WantedBy=timers.target')
  })
})

/** Backend-level tests re-root log paths under the tmp home — job()'s literal
 *  /home/ken/... paths are only for asserting renderer output verbatim; the
 *  backend actually mkdirs log dirs, and tests must stay hermetic (never
 *  touch the real filesystem outside the tmp home). */
function backendJob(home: string): SchedJob {
  return {
    ...job(),
    stdoutPath: path.join(home, '.mq', 'logs', 'post-merge-poller.out.log'),
    stderrPath: path.join(home, '.mq', 'logs', 'post-merge-poller.err.log'),
  }
}

describe('createSystemdBackend', () => {
  it(
    'install writes both units, daemon-reloads, enables linger (best-effort), enables --now, ' +
    'and verifies is-active',
    () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-systemd-'))
      const { calls, exec } = fakeExec(() => OK)
      const be = createSystemdBackend({ exec, home, user: 'ken' })
      const res = be.install(backendJob(home))
      expect(res.ok).toBe(true)
      expect(res.verified).toBe(true)
      const unitDir = path.join(home, '.config', 'systemd', 'user')
      expect(fs.existsSync(path.join(unitDir, 'scaffold-rumble-merge-poller.service'))).toBe(true)
      expect(fs.existsSync(path.join(unitDir, 'scaffold-rumble-merge-poller.timer'))).toBe(true)
      expect(calls.map(c => `${c.cmd} ${c.args.join(' ')}`)).toEqual([
        'systemctl --user daemon-reload',
        'loginctl enable-linger ken',
        'systemctl --user enable --now scaffold-rumble-merge-poller.timer',
        'systemctl --user is-active scaffold-rumble-merge-poller.timer',
      ])
    },
  )
  it('reports linger failure as a message without failing the install', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-systemd-'))
    const { exec } = fakeExec(c => (c.cmd === 'loginctl' ? FAIL : OK))
    const be = createSystemdBackend({ exec, home, user: 'ken' })
    const res = be.install(backendJob(home))
    expect(res.ok).toBe(true)
    expect(res.messages.join('\n')).toMatch(/enable-linger failed/)
  })
  it('install fails when the timer is not active after enable', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-systemd-'))
    const { exec } = fakeExec(c => (c.args.includes('is-active') ? FAIL : OK))
    const be = createSystemdBackend({ exec, home, user: 'ken' })
    const res = be.install(backendJob(home))
    expect(res.ok).toBe(false)
    expect(res.verified).toBe(false)
  })
  it('uninstall disables the timer, removes both units, and daemon-reloads', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-systemd-'))
    const { calls, exec } = fakeExec(() => OK)
    const be = createSystemdBackend({ exec, home, user: 'ken' })
    be.install(backendJob(home))
    const res = be.uninstall(backendJob(home))
    expect(res.ok).toBe(true)
    for (const p of be.unitPaths(backendJob(home))) expect(fs.existsSync(p)).toBe(false)
    const cmdline = calls.map(c => `${c.cmd} ${c.args.join(' ')}`)
    expect(cmdline).toContain('systemctl --user disable --now scaffold-rumble-merge-poller.timer')
    expect(cmdline.filter(l => l === 'systemctl --user daemon-reload').length).toBe(2)
  })
})
