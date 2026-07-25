import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { renderPlist, createLaunchdBackend } from './launchd.js'
import type { SchedJob } from '../types.js'
import type { ExecResult } from '../exec.js'

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'tests', 'fixtures', 'sched', 'rumble-merge-poller.plist',
)

/** The rumble plist — dogfood evidence from the 2026-07-19 adoption (spec §7:
 *  "The rumble plist becomes the golden test fixture"). */
export function rumbleJob(): SchedJob {
  return {
    name: 'post-merge-poller',
    label: 'com.rumble.merge-poller',
    unitBase: 'scaffold-rumble-merge-poller',
    programArguments: ['/Users/ken/rumble-pickleball/scripts/ops/post-merge-poller.sh'],
    intervalSeconds: 600,
    workingDirectory: '/Users/ken/rumble-pickleball',
    stdoutPath: '/Users/ken/rumble-pickleball/.mq/logs/post-merge-poller.out.log',
    stderrPath: '/Users/ken/rumble-pickleball/.mq/logs/post-merge-poller.err.log',
    environment: {
      PATH: [
        '/Users/ken/.local/share/fnm/aliases/default/bin',
        '/opt/homebrew/opt/openjdk/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
      ].join(':'),
    },
  }
}

describe('renderPlist', () => {
  it('reproduces the rumble golden fixture byte-for-byte', () => {
    expect(renderPlist(rumbleJob())).toBe(fs.readFileSync(FIXTURE, 'utf8'))
  })
  it('escapes XML special characters in strings', () => {
    const job = { ...rumbleJob(), label: 'com.a&b.<x>' }
    const out = renderPlist(job)
    expect(out).toContain('com.a&amp;b.&lt;x&gt;')
    expect(out).not.toContain('com.a&b.<x>')
  })
  it('renders StartInterval as an integer element', () => {
    expect(renderPlist(rumbleJob())).toContain('<key>StartInterval</key>\n  <integer>600</integer>')
  })
})

interface Call { cmd: string; args: string[] }

function fakeExec(script: (call: Call) => ExecResult) {
  const calls: Call[] = []
  const exec = (cmd: string, args: string[]): ExecResult => {
    const call = { cmd, args }
    calls.push(call)
    return script(call)
  }
  return { calls, exec }
}

const OK: ExecResult = { status: 0, stdout: '', stderr: '' }
const FAIL: ExecResult = { status: 1, stdout: '', stderr: 'boom' }

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sched-launchd-'))
}

describe('createLaunchdBackend', () => {
  it('install writes the plist, boots out first (idempotent), bootstraps, then VERIFIES via launchctl print', () => {
    const home = tmpHome()
    const { calls, exec } = fakeExec(() => OK)
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = {
      ...rumbleJob(),
      stdoutPath: path.join(home, '.mq/logs/out.log'),
      stderrPath: path.join(home, '.mq/logs/err.log'),
    }
    const res = be.install(job)
    expect(res.ok).toBe(true)
    expect(res.verified).toBe(true)
    const plist = path.join(home, 'Library', 'LaunchAgents', 'com.rumble.merge-poller.plist')
    expect(fs.readFileSync(plist, 'utf8')).toBe(renderPlist(job))
    expect(calls.map(c => [c.cmd, c.args[0]])).toEqual([
      ['launchctl', 'bootout'],
      ['launchctl', 'bootstrap'],
      ['launchctl', 'print'],
    ])
    expect(calls[0].args).toEqual(['bootout', 'gui/501/com.rumble.merge-poller'])
    expect(calls[1].args).toEqual(['bootstrap', 'gui/501', plist])
    expect(calls[2].args).toEqual(['print', 'gui/501/com.rumble.merge-poller'])
  })
  it('install tolerates bootout failure (not loaded yet) but fails when bootstrap fails', () => {
    const home = tmpHome()
    const { exec } = fakeExec(c => (c.args[0] === 'bootstrap' ? FAIL : OK))
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = {
      ...rumbleJob(),
      stdoutPath: path.join(home, '.mq/logs/out.log'),
      stderrPath: path.join(home, '.mq/logs/err.log'),
    }
    const res = be.install(job)
    expect(res.ok).toBe(false)
    expect(res.messages.join('\n')).toMatch(/bootstrap failed/)
  })
  it('install fails verification when launchctl print reports the job absent', () => {
    const home = tmpHome()
    const { exec } = fakeExec(c => (c.args[0] === 'print' ? FAIL : OK))
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = {
      ...rumbleJob(),
      stdoutPath: path.join(home, '.mq/logs/out.log'),
      stderrPath: path.join(home, '.mq/logs/err.log'),
    }
    const res = be.install(job)
    expect(res.ok).toBe(false)
    expect(res.verified).toBe(false)
    expect(res.messages.join('\n')).toMatch(/did not load/)
  })
  it('uninstall boots out and removes the plist', () => {
    const home = tmpHome()
    const { calls, exec } = fakeExec(() => OK)
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = {
      ...rumbleJob(),
      stdoutPath: path.join(home, '.mq/logs/out.log'),
      stderrPath: path.join(home, '.mq/logs/err.log'),
    }
    be.install(job)
    const plist = be.unitPaths(job)[0]
    expect(fs.existsSync(plist)).toBe(true)
    const res = be.uninstall(job)
    expect(res.ok).toBe(true)
    expect(fs.existsSync(plist)).toBe(false)
    expect(calls.filter(c => c.args[0] === 'bootout').length).toBe(2)
  })
  it('status reports installed/loaded and the stdout-log heartbeat', () => {
    const home = tmpHome()
    const { exec } = fakeExec(c => (c.args[0] === 'print' ? OK : OK))
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = { ...rumbleJob(), stdoutPath: path.join(home, 'out.log'), stderrPath: path.join(home, 'err.log') }
    be.install(job)
    fs.writeFileSync(job.stdoutPath, 'ran\n')
    const st = be.status(job)
    expect(st.installed).toBe(true)
    expect(st.loaded).toBe(true)
    expect(st.lastRunAt).not.toBeNull()
  })
  it('status distinguishes plist-present-but-NOT-loaded (file presence proves nothing)', () => {
    const home = tmpHome()
    const installed = false
    const { exec } = fakeExec(c => {
      if (c.args[0] === 'print') return installed ? OK : FAIL
      return OK
    })
    const be = createLaunchdBackend({ exec, home, uid: 501 })
    const job = {
      ...rumbleJob(),
      stdoutPath: path.join(home, '.mq/logs/out.log'),
      stderrPath: path.join(home, '.mq/logs/err.log'),
    }
    be.install(job) // print fails during install verify — plist still on disk
    const st = be.status(job)
    expect(st.installed).toBe(true)
    expect(st.loaded).toBe(false)
    expect(st.detail).toMatch(/NOT loaded/)
  })
})
