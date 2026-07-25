import { describe, expect, it } from 'vitest'
import { fixHookRegistration, fixSchedulerReload } from './ops-fixes.js'
import type { SchedBackend, SchedJob } from '../../sched/types.js'

const JOB: SchedJob = {
  name: 'post-merge-poller',
  label: 'com.p.merge-poller',
  unitBase: 'scaffold-p-merge-poller',
  programArguments: ['/p/scripts/ops/post-merge-poller.sh'],
  intervalSeconds: 600,
  workingDirectory: '/p',
  stdoutPath: '/p/.mq/logs/post-merge-poller.out.log',
  stderrPath: '/p/.mq/logs/post-merge-poller.err.log',
  environment: { PATH: '/usr/bin:/bin' },
}

function backend(ok: boolean): SchedBackend & { installed: SchedJob[] } {
  const installed: SchedJob[] = []
  return {
    installed,
    platform: 'launchd',
    unitPaths: () => ['/units/x.plist'],
    install: job => {
      installed.push(job)
      return { ok, verified: ok, messages: ok ? ['verified loaded'] : ['job did not load'] }
    },
    uninstall: () => ({ ok: true, verified: true, messages: [] }),
    status: () => ({ installed: true, loaded: ok, lastRunAt: null, detail: '' }),
  }
}

describe('fixHookRegistration (thin D8 wrapper)', () => {
  it('reports registrations and prerequisite skips from the primitive', () => {
    const res = fixHookRegistration('/p', {
      install: () => ({
        added: ['PreToolUse: scripts/mq-guard.sh (merge-queue routing guard)'],
        alreadyPresent: [],
        skipped: [{
          hook: 'bd-prime',
          reason: 'skipped SessionStart bd prime: .beads/ not found — run the beads step (bd init) first',
        }],
        settingsPath: '/p/.claude/settings.json',
        changed: true,
      }),
    })
    expect(res.ok).toBe(true)
    expect(res.messages.join('\n')).toContain('registered PreToolUse: scripts/mq-guard.sh')
    expect(res.messages.join('\n')).toContain('.beads/ not found')
  })
  it('reports already-current when nothing changed', () => {
    const res = fixHookRegistration('/p', {
      install: () => ({
        added: [], alreadyPresent: ['PostToolUse: gh pr create review reminder (mmr review)'],
        skipped: [], settingsPath: '/p/.claude/settings.json', changed: false,
      }),
    })
    expect(res.ok).toBe(true)
    expect(res.messages).toEqual(['all hook registrations already current'])
  })
  it('maps a primitive throw (malformed settings.json) to ok:false', () => {
    const res = fixHookRegistration('/p', {
      install: () => {
        throw new Error('.claude/settings.json is not a JSON object — refusing to modify it')
      },
    })
    expect(res.ok).toBe(false)
    expect(res.messages[0]).toContain('refusing to modify')
  })
})

describe('fixSchedulerReload (thin D6 wrapper)', () => {
  it('reload = backend.install — bootout||true + bootstrap + verify make it idempotent', () => {
    const be = backend(true)
    const res = fixSchedulerReload('/p', { backend: be, buildJob: () => JOB })
    expect(res.ok).toBe(true)
    expect(be.installed).toEqual([JOB])
    expect(res.messages).toEqual(['verified loaded'])
  })
  it('fails when the backend cannot verify the reload', () => {
    const res = fixSchedulerReload('/p', { backend: backend(false), buildJob: () => JOB })
    expect(res.ok).toBe(false)
    expect(res.messages.join('\n')).toContain('did not load')
  })
  it('fails cleanly when the job is not buildable (poller not installed)', () => {
    const res = fixSchedulerReload('/p', {
      backend: backend(true),
      buildJob: () => {
        throw new Error(
          'post-merge-poller.sh not found — install it first: scaffold agent-ops install --component merge-queue',
        )
      },
    })
    expect(res.ok).toBe(false)
    expect(res.messages[0]).toContain('agent-ops install --component merge-queue')
  })
})
